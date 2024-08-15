// Standalone WebFFT library.

import { GpuTransformProgram, GpuFrameBuffer } from "./webgl2.js";

// Cooley-Tukey FFT algorithm.
export class FFT {
  static get(size) {
    let fft = FFT.instances.get(size);
    if (!fft) {
      fft = new FFT(size);
      FFT.instances.set(size, fft);
    }
    return fft;
  }

  static forward(src, res = src.slice(0)) {
    let n = src.length / 2;
    let fft = FFT.get(n);
    fft.transform(src, res);
    return res;
  }

  static inverse(src, res = src.slice(0)) {
    let n = src.length / 2;
    let fft = FFT.get(n);
    fft.inverse(src, res);
    return res;
  }

  static conjugate(src) {
    let n = src.length / 2;
    for (let i = 0; i < n; i++)
      src[2 * i + 1] *= -1;
  }

  static expand(src, res = new Float32Array(src.length * 2)) {
    for (let i = 0; i < src.length; i++) {
      res[2 * i] = src[i];
      res[2 * i + 1] = 0;
    }
    return res;
  }

  static re(src, res = new Float32Array(src.length / 2)) {
    for (let i = 0; i < res.length; i++)
      res[i] = src[2 * i];
    return res;
  }

  static im(src, res = new Float32Array(src.length / 2)) {
    for (let i = 0; i < res.length; i++)
      res[i] = src[2 * i + 1];
    return res;
  }

  static abs(src, res) {
    let n = src.length / 2;
    res = res || src.slice(0, n);

    for (let i = 0; i < n; i++) {
      let re = src[2 * i];
      let im = src[2 * i + 1];
      res[i] = Math.sqrt(re * re + im * im);
    }

    return res;
  }

  static sqr_abs(src, res) {
    let n = src.length / 2;
    res = res || src.slice(0, n);

    for (let i = 0; i < n; i++) {
      let re = src[2 * i];
      let im = src[2 * i + 1];
      res[i] = re * re + im * im;
    }

    return res;
  }

  // res[i] = -pi..pi
  static phase(src, res) {
    let n = src.length / 2;
    res = res || src.slice(0, n);

    for (let i = 0; i < n; i++) {
      let re = src[2 * i];
      let im = src[2 * i + 1];
      let len = Math.sqrt(re * re + im * im);
      let arg = len > 0 ? Math.sign(im) * Math.acos(re / len) : 0;
      res[i] = arg;
    }

    return res;
  }

  static sqr_abs_reim(src, res = src.slice(0)) {
    let n = src.length / 2;

    for (let i = 0; i < n; i++) {
      let re = src[2 * i];
      let im = src[2 * i + 1];
      res[2 * i] = re * re + im * im;
      res[2 * i + 1] = 0;
    }

    return res;
  }

  static dot(src1, src2, res = src1.slice(0)) {
    let n = res.length / 2;

    for (let i = 0; i < n; i++) {
      let re1 = src1[2 * i + 0];
      let im1 = src1[2 * i + 1];
      let re2 = src2[2 * i + 0];
      let im2 = src2[2 * i + 1];
      res[2 * i + 0] = re1 * re2 - im1 * im2;
      res[2 * i + 1] = re1 * im2 + re2 * im1;
    }

    return res;
  }

  static exp(size, freq, shift = 0, res = new Float32Array(2 * size)) {
    for (let k = 0; k < size; k++) {
      res[2 * k + 0] = Math.cos(freq * (k - shift));
      res[2 * k + 1] = Math.sin(freq * (k - shift));
    }
    return res;
  }

  static gaussian(size, sigma, shift = 0, res = new Float32Array(2 * size)) {
    for (let k = 0; k < size; k++) {
      let x = k < size / 2 ? k : k - size;
      res[2 * k + 0] = Math.exp(-0.5 * ((x - shift) / sigma) ** 2);
      res[2 * k + 1] = 0;
    }
    return res;
  }

  static map(src, fn, res = src) {
    let n = src.length / 2;

    for (let i = 0; i < n; i++) {
      let re = src[2 * i];
      let im = src[2 * i + 1];
      [re, im] = fn(re, im);
      res[2 * i] = re;
      res[2 * i + 1] = im;
    }

    return res;
  }

  static shift(src, res = src.slice(0), phase = -1 / 2) {
    let n = src.length / 2;

    for (let i = 0; i < n; i++) {
      let re = src[2 * i];
      let im = src[2 * i + 1];
      let e_re = Math.cos(2 * Math.PI * i / n * phase);
      let e_im = Math.sin(2 * Math.PI * i / n * phase);
      res[2 * i] = re * e_re - im * e_im;
      res[2 * i + 1] = re * e_im + im * e_re;
    }

    return res;
  }

  static normalize(res) {
    let n = res.length / 2;
    let n_rsqrt = 1 / Math.sqrt(n);
    for (let i = 0; i < 2 * n; i++)
      res[i] *= n_rsqrt;
  }

  static revidx(size) {
    let revidx = FFT.revidxcache.get(size);
    if (revidx) return revidx;

    revidx = new Int32Array(size);
    FFT.revidxcache.set(size, revidx);

    for (let k = 0; k < size; k++) {
      let r = 0;
      for (let i = 0; (1 << i) < size; i++)
        r = (r << 1) | (k >> i) & 1;
      revidx[k] = r;
    }

    return revidx;
  }

  constructor(size, { webgl } = {}) {
    if (!Number.isFinite(size) || size < 2 || (size & (size - 1)))
      throw new Error('FFT: ' + size + ' != 2**k');

    this.size = size;
    this.webgl = webgl;
    this.revidx = FFT.revidx(size);
    this.uroots = !this.webgl && new Float32Array(2 * size);

    if (this.uroots) {
      // uroots[k] = exp(2*pi*k/n)
      for (let k = 0; k < size; k++) {
        let a = 2 * Math.PI * k / size;
        this.uroots[2 * k] = Math.cos(a);
        this.uroots[2 * k + 1] = Math.sin(a);
      }
    }

    if (webgl) {
      this.shader = new GpuFFT(webgl, {
        size: this.size,
      });
    }
  }

  bit_reverse(src, res) {
    let n = this.size;

    // both src and res contain N x (re, im) pairs
    if (src.length != 2 * n || res.length != 2 * n)
      throw new Error('DFT: wrong input/output size');

    for (let i = 0; i < n; i++) {
      let r = this.revidx[i];
      res[r * 2 + 0] = src[i * 2 + 0];
      res[r * 2 + 1] = src[i * 2 + 1];
    }
  }

  inverse(src, res) {
    FFT.conjugate(src);
    this.transform(src, res);
    FFT.conjugate(src);
    FFT.conjugate(res);
  }

  // Computes the unitary complex-valued DFT.
  transform(src, res) {
    if (this.webgl) {
      this.transform_gpu(src, res);
      return;
    }

    let n = this.size;
    this.bit_reverse(src, res);

    // DSP Guide, Chapter 12: The Fast Fourier Transform
    // dspguide.com/ch12/2.htm
    for (let s = 2; s <= n; s *= 2) {
      for (let k = 0; k < s / 2; k++) {
        let kth = n / s * k; // 0..n/2

        // exp(2*pi*i/N)^k
        let cos = this.uroots[kth * 2];
        let sin = this.uroots[kth * 2 + 1];

        for (let j = 0; j < n / s; j++) {
          let u = j * s + k;
          let v = u + s / 2;

          // E[k] - even
          let v_re = res[u * 2];
          let v_im = res[u * 2 + 1];

          // O[k] - odd
          let u_re = res[v * 2];
          let u_im = res[v * 2 + 1];

          // O[k] * exp(-2*pi*i/N)^k
          let t_re = u_re * cos + u_im * sin;
          let t_im = u_im * cos - u_re * sin;

          // E[k] + O[k] * exp(...) = X[k]
          res[u * 2 + 0] = v_re + t_re;
          res[u * 2 + 1] = v_im + t_im;

          // E[k] - O[k] * exp(...) = X[k + s/2]
          res[v * 2 + 0] = v_re - t_re;
          res[v * 2 + 1] = v_im - t_im;
        }
      }
    }

    FFT.normalize(res); // make the DFT unitary
  }

  // Same as transform(), but on GPU.
  transform_gpu(src, res) {
    if (res instanceof GpuFrameBuffer) {
      this.shader.exec({ uInput: src }, res);
    } else {
      this.shader.exec({ uInput: src });
      this.shader.output.download(res);
    }
  }
}

FFT.instances = new Map; // FF doesn't support static fields
FFT.revidxcache = new Map;

// https://en.wikipedia.org/wiki/Autocorrelation
export class AutoCF {
  constructor(fft) {
    this.fft = fft;
    this.sqr = new Float32Array(2 * fft.size);
  }

  transform(src, res = src.slice(), mask = null) {
    let fft = this.fft;
    let sqr = this.sqr;
    fft.transform(src, res);
    FFT.sqr_abs_reim(res, sqr);
    mask && FFT.dot(mask, sqr, sqr);
    fft.inverse(sqr, res);
    return res;
  }
}

export class GpuFFT extends GpuTransformProgram {
  constructor(webgl, { size, width, height, layout }) {
    super(webgl);

    if (size) {
      // FFT size = width * height, i.e. FFT input
      // with 1M (re, im) pairs is represented as a
      // 1024 x 1024 texture with 2 channels.
      width = 2 ** Math.ceil(Math.log2(size) / 2);
      height = 2 ** Math.floor(Math.log2(size) / 2);
    }

    this.webgl = webgl;
    this.width = width;
    this.height = height;
    this.layout = layout;

    this.texture1 = new GpuFrameBuffer(webgl, { width, height, channels: 2 });
    this.texture2 = new GpuFrameBuffer(webgl, { width, height, channels: 2 });

    this.texRevIdx = !layout ?
      this.initTexRevIdxCompact() :
      this.initTexRevIdxFlat();

    this.shader_utils = `
      const int TW = ${width};
      const int TH = ${height};
      const ivec2 WH = ivec2(TW, TH);
      const float PI = ${Math.PI};
      const int N = 
        ${layout == 'rows'} ? TW : 
        ${layout == 'cols'} ? TH :
        TW * TH;

      // exp(2*PI*i/n)^k
      vec2 kth_root(int k, int n) {
        float w = 2.0 * PI * float(k) / float(n);
        return vec2(cos(w), sin(w));
      }

      int eindex(ivec2 vTexN) {
        if (${layout == 'rows'}) return vTexN.x;
        if (${layout == 'cols'}) return vTexN.y;
        return vTexN.x + TW * vTexN.y;
      }

      ivec2 ecoords(int i) {
        if (${layout == 'rows'}) return ivec2(i, int(vTex.y * float(TH) - 0.5));
        if (${layout == 'cols'}) return ivec2(int(vTex.x * float(TW) - 0.5), i);
        return ivec2(i % TW, i / TW);
      }

      vec2 element(int i) {
        return texelFetch(uInput, ecoords(i), 0).xy;
      }

      vec2 multiply(vec2 u, vec2 v) {
        float re = u.x * v.x - u.y * v.y;
        float im = u.x * v.y + u.y * v.x;
        return vec2(re, im);
      }
    `;

    this.init({
      fshader: `
        in vec2 vTex;

        uniform sampler2D uInput;
        uniform int uScale; // 2, 4, 8, .., n

        ${this.shader_utils}

        void main() {
          int i = eindex(ivec2(vTex * vec2(WH) - 0.5));
          int s = uScale;
          int j = i / s;
          int k = i % (s / 2);
  
          vec2 u = element(j * s + k);         // E[k] = even
          vec2 v = element(j * s + k + s / 2); // O[k] = odd
          vec2 t = multiply(v, kth_root(N / s * k, N));
  
          // E[k] + O[k] * exp(...) = X[k]
          // E[k] - O[k] * exp(...) = X[k + s/2]
          float sign = i % s < s / 2 ? +1.0 : -1.0;

          v_FragColor = vec4(u + sign * t, 0.0, 0.0);
        }
      `,
    });

    this.reverser = new GpuTransformProgram(webgl, {
      fshader: `
        in vec2 vTex;

        uniform sampler2D uInput;
        uniform sampler2D uRevIdx;
        uniform bool uInverseFFT;

        const vec2 N_WH = vec2(${width}.0, ${height}.0);

        ivec2 revidx(int x, int y) {
          vec4 t = texelFetch(uRevIdx, ivec2(x, y), 0);
          return ivec2(t.xy);
        }

        void main() {
          ivec2 r = ivec2(vTex * N_WH - 0.5);
          ivec2 s =
            ${layout == 'rows'} ? ivec2(revidx(r.x, 0).x, r.y) :
            ${layout == 'cols'} ? ivec2(r.x, revidx(0, r.y).x) :
            revidx(r.x, r.y);
          vec4 conj = vec4(1.0, uInverseFFT ? -1.0 : 1.0, 1.0, 1.0);
          v_FragColor = texelFetch(uInput, s, 0) * conj;
        }
      `,
    });

    // Same as FFT.normalize() - makes the DFT unitary.
    this.normalizer = new GpuTransformProgram(webgl, {
      fshader: `
        in vec2 vTex;

        uniform sampler2D uInput;
        uniform bool uInverseFFT;

        const int TW = ${width};
        const int TH = ${height};
        const int N = 
          ${layout == 'rows'} ? TW : 
          ${layout == 'cols'} ? TH :
          TW * TH;

        void main() {
          vec4 conj = vec4(1.0, uInverseFFT ? -1.0 : 1.0, 1.0, 1.0);
          vec4 reim = texture(uInput, vTex) * conj;
          v_FragColor = reim / sqrt(float(N));
        }
      `,
    });
  }

  exec({ uInput, uInverseFFT = false }, output) {
    let tex1 = this.texture1;
    let tex2 = this.texture2;

    let tex = tex1;

    if (uInput instanceof GpuFrameBuffer)
      tex = uInput;
    else if (uInput instanceof Float32Array)
      tex.source = uInput;
    else
      throw new Error('Invalid FFT input: ' + uInput);

    this.reverser.exec({
      uInput: tex,
      uRevIdx: this.texRevIdx,
      uInverseFFT,
    }, tex2);
    tex1.source = null;

    let n = this.width * this.height;
    if (this.layout == 'rows') n = this.width;
    if (this.layout == 'cols') n = this.height;

    for (let s = 2; s <= n; s *= 2) {
      [tex1, tex2] = [tex2, tex1];
      super.exec({
        uScale: s,
        uInput: tex1,
      }, tex2);
    }

    this.normalizer.exec({
      uInput: tex2,
      uInverseFFT,
    }, output || (this.output = tex1));
  }

  initTexRevIdxCompact() {
    let webgl = this.webgl;
    let size = this.width * this.height;
    let width = this.width;
    let height = this.height;
    let revidx = FFT.revidx(size);
    let revidx2d = new Int32Array(size * 2);

    for (let i = 0; i < size; i++) {
      let s = revidx[i];
      revidx2d[2 * i + 0] = s % width | 0;
      revidx2d[2 * i + 1] = s / width | 0;
    }

    return new GpuFrameBuffer(webgl, {
      width,
      height,
      channels: 2,
      source: new Float32Array(revidx2d),
    });
  }

  initTexRevIdxFlat() {
    let webgl = this.webgl;
    let n = this.layout == 'rows' ?
      this.width : this.height;
    let revidx = FFT.revidx(n);

    return new GpuFrameBuffer(webgl, {
      width: this.layout == 'rows' ? n : 1,
      height: this.layout == 'cols' ? n : 1,
      source: new Float32Array(revidx),
    });
  }
}

// Computes DCT-II of a real valued input using complex DFT of half the length:
//    http://www.robinscheibler.org/2013/02/13/real-fft.html
// Input:
//    X[0..N-1] real valued signal, with the same layout as in GpuFFT.
//    DCT will (virtually) mirror it, to make it a real and even signal.
// Output:
//    Y[0..N-1] real valued amplitudes, identical to FFT of {X[0]..X[N-1],X[N-1]..X[0]}.
//    This is the 1st half of the DCT output. The 2nd half is the reflection of the 1st:
//    Y[2N-k] = Y*[k] = Y[k]. The middle element Y[N] is not available.
//
// DCT-II is its own inverse, so applying this shader twice restores the original signal.
export class GpuDCT {
  constructor(webgl, args) {
    let width = args.width;
    let height = args.height;

    this.fft = new GpuFFT(webgl, args);
    this.tex1 = new GpuFrameBuffer(webgl, { width, height, channels: 2 });

    this.mirror_re_im = new GpuTransformProgram(webgl, {
      fshader: `
        in vec2 vTex;
        uniform sampler2D uInput;

        ${this.fft.shader_utils}

        float mirrored(int i) {
          return element(N - abs(N - i)).x;
        }

        void main() {
          int i = eindex(ivec2(vTex * vec2(WH) - 0.5));
          float re = mirrored(2 * i);
          float im = mirrored(2 * i + 1);
          v_FragColor = vec4(re, im, 0.0, 0.0);
        }
      `
    });

    this.post_process = new GpuTransformProgram(webgl, {
      fshader: `
        in vec2 vTex;
        uniform sampler2D uInput;

        const vec2 CONJ = vec2(1.0, -1.0);
        const mat2 IMUL = mat2(0.0, 1.0, -1.0, 0.0);

        ${this.fft.shader_utils}

        void main() {
          int k = eindex(ivec2(vTex * vec2(WH) - 0.5));
          vec2 u = element(k);
          vec2 v = element(N - k) * CONJ;
          vec2 X_e = 0.5 * (u + v);
          vec2 X_o = 0.5 * (u - v) * IMUL;
          vec2 X = X_e + multiply(X_o, kth_root(k, 2*N));
          v_FragColor = vec4(X, 0.0, 0.0); // Im[X] = 0 here, it's DCT-II
        }
      `
    });

    this.prepare_inv = new GpuTransformProgram(webgl, {
      fshader: `
        in vec2 vTex;
        uniform sampler2D uInput;

        const vec2 CONJ = vec2(1.0, -1.0);
        const mat2 IMUL = mat2(0.0, 1.0, -1.0, 0.0);

        ${this.fft.shader_utils}

        void main() {
          int k = eindex(ivec2(vTex * vec2(WH) - 0.5));
          vec2 u = element(k);              // Im[u] = 0 if that's output of DCT-II
          vec2 v = element(N - k) * CONJ;   // Im[v] = 0, same reason
          vec2 X_e = 0.5 * (u + v);
          vec2 X_o = 0.5 * (u - v);
          vec2 Z = X_e + multiply(X_o, kth_root(-k, 2*N)) * IMUL;
          // conjugate Z so FFT after this shader acts as the inverse FFT
          v_FragColor = vec4(Z * CONJ, 0.0, 0.0);
        }
      `
    });

    this.split_re_im = new GpuTransformProgram(webgl, {
      fshader: `
        in vec2 vTex;
        uniform sampler2D uInput;

        const vec2 CONJ = vec2(1.0, -1.0);

        ${this.fft.shader_utils}

        void main() {
          int k = eindex(ivec2(vTex * vec2(WH) - 0.5));
          vec2 z = element(k / 2) * CONJ;   // conjugate because FFT acts as the inverse FFT here
          float x = z[k % 2];               // Re[z] for even k, Im[z] for odd k
          v_FragColor = vec4(x, 0.0, 0.0, 0.0);
        }
      `
    });
  }

  exec({ uInput }, output) {
    this.mirror_re_im.exec({ uInput }, this.tex1);
    this.fft.exec({ uInput: this.tex1 }, this.tex1); // DFT
    this.post_process.exec({ uInput: this.tex1 }, output);
  }

  inverse({ uInput }, output) {
    this.prepare_inv.exec({ uInput }, this.tex1);
    this.fft.exec({ uInput: this.tex1 }, this.tex1); // inverse DFT
    this.split_re_im.exec({ uInput: this.tex1 }, output);
  }
}
