const dcheck = (x) => { if (x) return; debugger; throw new Error('dcheck'); };

// Computes in-place the unitary complex-valued DFT.
export function fft_2d(a, n) {
  // Square only: transposing in-place a NxM matrix is a hard problem:
  // https://en.wikipedia.org/wiki/In-place_matrix_transposition
  dcheck(a.length == n * n * 2);
  dcheck((n & (n - 1)) == 0);
  fft_rows(a, n, n);
  transpose(a, n);
  fft_rows(a, n, n);
  transpose(a, n);
}

export function fft_2d_inverse(a, n) {
  conjugate(a);
  fft_2d(a, n);
  conjugate(a);
}

// Computes in-place the unitary complex-valued DFT.
export function fft_1d(a, n = a.length / 2) {
  dcheck(n * 2 == a.length);
  
  if ((n & (n - 1)) != 0) {
    bluestein_fft_1d(a, a);
    return;
  }

  fft_bit_reversal(a, n);
  for (let s = 2; s <= n; s *= 2)
    fft_update(a, n, s);
  mul_const(a, 1 / Math.sqrt(n));
}

export function fft_1d_inverse(a) {
  conjugate(a);
  fft_1d(a);
  conjugate(a);
}

export function interpolate_1d(a, b) {
  let n = a.length, m = b.length;
  dcheck(n % 1 == 0 && m % 1 == 0);
  if (n == m) return;

  fft_1d(a);

  if (m > n) {
    b.set(a.subarray(0, n / 2));
    b.set(a.subarray(n / 2), -n / 2 + m);
  } else {
    b.set(a.subarray(0, m / 2));
    b.set(a.subarray(-m / 2 + n), m / 2);
  }

  fft_1d_inverse(b);
  mul_const(b, Math.sqrt(b.length / a.length));
}

export function interpolate_1d_re(a, b) {
  let n = a.length, m = b.length;
  let aa = new Float32Array(n * 2);
  let bb = new Float32Array(m * 2);
  for (let i = 0; i < n; i++)
    aa[2 * i] = a[i];
  interpolate_1d(aa, bb);
  for (let i = 0; i < m; i++)
    b[i] = bb[2 * i];
}

// https://en.wikipedia.org/wiki/Analytic_signal
export function analytic_signal(re, aa = new Float32Array(2 * re.length)) {
  let n = re.length;
  dcheck(aa.length == 2 * n);
  for (let i = 0; i < n; i++)
    aa[2 * i] = re[i];
  bluestein_fft_1d(aa, aa);
  //mul_const(aa, n ** 0.5);
  let m = (n - 1) / 2 | 0;
  mul_const(aa.subarray(2, 2 + m * 2), 2);
  aa.subarray(-m * 2).fill(0);
  bluestein_fft_1d(aa, aa, -1);
  //mul_const(aa, 1 / n ** 0.5);
  return aa;
}

// https://en.wikipedia.org/wiki/Analytic_signal
export function harmonic_conjugate(re, im = new Float32Array(re.length), log) {
  let n = re.length;
  dcheck(im.length == n);
  let aa = new Float32Array(n * 2);
  for (let i = 0; i < n; i++)
    aa[2 * i] = re[i];

  bluestein_fft_1d(aa, aa);
  mul_const(aa, n ** 0.5);
  //log && log(aa);

  // n=9: 0 +1 +2 +3 +4 -4 -3 -2 -1
  // n=8: 0 +1 +2 +3 -4 -3 -2 -1
  let m = (n - 1) / 2 | 0;
  // H(a) is defined up to a const
  aa[0] = aa[1] = 0;
  // H([1, -1, 1, -1, ...]) is undefined
  if (n % 2 == 0)
    aa[n] = aa[n + 1] = 0;

  mul_const2(aa.subarray(2, 2 + m * 2), [0, -1]);
  mul_const2(aa.subarray(-m * 2), [0, +1]);
  //log && log(aa);

  bluestein_fft_1d(aa, aa, -1);
  mul_const(aa, 1 / n ** 0.5);
  //log && log(aa);

  for (let i = 0; i < n; i++)
    im[i] = aa[2 * i];
  return im;
}

// https://en.wikipedia.org/wiki/Chirp_Z-transform#Bluestein.27s_algorithm
// https://www.nayuki.io/res/free-small-fft-in-multiple-languages/fft.py
// Arbitrary size DFT: b = fft(a), len(b) != len(a) != 2**p
// Cost: 6 x fft_1d
export function bluestein_fft_1d(a, b, dir = +1) {
  let n = a.length / 2, m = b.length / 2;
  dcheck(n % 1 == 0 && m % 1 == 0);
  let nm = Math.max(n, m);
  let k = 2 ** Math.ceil(Math.log2(2 * nm - 1));
  let aa = new Float32Array(k * 2);
  let bb = new Float32Array(k * 2);
  let chirp = new Float32Array(k * 2);

  chirp_init(chirp, k, m);
  if (dir < 0) conjugate(chirp);

  aa.set(a);
  mul2(aa.subarray(0, 2 * n), chirp);

  bb.set(chirp.subarray(0, 2 * nm));
  for (let i = 0; i < nm; i++) {
    bb[(k - i) * 2 + 0] = bb[i * 2 + 0];
    bb[(k - i) * 2 + 1] = bb[i * 2 + 1];
  }

  conjugate(bb);
  conv_1d(aa, bb); // b2 = conv(a2, b2)
  b.set(bb.subarray(0, m * 2));
  mul2(b, chirp);
  mul_const(b, 1 / Math.sqrt(m));
}

// z[m] = exp(-i*PI/M*m^2)
function chirp_init(z, k, M) {
  dcheck(z.length == k * 2);

  // Simpler, but cos/sin are too slow:
  // for (let m = 0; m < k; m++) {
  //   let phi = -Math.PI / M * m * m;
  //   z[2 * m + 0] = Math.cos(phi);
  //   z[2 * m + 1] = Math.sin(phi);
  // }

  // z[0] = 1, z[1] = exp(-i*PI/M)
  // u[m] = z[m]/z[m-1] = exp(-i*PI/M*(2m-1))
  // u[0] = z[1]*, u[1] = z[1]
  // u[m]/u[m-1] = exp(-i*PI/M*2) = z[1]^2 = v

  let e0 = Math.cos(-Math.PI / M);
  let e1 = Math.sin(-Math.PI / M);

  if (k <= 2) {
    z[0] = 1, z[1] = 0;
    if (k == 2)
      z[2] = e0, z[3] = e1;
    return;
  }

  let v0 = Math.cos(-2 * Math.PI / M);
  let v1 = Math.sin(-2 * Math.PI / M);

  z[0] = e0, z[1] = -e1;

  for (let m = 1; m < k; m++) {
    let z0 = z[2 * m - 2];
    let z1 = z[2 * m - 1];
    z[2 * m + 0] = z0 * v0 - z1 * v1;
    z[2 * m + 1] = z0 * v1 + z1 * v0;
    // prevent accumulation of rounding errors
    if (m % 64 == 0) {
      let phi = -Math.PI / M * (2 * m - 1);
      z[2 * m + 0] = Math.cos(phi);
      z[2 * m + 1] = Math.sin(phi);
    }
  }

  // at this point z[m] = u[m] = z1^(2m-1)

  z[0] = 1, z[1] = 0;

  for (let m = 1; m < k; m++) {
    let u0 = z[2 * m - 2];
    let u1 = z[2 * m - 1];
    let z0 = z[2 * m + 0];
    let z1 = z[2 * m + 1];
    z[m * 2 + 0] = z0 * u0 - z1 * u1;
    z[m * 2 + 1] = z0 * u1 + z1 * u0;
    // prevent accumulation of rounding errors
    if (m % 64 == 0) {
      let phi = -Math.PI / M * m * m;
      z[2 * m + 0] = Math.cos(phi);
      z[2 * m + 1] = Math.sin(phi);
    }
  }
}

// b = conv(a, b), len(a) = len(b) = 2**p
function conv_1d(a, b) {
  let n = a.length / 2;
  dcheck(b.length / 2 == n);
  fft_1d(a);
  fft_1d(b);
  mul2(b, a);
  fft_1d_inverse(b);
  mul_const(b, n ** 0.5);
}

function mul_const(a, c) {
  for (let i = 0; i < a.length; i++)
    a[i] *= c;
}

export function mul_const2(a, [re, im]) {
  dcheck(a.length % 2 == 0);
  for (let i = 0; i < a.length / 2; i++) {
    let p = a[2 * i + 0];
    let q = a[2 * i + 1];
    a[2 * i + 0] = p * re - q * im;
    a[2 * i + 1] = p * im + q * re;
  }
}

// a[0..n-1] = a[0..n-1] * b[0..n-1]
function mul2(a, b, n = Math.min(a.length, b.length) / 2) {
  for (let i = 0; i < n; i++) {
    let p0 = b[i * 2];
    let p1 = b[i * 2 + 1];
    let q0 = a[i * 2];
    let q1 = a[i * 2 + 1];
    a[i * 2 + 0] = p0 * q0 - p1 * q1;
    a[i * 2 + 1] = p0 * q1 + p1 * q0;
  }
}

export function conjugate(a) {
  dcheck(a.length % 2 == 0);
  for (let i = 1; i < a.length; i += 2)
    a[i] *= -1;
}

function fft_update(a, n, s) {
  let phi = 2 * Math.PI / s; // -phi for inverse FFT
  let e0 = Math.cos(phi), e1 = Math.sin(phi);

  // updates a[0..s-1], a[s..2s-1], ...
  for (let i = 0; i < n; i += s) {
    let w0 = 1, w1 = 0; // w = exp(2*PI*i/s)^j

    // updates a[i..i+s-1]
    for (let j = 0; j < s / 2; j++) {
      let u = i + j, v = i + j + s / 2;
      let u0 = a[u * 2], u1 = a[u * 2 + 1];
      let v0 = a[v * 2], v1 = a[v * 2 + 1];

      let vw0 = v0 * w0 + v1 * w1;
      let vw1 = v1 * w0 - v0 * w1;

      a[u * 2 + 0] = u0 + vw0;
      a[u * 2 + 1] = u1 + vw1;

      a[v * 2 + 0] = u0 - vw0;
      a[v * 2 + 1] = u1 - vw1;

      let we0 = w0 * e0 - w1 * e1;
      let we1 = w0 * e1 + w1 * e0;
      w0 = we0, w1 = we1;
    }
  }
}

// https://graphics.stanford.edu/~seander/bithacks.html#BitReverseObvious
function fft_bit_reversal(a, n) {
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1;
    while (j >= b)
      j -= b, b >>= 1;
    j += b;
    if (i < j)
      swap(a, i, j);
  }
}

function fft_rows(a, n, m) {
  dcheck(a.length == 2 * n * m);
  for (let i = 0; i < n; i++)
    fft_1d(a.subarray(i * m * 2, (i + 1) * m * 2));
}

function transpose(a, n) {
  dcheck(a.length == 2 * n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      swap(a, i * n + j, j * n + i);
}

function swap(a, i, j) {
  let x0 = a[2 * i];
  let x1 = a[2 * i + 1];
  a[2 * i + 0] = a[2 * j];
  a[2 * i + 1] = a[2 * j + 1];
  a[2 * j + 0] = x0;
  a[2 * j + 1] = x1;
}

