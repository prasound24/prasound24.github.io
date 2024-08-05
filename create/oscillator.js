// u''(x,t) - u_xx + k2*u' + k1*u = g(t)
export class StringOscillator {
  constructor({ width }) {
    this.k2 = 0.0;
    this.k1 = 0.0;
    this.g0 = 0.0;
    this.dt = 1.0;
    this.dx = 1.0;
    this.width = width;
    this.wave = new Float32Array(this.width);
    this.next = new Float32Array(this.width);
    this.prev = new Float32Array(this.width);
    this.diff2 = new Float32Array(this.width);
  }

  init(fn) {
    this.wave.fill(0);
    this.next.fill(0);
    this.prev.fill(0);
    for (let x = 0; x < this.width; x++)
      this.wave[x] = fn(x / this.width - 0.5);
  }

  update() {
    let n = this.width;
    let dt = this.dt, k2 = this.k2, k1 = this.k1, g0 = this.g0;
    let dt2 = dt * dt;
    let wave = this.wave, next = this.next, prev = this.prev;
    let d2 = this.diff2;
    let r1 = 1.0 - k2 * dt * 0.5;
    let r2 = 1.0 + k2 * dt * 0.5;

    this.comp_diff2(wave, d2);

    for (let x = 0; x < n; x++) {
      next[x] = (d2[x] * dt2 - prev[x] * r1
        + (2 + k1) * wave[x] - g0 * dt2) / r2;
    }

    this.prev = wave;
    this.wave = next;
    this.next = prev;
  }

  comp_diff2(src, res) {
    let n = this.width;
    let dx = this.dx;
    let dx2 = dx * dx;

    for (let x = 1; x < n - 1; x++)
      res[x] = ((src[x + 1] - src[x]) + (src[x - 1] - src[x])) / dx2;

    res[0] = ((src[1] - src[0]) + (src[n - 1] - src[0])) / dx2;
    res[n - 1] = ((src[0] - src[n - 1]) + (src[n - 2] - src[n - 1])) / dx2;
  }
}
