import * as webfft from './webfft.js';

const dcheck = (cond, msg = 'check failed') => { if (!cond) throw new Error(msg); };

const x1 = [3, 5];
const x2 = [1, 2, -3, 5];
const x3 = [1, 2, -3, 5, 0, -2];
const x4 = [1, 0, 2, -1, 0, -1, -1, 2];
const x5 = [1, 0, 2, -1, 0, -1, -1, 2, 2, 1];
const x8 = [2, -1, 3, 3, 0, -4, 2, 3, 4, -7, 5, 6, 4, -2, 1, 1];
const x16 = [4, -1, 0, -3, -2, -4, -5, 0, 5, -4, -3, -3, 1, -3, 1, 4, -1, 4, 4, -2, 4, -3, 3, 0, 0, -2, -5, 0, 3, 1, -3, 2];
const x17 = [...x16, ...x1];
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

console.log(':: fft inverse ::');
for (let x of [x4, x16]) {
  let y = new Float32Array(x);
  webfft.fft_1d(y);
  webfft.conjugate(y);
  webfft.fft_1d(y);
  webfft.conjugate(y);

  for (let i = 0; i < y.length; i++)
    if (Math.abs(y[i] - Math.round(y[i])) < 1e-6)
      y[i] = Math.round(y[i]);

  console.log([...x].join(' '));
  console.log([...y].join(' '));
}

console.log(':: bluestein fft ::');
for (let x of [x1, x2, x3, x4, x5, x8, x16, x17, x64, x1024]) {
  console.log('test:', x.length / 2 <= 8 ? zz2s(x) : x.length / 2);
  let y1 = basic_dft(new Float32Array(x));
  let y2 = new Float32Array(x.length);
  webfft.bluestein_fft_1d(x, y2);
  dcompare(y1, y2);
}

let samples2 = [x1, x2, x3, x4, x5, x8, x16, x17, x64];
for (let x of samples2) {
  for (let y of samples2) {
    let x0 = new Float32Array(x);
    let y1 = new Float32Array(y.length);
    let y2 = new Float32Array(y.length);
    basic_dft(x0, y1);
    webfft.bluestein_fft_1d(x0, y2);
    dcompare(y1, y2);
    // Parseval's theorem: sum |x[n]|^2 = sum |X[m]|^2
    dcheck(Math.abs(1 - dot(y1, y1) / dot(y2, y2)) < 1e-4);
  }
}

test('interpolate_1d', () => {
  let x = new Float32Array([1, 0, 1, 0, 1, 0, 2, 0, 2, 0, 2, 0]);
  let y = x.slice(0, 6);
  webfft.interpolate_1d(x, y);
  console.log('x:', zz2s(x));
  console.log('y:', zz2s(y));
});

console.log(':: fft perf ::');
for (let x of [x1M]) {
  let y1 = new Float32Array(x);
  let y2 = new Float32Array(x);

  time('fft_1d 1M', () => {
    webfft.fft_1d(y1);
  });

  time('bluestein_fft_1d 1M', () => {
    webfft.bluestein_fft_1d(y2, y2);
  });

  console.log('rel error:', Math.abs(1 - dot(y1, y1) / dot(y2, y2)).toExponential(2));
}

test('harmonic_conjugate', () => {
  let a = new Float32Array([1, 3, -7, 2, 5, -2, -4, 2, 0]);
  let a0 = a.reduce((s, x) => s + x, 0);
  dcheck(a0 == 0); // H(a) is defined up to a const
  let b = new Float32Array(a.length);
  let c = new Float32Array(a.length);
  console.log('a=', a);
  webfft.harmonic_conjugate(a, b, z => console.log('hc=', zz2s(z)));
  //console.log('b=', b);
  webfft.harmonic_conjugate(b, c, z => console.log('hc=', zz2s(z)));
  //console.log('H(a)=', b);
  //console.log('H(H(a))=', c);
  for (let i = 0; i < c.length; i++)
    c[i] *= -1;
  dcompare(a, c);
});

/// UTILS ///

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

// Arbitrary size DFT:
// a[0..N-1] -> b[0..M-1]
// b[m] = sum a[n]*exp(-2*PI*i/M*m*n) / sqrt(M)
// b[0] = sum a[n] / sqrt(M)
function basic_dft(a, b = a.slice(0), log = false) {
  let N = a.length / 2;
  let M = b.length / 2;
  b.fill(0);

  for (let m = 0; m < M; m++) {
    let step = -2 * Math.PI / M * m;

    for (let n = 0; n < N; n++) {
      let w0 = Math.cos(step * n);
      let w1 = Math.sin(step * n);
      let a0 = a[2 * n];
      let a1 = a[2 * n + 1];
      b[2 * m + 0] += a0 * w0 - a1 * w1;
      b[2 * m + 1] += a1 * w0 + a0 * w1;
    }
  }

  for (let i = 0; i < 2 * M; i++)
    b[i] /= Math.sqrt(M);
  return b;
}

function zz2s(a) {
  let n = a.length / 2;
  let x2s = (x) => x.toFixed(3).replace(/\.?0+$/, '')
  if (n == 1) {
    let s = x2s(a[0]) + (a[1] < 0 ? '' : '+') + x2s(a[1]) + 'j';
    s = s.replace(/^\-?0([-+]|$)/, '');
    s = s.replace(/[-+]0j$/, '');
    s = s.replace(/\b1j$/, 'j');
    s = s.replace(/\b0j$/, '0');
    return s || '0';
  }
  let b = [];
  for (let i = 0; i < n; i++)
    b.push(zz2s([a[2 * i], a[2 * i + 1]]));
  return '[' + b.join(', ') + ']';
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++)
    s += a[i] * b[i];
  return s;
}

function time(label, fn) {
  let t = Date.now();
  fn();
  console.log(label + ':', Date.now() - t, 'ms');
}

function test(name, fn) {
  console.log(':: ' + name + ' ::');
  fn();
}
