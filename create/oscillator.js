const clamp = (x, min, max) => Math.max(Math.min(x, max), min);

// https://en.wikipedia.org/wiki/Parametric_oscillator
// http://large.stanford.edu/courses/2007/ph210/pelc2
//
//  u_tt + a*u_t - u_xx + c*u_xxxx = f
//
export class StringOscillator {
  constructor({ width }) {
    this.damping = 0.0;
    this.stiffness = 0.0;
    this.dt = 1.0;
    this.width = width;
    this.transverse = new WaveFront(4, width);
  }

  get wave() {
    return this.transverse.get(0);
  }

  update(sig) {
    let n = this.width;
    let a = this.damping, c = this.stiffness;
    let h = this.dt;
    let wave = this.transverse.get(0);
    let next = this.transverse.get(1);
    let prev = this.transverse.get(-1);
    let a0 = 1 - a * h / 2;
    let a2 = 1 + a * h / 2;
    let ch2 = c / (h * h);

    wave[0] = sig;
    if (c) wave[1] = sig;

    for (let x = 0; x < n; x++) {
      let l1 = wave[x > 0 ? x - 1 : n - 1];
      let r1 = wave[x < n - 1 ? x + 1 : 0];
      let sum = prev[x] * a0 - l1 - r1;
      next[x] = clamp(-sum / a2, -3, +3);
    }

    this.transverse.iteration++;
  }
}

class WaveFront {
  constructor(k, n) {
    this.iteration = 0;
    this.w = [];
    for (let i = 0; i < k; i++)
      this.w[i] = new Float32Array(n);
  }

  get(i) {
    let n = this.w.length;
    let i0 = this.iteration;
    return this.w[i + i0 & n - 1];
  }
}

