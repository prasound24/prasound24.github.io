import * as webfft from './webfft.js';

const dcheck = (cond, msg = 'check failed') => { if (!cond) throw new Error(msg); };

const x1 = [3, 5];
const x2 = [1, 2, -3, 5];
const x4 = [1, 0, 2, -1, 0, -1, -1, 2];
const x8 = [2, -1, 3, 3, 0, -4, 2, 3, 4, -7, 5, 6, 4, -2, 1, 1];
const x16 = [4, -1, 0, -3, -2, -4, -5, 0, 5, -4, -3, -3, 1, -3, 1, 4, -1, 4, 4, -2, 4, -3, 3, 0, 0, -2, -5, 0, 3, 1, -3, 2];
const x64 = [-8, -1, -9, 7, 9, -6, 0, -2, 1, 8, 1, 9, 9, 2, 0, 9, -7, -7, 5, -7, -8, 5, 0, 10, -6, -5, -3, -3, 9, -5, -2, 5, 8, 1, 7, -2, -10, -7, -6, 5, 4, 6, 6, 10, 1, 10, -9, 0, 9, 6, -2, 10, -5, -10, 8, -1, 6, 2, 8, -8, -5, 0, 3, -5, 10, -7, 3, 1, -7, 3, 3, 8, 9, 2, -2, -9, 10, 7, 1, -5, 6, 8, -8, 4, 3, 1, 1, -7, -8, -2, 5, 4, -6, 8, -9, -10, -2, 3, -6, 4, 0, 0, -1, 3, -2, -6, 9, 1, 5, 0, 0, -7, 2, 8, 9, -1, -5, 5, -1, -9, 7, 2, -6, -2, 1, -2, -7, -5];
const x1024 = rand_array(1024 * 2);
const x1M = rand_array(1024 * 1024 * 2);

console.log(':: fft ::');
for (let x of [x1, x2, x4, x8, x16, x64, x1024]) {
  console.log('test:', x.length / 2 <= 8 ? x.join(', ') : x.length / 2);
  let y1 = basic_dft(new Float32Array(x));
  let y2 = new Float32Array(x);
  webfft.fft_1d(y2);
  dcompare(y1, y2);
}

console.log(':: fft perf ::');
for (let x of [x1024]) {
  console.log('test:', x.length / 2);
  let y = new Float32Array(x.length);
  let t = Date.now();
  let n = 2 * 1024, m = 30;
  for (let i = 0; i < n * m; i++) {
    y.set(x);
    webfft.fft_1d(y);
  }
  console.log(((Date.now() - t) / m).toFixed(1), 'ms');
}

function dcompare(need, have, eps = 1e-4) {
  dcheck(need.length == have.length);
  for (let i = 0; i < need.length; i++)
    dcheck(Math.abs(need[i] - have[i]) / need.length < eps, need[i] + ' != ' + have[i]);
}

function rand_array(n) {
  let a = new Float32Array(n);
  for (let i = 0; i < n; i++)
    a[i] = Math.round(Math.random() * 20) - 10;
  return a;
}

function basic_dft(a, b = a.slice(0)) {
  let n = a.length / 2;
  b.fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let phi = -2 * Math.PI / n * i * j;
      let w0 = Math.cos(phi);
      let w1 = Math.sin(phi);
      let a0 = a[2 * j];
      let a1 = a[2 * j + 1];
      b[2 * i + 0] += a0 * w0 - a1 * w1;
      b[2 * i + 1] += a0 * w1 + a1 * w0;
    }
  }

  for (let i = 0; i < 2 * n; i++)
    b[i] /= Math.sqrt(n);

  return b;
}
