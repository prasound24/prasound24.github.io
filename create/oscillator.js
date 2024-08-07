// u''(x,t) - u_xx + k2*u' + k1*u = g(t)
export class StringOscillator {
  constructor({ width, height = 1 }) {
    this.k2 = 0.0;
    this.k1 = 0.0;
    this.g0 = 0.0;
    this.dt = 1.0;
    this.dx = 1.0;
    this.width = width;
    this.height = height;
    this.wave = new Float32Array(width * height);
    this.next = new Float32Array(width * height);
    this.prev = new Float32Array(width * height);
    this.diff2 = new Float32Array(width * height);
  }

  update() {
    let w = this.width, h = this.height;
    let dt = this.dt, k2 = this.k2, k1 = this.k1, g0 = this.g0;
    let dt2 = dt * dt, dx2 = this.dx * this.dx;
    let wave = this.wave, next = this.next, prev = this.prev;
    let d2 = this.diff2;
    let r1 = 1.0 - k2 * dt * 0.5;
    let r2 = 1.0 + k2 * dt * 0.5;

    this.comp_diff2(wave, d2);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let yx = y * w + x;
        next[yx] = (d2[yx] * (dt2 / dx2) - prev[yx] * r1
          + (2 + k1) * wave[yx] - g0 * dt2) / r2;
      }
    }

    this.prev = wave;
    this.wave = next;
    this.next = prev;
  }

  comp_diff2(src, res) {
    let w = this.width, h = this.height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let src_r = src[y * w + ((x + 1) & (w - 1))];
        let src_l = src[y * w + ((x - 1) & (w - 1))];
        let src_t = src[((y + 1) & (h - 1)) * w + x];
        let src_b = src[((y - 1) & (h - 1)) * w + x];
        res[y * w + x] = src_r + src_l + src_t + src_b - 4 * src[y * w + x];
      }
    }
  }
}
