import { dcheck } from './utils.js';
import { rgb2lab, lab2rgb } from './cielab.js';

let rgb = [0.1, 0.2, 0.3];
let lab = [20.4773, -0.64775, -18.6355];

let lab2 = rgb2lab(rgb);
let rgb2 = lab2rgb(lab2);

let d3 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);

console.log('rgb:', rgb);
console.log('lab:', lab);

console.log('rgb2:', rgb2);
console.log('lab2:', lab2);

dcheck(d3(lab, lab2) < 1e-4);
dcheck(d3(rgb, rgb2) < 1e-4);

let N = 1e6, ts = Date.now();
for (let i = 0; i < N; i++)
  rgb2lab(rgb);
console.log('rgb2lab:', ((Date.now() - ts) / N * 1e6).toFixed(0), 'ns / call');
ts = Date.now();
for (let i = 0; i < N; i++)
  lab2rgb(lab);
console.log('lab2rgb:', ((Date.now() - ts) / N * 1e6).toFixed(0), 'ns / call');