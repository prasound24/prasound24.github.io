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
    this.wave = new Float32Array(width);
    this.next = new Float32Array(width);
    this.prev = new Float32Array(width);
  }

  update(sig) {
    let n = this.width;
    let a = this.damping, c = this.stiffness;
    let h = this.dt;
    let w1 = this.wave, w2 = this.next, w0 = this.prev;
    let a0 = 1 - a * h / 2;
    let a2 = 1 + a * h / 2;
    let ch2 = c / (h * h);

    w1[0] = sig;
    if (c) w1[1] = sig;

    for (let x = 0; x < n; x++) {
      let l1 = w1[x > 0 ? x - 1 : n - 1];
      let r1 = w1[x < n - 1 ? x + 1 : 0];
      let sum = w0[x] * a0 - l1 - r1;
      if (c) {
        let l2 = w1[x > 1 ? x - 2 : x - 2 + n];
        let r2 = w1[x < n - 2 ? x + 2 : x + 2 - n];
        sum += ch2 * (l2 + r2 - 4 * (l1 + r1) + 6 * w1[x]);
      }
      w2[x] = clamp(-sum / a2, -10, +10);
    }

    this.prev = w1;
    this.wave = w2;
    this.next = w0;
  }
}
