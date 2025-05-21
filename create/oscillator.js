const clamp = (x, min, max) => Math.max(Math.min(x, max), min);

// https://en.wikipedia.org/wiki/Parametric_oscillator
// http://large.stanford.edu/courses/2007/ph210/pelc2
//
//  u_tt + a*u_t - u_xx + c*u_xxxx = f
//
export class StringOscillator {
  constructor(strlen) {
    this.damping = 0.0;
    this.stiffness = 0.0;
    this.dt = 1.0;
    this.strlen = strlen;
    this.string = new WaveFront(4, strlen);
  }

  get wave() {
    return this.string.get(0);
  }

  update(sigx) {
    let n = this.strlen;
    let a = this.damping; // c = this.stiffness;
    let h = this.dt;
    let wave = this.string.get(0);
    let next = this.string.get(1);
    let prev = this.string.get(-1);
    let a0 = 1 - a * h / 2;
    let a2 = 1 + a * h / 2;
    //let ch2 = c / (h * h);

    if (Number.isFinite(sigx))
      wave[0] = sigx;

    //if (c) wave[1] = sigx;

    for (let x = 0; x < n; x++) {
      let l = x > 0 ? x - 1 : n - 1;
      let r = x < n - 1 ? x + 1 : 0;
      let lx = wave[l];
      let rx = wave[r];
      let px = prev[x];
      let sx = px * a0 - (lx + rx);
      next[x] = clamp(-sx / a2, -3, +3);
    }

    this.string.iteration++;
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

