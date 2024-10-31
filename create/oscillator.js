const clamp = (x, min, max) => Math.max(Math.min(x, max), min);

// https://en.wikipedia.org/wiki/Parametric_oscillator
// http://large.stanford.edu/courses/2007/ph210/pelc2
//
//  u_tt = u_xx - d*u_t
//
export class StringOscillator {
  constructor({ width }) {
    this.damping = 0.0;
    this.width = width;
    this.wave = new Float32Array(width);
    this.next = new Float32Array(width);
    this.prev = new Float32Array(width);
  }

  update() {
    // dx = dt = 1.0
    //
    //        1+d/2
    //  -1      0     -1
    //        1-d/2
    //
    // u_tt - u_xx + d*u_t = 0

    let n = this.width;
    let d = this.damping;
    let w1 = this.wave, w2 = this.next, w0 = this.prev;
    let d0 = 1 - d / 2;
    let d2 = 1 + d / 2;

    for (let x = 0; x < n; x++) {
      let l = x ? x - 1 : n - 1;
      let r = x < n - 1 ? x + 1 : 0;

      let sum = w0[x] * d0 - w1[l] - w1[r];
      w2[x] = clamp(-sum / d2, -1000, +1000);
    }

    this.prev = w1;
    this.wave = w2;
    this.next = w0;
  }
}
