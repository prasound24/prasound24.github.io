// Computes in-place the unitary complex-valued DFT.
export function fft_1d(a) {
  let n = a.length / 2;
  fft_bit_reversal(a, n);

  for (let s = 2; s <= n; s *= 2)
    fft_update(a, n, s);

  fft_make_unitary(a, n);
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
    if (i >= j)
      continue;
    // swap a[i], a[j]
    let x0 = a[2 * i];
    let x1 = a[2 * i + 1];
    a[2 * i + 0] = a[2 * j];
    a[2 * i + 1] = a[2 * j + 1];
    a[2 * j + 0] = x0;
    a[2 * j + 1] = x1;
  }
}

function fft_make_unitary(a, n) {
  let scale = Math.sqrt(1 / n);
  for (let i = 0; i < 2 * n; i++)
    a[i] *= scale;
}
