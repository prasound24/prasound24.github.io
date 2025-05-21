import { StringOscillator } from '../create/oscillator.js';
import * as utils from '../lib/utils.js';
import * as webfft from '../lib/webfft.js';

const { $, mix, clamp, sleep, dcheck, resampleSignal } = utils;

const AUDIO_URL = '/mp3/flute_A4_1_forte_normal.mp3';
const AMPS_URL = '/mp3/amps.wav';
const SAMPLE_RATE_1 = 48000;
const SAMPLE_RATE_2 = 96000;
const CW = 1024, CH = CW;

const args = new URLSearchParams(location.search);

$('#start').onclick = start;

async function start() {
  await testStringAudio();
  await testAudioImage();
  await testImage();
  await testAudio();
  await testImageDFT();
  await testCurvature();
}

async function testStringAudio() {
  let osc = new StringOscillator(600);
  let str = osc.wave;

  for (let i = 0; i < str.length; i++) {
    let phi = (i + 0.5) / str.length * 2 * Math.PI;
    for (let k = 1; k < 120; k++)
      str[i] += 0.5 * (0.5 + Math.cos(k)) / k ** (1.5 + Math.sin(k)) * Math.sin(phi * 5 * k + 123.456 * Math.cos(k * k));
  }

  let audio = new Float32Array(3e5);
  osc.damping = 0.015;

  for (let t = 0; t < audio.length / str.length; t++) {
    osc.update();
    //audio[t] = osc.wave[0];
    let str = osc.wave;
    for (let i = 0; i < str.length; i++)
      audio[t * str.length + i] = str[i];
  }

  await utils.playSound([audio], 48000);
}

async function testCurvature() {
  let res = await fetch(AMPS_URL);
  let blob = await res.blob();
  let sig = await utils.decodeAudioFile(blob, 48000);

  // z''(t) = i sig(t) z'(t)
  let n = sig.length;
  let dt = 1 / n;
  let sum = sig.reduce((s, x) => s + x, 0);
  let scale = 2.5; // 2 * Math.PI * n / sum;
  let sig2 = new Float32Array(n); // sig2'(t) = sig(t)
  for (let i = 0; i < n; i++)
    sig2[i] = sig[i] * scale + (i > 0 ? sig2[i - 1] : 0);
  console.debug('sig2:', sig2[0], '..', sig2[n - 1]);
  console.debug('scale*dt:', scale * dt);

  let exp2 = new Float32Array(2 * n); // exp2(t) = exp(i sig2(t))
  for (let i = 0; i < n; i++) {
    exp2[2 * i + 0] = Math.cos(sig2[i]);
    exp2[2 * i + 1] = Math.sin(sig2[i]);
  }

  let path = new Float32Array(2 * n); // path'(t) = exp2(t)
  for (let i = 0; i < n; i++) {
    path[2 * i + 0] = exp2[2 * i + 0] * dt + (i > 0 ? path[2 * i - 2] : 0);
    path[2 * i + 1] = exp2[2 * i + 1] * dt + (i > 0 ? path[2 * i - 1] : 0);
  }

  let absmax = path.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
  let svg = $('#curvature');

  await utils.time('svg.append', () => {
    let pts = [];
    for (let i = 0; i < n; i++) {
      let re = path[2 * i + 0] / absmax;
      let im = path[2 * i + 1] / absmax;
      pts.push(i ? 'L' : 'M', re.toFixed(4), im.toFixed(4));
    }
    let pp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pp.setAttribute('d', pts.join(' '));
    svg.append(pp);
  });
}

async function testImageDFT() {
  let img_id = args.get('src');
  if (!img_id) {
    console.warn('?src=null');
    return;
  }
  let img_url = '/img/xl/' + img_id + '.jpg'
  let rgba = await utils.fetchRGBA(img_url, CW, CH);
  let canvas = $('canvas#dft');
  canvas.width = CW;
  canvas.height = CH;
  canvas.classList.add(args.get('c'));
  let ctx = canvas.getContext('2d');
  ctx.putImageData(rgba, 0, 0);
  await sleep(50);

  let img2d = new utils.Float32Tensor([CH, CW, 2]);

  for (let i = 0; i < CH * CW; i++) {
    let r = rgba.data[i * 4 + 0] / 256;
    let g = rgba.data[i * 4 + 1] / 256;
    let b = rgba.data[i * 4 + 2] / 256;
    let [hue, sat, lts] = utils.rgb2hsl(r, g, b);

    let x = i % CW, y = i / CW | 0;
    x = (x + CW / 2) % CW;
    y = (y + CH / 2) % CH;
    let j = y * CW + x;
    img2d.data[j * 2 + 0] = lts; // * Math.cos(2 * Math.PI * hue);
    img2d.data[j * 2 + 1] = 0; // lts * Math.sin(2 * Math.PI * hue);
  }

  drawDFT2D(rgba, img2d);
  ctx.putImageData(rgba, 0, 0);
  await sleep(50);

  timed('fft_2d', () => {
    webfft.fft_2d(img2d.data, CH);
  });

  drawDFT2D(rgba, img2d);
  ctx.putImageData(rgba, 0, 0);
  await sleep(500);

  let animationId = 0;
  let tmp2d = img2d.clone();

  function drawFrame() {
    tmp2d.data.set(img2d.data);
    drawColoredImage(tmp2d, rgba, ctx);
    //drawDistortedImage(tmp2d, rgba, ctx);
    animationId = requestAnimationFrame(drawFrame);
    console.debug('frame:', animationId);
  }

  drawFrame();
  canvas.onclick = () => cancelAnimationFrame(animationId);
}

function drawDistortedImage(img2d, rgba, ctx) {
  changeSpectrumData(img2d, (dx, dy, z) => {
    let r = Math.sqrt(dx * dx + dy * dy);
    let scale = 1.0; // + 0.3 * (2 * Math.random() - 1);
    let phi = 2 * Math.PI * (Math.random() - 0.5) * 0.15;

    let e0 = Math.cos(phi), e1 = Math.sin(phi);
    let z0 = z[0] * e0 - z[1] * e1;
    let z1 = z[0] * e1 + z[1] * e0;
    z[0] = z0 * scale;
    z[1] = z1 * scale;
  });

  webfft.fft_2d_inverse(img2d.data, CH);
  drawDFT2D(rgba, img2d, { log: 0 });
  ctx.putImageData(rgba, 0, 0);
}

function drawColoredImage(img2d, rgba, ctx) {
  let rgba0 = getColorFilter(img2d, [1.0, 0.3, 0.1]);
  let rgba1 = getColorFilter(img2d, [0.1, 1.0, 0.3]);
  let rgba2 = getColorFilter(img2d, [0.3, 0.1, 1.0]);

  for (let p = 0; p < CH * CW * 4; p += 4) {
    rgba.data[p + 0] = rgba0.data[p];
    rgba.data[p + 1] = rgba1.data[p];
    rgba.data[p + 2] = rgba2.data[p];
    rgba.data[p + 3] = 256;
  }

  ctx.putImageData(rgba, 0, 0);
}

function getColorFilter(img2d, [kr, kg, kb]) {
  img2d = img2d.clone();

  changeSpectrumData(img2d, (dx, dy, z) => {
    let ds = Math.sqrt(dx * dx + dy * dy); // 0..0.5
    let lts = ds < 0.5 ? Math.cos(ds * 2 * Math.PI) * 0.5 + 0.5 : 0;
    let hz = ds ? Math.log2(ds) : 0;
    let hue = (hz % 1 + 1.0) % 1;
    let sat = Math.min(1, ds / 0.001);
    let [r, g, b] = utils.hsl2rgb(hue, sat, lts * 0.5);
    let scale = r * kr + g * kg + b * kb;
    z[0] *= scale;
    z[1] *= scale;
  });

  webfft.fft_2d_inverse(img2d.data, CH);
  let rgba = { data: new Uint8ClampedArray(CH * CW * 4) };
  drawDFT2D(rgba, img2d, { log: 0 });
  return rgba;
}

function changeSpectrumData(img2d, fn) {
  let z = new Float32Array(2);

  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      let dx = x / CW, dy = y / CH;
      if (dx > 0.5) dx -= 1.0;
      if (dy > 0.5) dy -= 1.0;
      let i = y * CW + x;
      z[0] = img2d.data[i * 2 + 0];
      z[1] = img2d.data[i * 2 + 1];
      fn(dx, dy, z);
      img2d.data[i * 2 + 0] = z[0];
      img2d.data[i * 2 + 1] = z[1];
    }
  }
}

function drawDFT2D(res_rgba, src_img2d, { log = true } = {}) {
  let max = 0;

  // for (let i = 0; i < CH * CW; i++) {
  //   let re = img2d.data[2 * i + 0];
  //   let im = img2d.data[2 * i + 1];
  //   let r = Math.sqrt(re * re + im * im);
  //   max = Math.max(max, log ? Math.log(r) : r);
  // }

  max = 1;
  dcheck(max > 0);

  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      let x2 = (x + CW / 2) % CW;
      let y2 = (y + CH / 2) % CH;
      let i = y2 * CW + x2;
      let re = src_img2d.data[2 * i + 0];
      let im = src_img2d.data[2 * i + 1];
      // let [rad, phi] = utils.xy2ra(re, im);
      let hue = 0; // phi / 2 / Math.PI;
      let lts = Math.max(Math.abs(re) + Math.abs(im)); // !rad ? 0 : (log ? Math.log(rad) : rad) / max;
      let [r, g, b] = utils.hsl2rgb(hue, 0.0, lts);
      let j = y * CW + x;
      res_rgba.data[j * 4 + 0] = r * 256;
      res_rgba.data[j * 4 + 1] = g * 256;
      res_rgba.data[j * 4 + 2] = b * 256;
      res_rgba.data[j * 4 + 3] = 1 * 256;
    }
  }
}

async function testImage() {
  showTempGradient(utils.blackbodyRGB, 'blackbody');

  let tc = t => t ** 4.0;
  showTempGradient(t => [tc(t / 0.45), tc(t / 0.62), tc(t)], 'bb-sim');

  showTempGradient(utils.fireballRGB, 'fireball');
  showTempGradient(t => utils.hsl2rgb(t * 0.15, 1.0, t), 'fireball-hsl');
  showTempGradient(t => [t * 4, t * 2, t], '421');
}

function showTempGradient(temp, title) {
  let w = 1024, h = 128;
  let canvas = document.createElement('canvas');
  canvas.title = title;
  canvas.width = w;
  canvas.height = h;

  let ctx = canvas.getContext('2d');
  let img = ctx.getImageData(0, 0, w, h);
  let img32 = new Uint32Array(img.data.buffer);

  for (let x = 0; x < w; x++) {
    let [r, g, b] = temp(x / w);
    let [hue, sat, lts] = utils.rgb2hsl(r, g, b);
    let rgb32 = 0xFF000000;
    rgb32 += Math.round(clamp(r) * 0xFF) << 0;
    rgb32 += Math.round(clamp(g) * 0xFF) << 8;
    rgb32 += Math.round(clamp(b) * 0xFF) << 16;

    for (let y = 0; y < h; y++) {
      let p = y * w + x;
      let c = rgb32;

      if (Math.abs(h - r * h - y + 0.5) < 1)
        c = 0xFF0000FF;
      if (Math.abs(h - g * h - y + 0.5) < 1)
        c = 0xFF00FF00;
      if (Math.abs(h - b * h - y + 0.5) < 1)
        c = 0xFFFF0000;

      if (Math.abs(h - hue * h - y + 0.5) < 2)
        c = 0xFFFF00FF;
      if (Math.abs(h - sat * h - y + 0.5) < 2)
        c = 0xFF000000;
      if (Math.abs(h - lts * h - y + 0.5) < 2)
        c = 0xFFFFFFFF;

      img32[p] = c;
    }
  }

  ctx.putImageData(img, 0, 0);
  $('#temps').append(canvas);
}

async function testAudio() {
  let res = await fetch(AUDIO_URL);
  let blob = await res.blob();
  let signal = await utils.decodeAudioFile(blob, SAMPLE_RATE_1);

  let a = await utils.decodeAudioFile(blob, SAMPLE_RATE_2);

  for (let q = 1; q <= 12; q++) {
    let b = resampleSignal(signal, a.length, q);
    dcheck(b.length == a.length);
    let avg = rmsqDiff(a, 0);
    let diff = rmsqDiff(a, b);
    console.log('RMSQ', q, (diff / avg).toExponential(2));
  }
}

function rmsqDiff(a, b) {
  let diff = 0.0; // root mean square error
  for (let i = 0; i < a.length; i++)
    diff += utils.sqr(a[i] - (b ? b[i] : 0));
  return Math.sqrt(diff / a.length);
}

function timed(name, fn) {
  let t = Date.now();
  fn();
  console.log(name + ':', Date.now() - t, 'ms');
}

async function testAudioImage() {
  let res = await fetch('/mp3/bass-clarinet_G5_1_forte_normal.mp3');
  let blob = await res.blob();
  let signal = await utils.decodeAudioFile(blob, SAMPLE_RATE_1);
  let canvas = $('canvas#audio_img3');
  canvas.width = CW;
  canvas.height = CH;
  let ctx = canvas.getContext('2d');
  let img = ctx.getImageData(0, 0, CW, CH);
  let s_max = 0, t_max = 0;
  let tmp = new utils.Float32Tensor([CH, CW]);

  for (let t = 0; t < signal.length; t++)
    s_max = Math.max(s_max, Math.abs(signal[t]));

  for (let t = 0; t < signal.length; t++) {
    let r = signal[t] / s_max;
    let a = Math.PI * t / signal.length;
    let y = Math.round(mix(0, CH / 2, 1 + r * Math.cos(a)));
    let x = Math.round(mix(0, CW / 2, 1 + r * Math.sin(a)));
    if (x >= 0 && x < CW && y >= 0 && y < CH)
      tmp.data[y * CW + x]++;
  }

  let tmp2 = new utils.Float32Tensor([CH, CW, 2]);
  for (let i = 0; i < CH * CW; i++)
    tmp2.data[i * 2] = tmp.data[i];

  webfft.fft_2d(tmp2.data, CW);

  for (let i = 0; i < CH * CW; i++)
    t_max = Math.max(t_max, Math.abs(tmp2.data[2 * i]), Math.abs(tmp2.data[2 * i + 1]));

  for (let i = 0; i < CH * CW * 2; i++)
    tmp2.data[i] /= t_max;

  drawDFT2D(img, tmp2);
  ctx.putImageData(img, 0, 0);
}
