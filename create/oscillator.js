// u''(x,t) - u_xx + damping(t)*u' + driving(t)*u = gravity(t)
export class StringOscillator {
  constructor({ width }) {
    this.damping = 0.0;
    this.driving = 0.0;
    this.gravity = 0.0;
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
    let dt = this.dt, k2 = this.damping, k1 = this.driving, g0 = this.gravity;
    let dt2 = dt * dt, dx2 = this.dx * this.dx;
    let wave = this.wave, next = this.next, prev = this.prev;
    let d2 = this.wave_xx;
    let r1 = 1.0 - k2 * dt * 0.5;
    let r2 = 1.0 + k2 * dt * 0.5;

    this.comp_diff_xx(wave, d2);

    for (let x = 0; x < w; x++) {
      next[x] = (d2[x] * (dt2 / dx2) - prev[x] * r1
        + (2 + k1) * wave[x] - g0 * dt2) / r2;
    }

    this.prev = wave;
    this.wave = next;
    this.next = prev;
  }

  comp_diff_xx(src, res) {
    let w = this.width;

    for (let x = 0; x < w; x++) {
      let src_r = src[(x + 1) & (w - 1)];
      let src_l = src[(x - 1) & (w - 1)];
      res[x] = src_r + src_l - 2 * src[x];
    }
  }
}
