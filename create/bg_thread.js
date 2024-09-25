import { StringOscillator } from './oscillator.js';
import * as utils from '/utils.js';

let { dcheck, clamp, fireballRGB, Float32Tensor } = utils;

let img_rect = null;

onmessage = (e) => {
  // console.log('received command:', e.data.type);
  switch (e.data.type) {
    case 'wave_1d':
      drawStringOscillations(e.data.signal, e.data.config);
      break;
    case 'draw_disk':
      drawDiskImage(e.data.config);
      break;
    default:
      console.warn('unknown command:', e.data.type);
  }
};

class MinMaxFilter {
  constructor(len) {
    this.len = len;
    this.reset();
  }

  reset() {
    this.n = 0;
    this.min1 = +Infinity;
    this.max1 = -Infinity;
    this.min2 = +Infinity;
    this.max2 = -Infinity;
  }

  push(x) {
    if (this.n <= this.len / 2) {
      this.min1 = Math.min(this.min1, x);
      this.max1 = Math.max(this.max1, x);
    } else {
      this.min2 = Math.min(this.min2, x);
      this.max2 = Math.max(this.max2, x);
    }
    this.n++;
  }

  range(s) {
    return s < 0 ? Math.max(this.max1, this.max2) - Math.min(this.min1, this.min2) :
      this.max2 - this.min2 + this.max1 - this.min1;
  }
}

async function drawStringOscillations(signal, conf) {
  let sn = signal.length;
  // let upsampling = Math.max(1, Math.floor(100 * conf.stringLen / conf.sampleRate));
  // let signal_upsampled = utils.resampleSignal(signal, sn * upsampling);
  // console.log('Upsampling audio:', upsampling + 'x');
  let width = Math.round(conf.stringLen / 1000 * conf.sampleRate); // oscillating string length
  let height = conf.numSteps;
  let oscillator = new StringOscillator({ width });
  let img = { data: new Uint8Array(width * height * 4), width, height };
  let y_prev = 0, y_curr = 0, ts = Date.now();
  let autoBrightness = 1.0;

  console.debug('string length:', width);

  img_rect = new Float32Tensor([2, height, width]);
  let img_mag = img_rect.subtensor(0);
  let img_hue = img_rect.subtensor(1);

  let wave_minmax = [];
  let dwt_levels = 1;
  for (let x = 0; x < width; x++)
    wave_minmax[x] = new MinMaxFilter(sn / height); // new utils.DWTFilter(dwt_levels);

  oscillator.damping = 10 ** conf.damping;
  oscillator.dt = 1.0;
  oscillator.dx = 1.0;

  for (let t = 0; t < sn; t++) {
    oscillator.update();
    oscillator.wave[0] = signal[t];

    for (let x = 0; x < width; x++)
      wave_minmax[x].push(oscillator.wave[x] - signal[t]);

    let y = Math.round(t / (sn - 1) * (height - 1));
    dcheck(y >= 0 && y < height);

    if (y > y_curr) {
      let wave_mag = img_mag.data.subarray(y_curr * width, y_curr * width + width);
      let wave_hue = img_hue.data.subarray(y_curr * width, y_curr * width + width);

      for (let x = 0; x < width; x++) {
        let mm = wave_minmax[x];
        wave_mag[x] = mm.range(-1);
        wave_hue[x] = mm.range(0) / 2; // a low-pass filter
      }

      //drawImgData(img, img_rect, [y_curr, y_curr], autoBrightness, conf);
      y_curr = y;

      for (let mm of wave_minmax)
        mm.reset();

      if (y_curr > y_prev && Date.now() > ts + 250) {
        ts = Date.now();
        // let img_data = img.data.subarray(y_prev * width * 4, y_curr * width * 4);
        postMessage({ type: 'img_data', img_data: null, rows: [y_prev, y_curr - 1] });
        y_prev = y_curr;
      }
    }
  }

  autoBrightness = adjustBrightness(img_mag, conf);
  drawImgData(img, img_rect, [0, height - 1], autoBrightness, conf);
  postMessage({ type: 'img_data', img_data: img.data, rows: [0, height - 1] });
  postMessage({ type: 'img_done' });
}

async function drawDiskImage(conf) {
  let img_disk = new Float32Tensor([2, conf.imageSize, conf.imageSize]);
  let resample = utils.reverseDiskMapping;
  resample = utils.rect2disk;

  let ts = Date.now();
  for (let i = 0; i < img_rect.dims[0]; i++)
    await resample(img_rect.subtensor(i), img_disk.subtensor(i), { num_reps: conf.symmetry });
  console.debug('rect2disk:', Date.now() - ts, 'ms');

  let autoBrightness = adjustBrightness(img_rect.subtensor(0), conf);
  // console.debug('auto brightness:', autoBrightness.toFixed(1));
  let img_data = new Uint8Array(conf.imageSize ** 2 * 4);
  let canvas_img = { data: img_data, width: conf.imageSize, height: conf.imageSize };
  drawImgData(canvas_img, img_disk, [0, conf.imageSize - 1], autoBrightness, conf);
  postMessage({ type: 'disk', img_data });
}

function adjustBrightness(img, { exposure }) {
  dcheck(img.data instanceof Float32Array);
  let q = utils.approxPercentile(img.data, 1.0 - 10 ** exposure, 1e4);
  return q > 0 ? -Math.log10(q) : 0;
}

function drawImgData(canvas_img, temperature, [ymin, ymax] = [0, canvas_img.height - 1], autoBrightness, conf) {
  dcheck(canvas_img.data);
  dcheck(temperature instanceof Float32Tensor);
  dcheck(Number.isFinite(autoBrightness));

  if (!autoBrightness)
    console.warn('auto brightness:', autoBrightness);

  let width = canvas_img.width;
  let brightness = 10 ** (autoBrightness + conf.brightness);
  let temps = temperature.subtensor(0);
  let hues = temperature.subtensor(1);

  for (let y = ymin; y <= ymax; y++) {
    for (let x = 0; x < width; x++) {
      let i = y * width + x;
      let t = Math.abs(temps.data[i]) * brightness;
      let [r, g, b] = fireballRGB(t);
      let [r2, g2, b2] = fireballRGB(Math.abs(hues.data[i]) * brightness * 0.3);

      r += g2;
      g += b2;
      b += r2;

      canvas_img.data[i * 4 + 0] = 255 * clamp(r);
      canvas_img.data[i * 4 + 1] = 255 * clamp(g);
      canvas_img.data[i * 4 + 2] = 255 * clamp(b);
      canvas_img.data[i * 4 + 3] = 255 * 1;
    }
  }
}
