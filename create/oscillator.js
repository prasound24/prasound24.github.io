const clamp = (x, min, max) => Math.max(Math.min(x, max), min);

// https://en.wikipedia.org/wiki/Parametric_oscillator
// http://large.stanford.edu/courses/2007/ph210/pelc2
//
//  u_tt = u_xx - s*u_xxxx - d*u_t - f*u + g
// 
//  s(t) = stiffness
//  d(t) = damping
//  f(t) = frequency
//  g(t) = gravity
//
export class StringOscillator {
  constructor({ width }) {
    this.damping = 0.0;
    this.frequency = 0.0;
    this.gravity = 0.0;
    this.stiffness = 0.0;
    this.dt = 1.0;
    this.dx = 1.0;
    this.width = width;
    this.wave = new Float32Array(width);
    this.next = new Float32Array(width);
    this.prev = new Float32Array(width);
    this.wave_xx = new Float32Array(width);
    this.wave_xxxx = new Float32Array(width);
  }

  update() {
    let w = this.width;
    let dt = this.dt, k2 = this.damping, k1 = this.frequency, g0 = this.gravity;
    let k4 = this.stiffness;
    let dt2 = dt * dt, dx2 = this.dx * this.dx, dx4 = dx2 * dx2;
    let wave = this.wave, next = this.next, prev = this.prev;
    let d2 = this.wave_xx, d4 = this.wave_xxxx;
    let r1 = 1.0 - k2 * dt * 0.5;
    let r2 = 1.0 + k2 * dt * 0.5;

    laplacian(wave, d2);
    if (k4)
      laplacian(d2, d4);

    for (let x = 0; x < w; x++) {
      let sum = 0.0;

      sum += d2[x] * (dt2 / dx2);
      if (k4) sum -= k4 * d4[x] * (dt2 / dx4);
      sum -= prev[x] * r1;
      sum += (2 + k1) * wave[x];
      sum -= g0 * dt2;

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
