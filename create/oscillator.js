const clamp = (x, min, max) => Math.max(Math.min(x, max), min);

// https://en.wikipedia.org/wiki/Parametric_oscillator
// http://large.stanford.edu/courses/2007/ph210/pelc2
//
//  u_tt = u_xx - d*u_t
//
export class StringOscillator {
  constructor({ width }) {
    this.damping = 0.0;
    this.dt = 1.0;
    this.dx = 1.0;
    this.width = width;
    this.wave = new Float32Array(width);
    this.next = new Float32Array(width);
    this.prev = new Float32Array(width);
    this.wave_xx = new Float32Array(width);
  }

  update() {
    let w = this.width;
    let dt = this.dt, k2 = this.damping;
    let dt2 = dt * dt, dx2 = this.dx * this.dx;
    let wave = this.wave, next = this.next, prev = this.prev;
    let wave_xx = this.wave_xx;
    let r1 = 1.0 - k2 * dt * 0.5;
    let r2 = 1.0 + k2 * dt * 0.5;

    laplacian(wave, wave_xx);

    for (let x = 0; x < w; x++) {
      let sum = 0.0;

      sum += wave_xx[x] * (dt2 / dx2);
      sum -= prev[x] * r1;
      sum += 2 * wave[x];

      next[x] = clamp(sum / r2, -1000, +1000);
    }

    this.prev = wave;
    this.wave = next;
    this.next = prev;
  }
}

function laplacian(src, res) {
  let n = src.length;

  for (let x = 0; x < n; x++) {
    let c = src[x];
    let e = src[(x + 1 + n) % n];
    let w = src[(x - 1 + n) % n];
    res[x] = e + w - 2 * c;
  }
}
