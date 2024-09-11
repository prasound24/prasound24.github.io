const dcheck = (x) => { if (x) return; debugger; throw new Error('dcheck'); };

export function fft_2d(a, n) {
  // Square only: transposing in-place a NxM matrix is a hard problem:
  // https://en.wikipedia.org/wiki/In-place_matrix_transposition
  dcheck(a.length == n * n * 2);
  fft_rows(a, n, n);
  fft_transpose(a, n);
  fft_rows(a, n, n);
  fft_transpose(a, n);
}

export function fft_2d_inverse(a, n) {
  fft_conjugate(a);
  fft_2d(a, n);
  fft_conjugate(a);
}

// Computes in-place the unitary complex-valued DFT.
export function fft_1d(a) {
  dcheck(a.length % 2 == 0);
  let n = a.length / 2;
  fft_bit_reversal(a, n);

  for (let s = 2; s <= n; s *= 2)
    fft_update(a, n, s);

  fft_make_unitary(a, n);
}

export function fft_1d_inverse(a) {
  fft_conjugate(a);
  fft_1d(a, n);
  fft_conjugate(a);
}

function fft_conjugate(a) {
  dcheck(a.length % 2 == 0);
  for (let i = 1; i < a.length; i += 2)
    a[i] *= -1;
}

function fft_update(a, n, s) {
  let phi = 2 * Math.PI / s; // -phi for inverse FFT
  let es0 = Math.cos(phi); // e = -1 for s = 2
  let es1 = Math.sin(phi); // e = +i for s = 4

  // updates a[0..s-1], a[s..2s-1], ...
  for (let i = 0; i < n; i += s) {
    let w0 = 1, w1 = 0; // w = exp(i2PI/s)^j

    // updates a[i..i+s-1]
    for (let j = 0; j < s / 2; j++) {
      let u = i + j;
      let v = i + j + s / 2;

      let u0 = a[u * 2];
      let u1 = a[u * 2 + 1];

      let v0 = a[v * 2];
      let v1 = a[v * 2 + 1];

      let vw0 = v0 * w0 + v1 * w1;
      let vw1 = v1 * w0 - v0 * w1;

      a[u * 2 + 0] = u0 + vw0;
      a[u * 2 + 1] = u1 + vw1;

      a[v * 2 + 0] = u0 - vw0;
      a[v * 2 + 1] = u1 - vw1;

      let we0 = w0 * es0 - w1 * es1;
      let we1 = w0 * es1 + w1 * es0;
      w0 = we0;
      w1 = we1;
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

function fft_make_unitary(a, n) {
  let scale = Math.sqrt(1 / n);
  for (let i = 0; i < 2 * n; i++)
    a[i] *= scale;
}

function fft_rows(a, n, m) {
  dcheck(a.length == 2 * n * m);
  for (let i = 0; i < n; i++)
    fft_1d(a.subarray(i * m * 2, (i + 1) * m * 2));
}

function fft_transpose(a, n) {
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

