import { StringOscillator } from './oscillator.js';
import * as utils from '../lib/utils.js';

let { dcheck, clamp, fireballRGB, Float32Tensor } = utils;

let osc_lines;
let img_amps;
let img_freqs;

onmessage = (e) => {
  // console.log('received command:', e.data.type);
  switch (e.data.type) {
    case 'wave_1d':
      computeWave1D(e.data.signal, e.data.config);
      break;
    case 'draw_disk':
      drawDiskImage(e.data.config);
      break;
    case 'img_freqs':
      computeImgFreqs(e.data.config);
      break;
    default:
      dcheck();
  }
};

function computeOscLines(signal, conf) {
  let strlen = Math.round(conf.stringLen / 1000 * conf.sampleRate); // oscillating string length
  let oscillator = new StringOscillator({ width: strlen });
  let siglen = signal.length;

  osc_lines = new Float32Tensor([siglen, strlen]);
  oscillator.damping = 10 ** conf.damping;

  for (let t = 0; t < siglen; t++) {
    oscillator.update();
    oscillator.wave[0] = signal[t];

    for (let x = 0; x < strlen; x++)
      osc_lines.data[t * strlen + x] = oscillator.wave[x] - signal[t];
  }
}

function computeImgAmps(conf) {
  let [siglen, width] = osc_lines.dims;
  let steps = conf.numSteps;
  let y_prev = 0, y_curr = 0, ts = Date.now();

  console.debug('siglen=' + siglen, 'strlen=' + width, 'steps=' + steps);
  console.debug('sn/height=' + (siglen / steps));

  img_amps = new Float32Tensor([steps, width]);

  let wave_minmax = [];
  for (let x = 0; x < width; x++)
    wave_minmax[x] = new utils.MinMaxFilter(Math.ceil(siglen / steps)); // new utils.DWTFilter(dwt_levels);

  for (let t = 0; t < siglen; t++) {
    for (let x = 0; x < width; x++) {
      let amp = osc_lines.data[t * width + x];
      wave_minmax[x].push(amp);
    }

    let y = clamp(Math.round(t / siglen * steps), 0, steps - 1);

    if (y > y_curr) {
      for (let x = 0; x < width; x++) {
        let mm = wave_minmax[x];
        img_amps.data[y_curr * width + x] = (mm.max - mm.min)/2;
      }

      y_curr = y;

      for (let mm of wave_minmax)
        mm.reset();

      if (Date.now() > ts + 250) {
        ts = Date.now();
        postMessage({ type: 'wave_1d', progress: Math.min(y_curr / steps, 0.99) });
        y_prev = y_curr;
      }
    }
  }

  postMessage({ type: 'wave_1d', progress: 1.00 });
}

function computeImgFreqs(conf) {
  let [siglen, strlen] = osc_lines.dims;
  let steps = conf.numSteps;

  img_freqs = new Float32Tensor([steps, strlen]);

  let wave_segments = [];
  let seglen = Math.ceil(siglen / steps);
  let y_prev = 0, ts = Date.now();

  for (let x = 0; x < strlen; x++)
    wave_segments[x] = new Float32Array(seglen);

  for (let t = 0; t < siglen; t++) {
    for (let x = 0; x < strlen; x++)
      wave_segments[x][t % seglen] = osc_lines.data[t * strlen + x];

    let y = clamp(Math.round(t / siglen * steps), 0, steps - 1);

    if (y > y_prev) {
      let freqs = img_freqs.subtensor(y_prev).data;
      y_prev = y;

      for (let x = 0; x < strlen; x++) {
        // https://en.wikipedia.org/wiki/Instantaneous_phase_and_frequency
        freqs[x] = utils.meanFreq(wave_segments[x], conf.sampleRate);
        wave_segments[x].fill(0);
        dcheck(freqs[x] >= 0);
      }

      if (Date.now() > ts + 250) {
        postMessage({ type: 'img_freqs', progress: t / siglen });
        ts = Date.now();
      }
    }
  }

  postMessage({ type: 'img_freqs', progress: 1.00 });
}

async function computeWave1D(signal, conf) {
  utils.time('oscillator:', () =>
    computeOscLines(signal, conf));

  utils.time('minmax:', () =>
    computeImgAmps(conf));
}

async function drawDiskImage(conf) {
  utils.time('rect2disk:', () => {
    for (let img of [img_amps, img_freqs]) {
      if (!img || img.disk) continue;
      img.disk = new Float32Tensor([conf.imageSize, conf.imageSize]);
      utils.rect2disk(img, img.disk, { num_reps: conf.symmetry });
    }
  });

  let autoBrightness = adjustBrightness(img_amps, conf);
  console.debug('brightness:', 10 ** -autoBrightness);
  let img_data = new Uint8Array(conf.imageSize ** 2 * 4);
  let canvas_img = { data: img_data, width: conf.imageSize, height: conf.imageSize };

  utils.time('img_rgba:', () =>
    drawImgData(canvas_img, [0, conf.imageSize - 1], autoBrightness, conf));

  postMessage({ type: 'draw_disk', img_data });
}

function adjustBrightness(img, { exposure }) {
  dcheck(img.data instanceof Float32Array);
  let q = utils.approxPercentile(img.data, 1.0 - 10 ** exposure, 1e4);
  return q > 0 ? -Math.log10(q) : 0;
}

function drawImgData(canvas_img, [ymin, ymax] = [0, canvas_img.height - 1], autoBrightness, conf) {
  let temps = img_amps.disk;
  let freqs = img_freqs?.disk;

  dcheck(canvas_img.data);
  dcheck(temps instanceof Float32Tensor);
  dcheck(Number.isFinite(autoBrightness));

  if (!autoBrightness)
    console.warn('auto brightness:', autoBrightness);

  let width = canvas_img.width;
  let brightness = 10 ** (autoBrightness + conf.brightness);

  for (let y = ymin; y <= ymax; y++) {
    for (let x = 0; x < width; x++) {
      let i = y * width + x;
      let temp = temps.data[i] * brightness;
      let [r, g, b] = fireballRGB(temp);

      if (freqs) {
        let [h, s, l] = utils.rgb2hsl(r, g, b);
        h -= freqs.data[i] / conf.sampleRate * 2;
        [r, g, b] = utils.hsl2rgb(h, s, l);
      }

      canvas_img.data[i * 4 + 0] = 255 * clamp(r);
      canvas_img.data[i * 4 + 1] = 255 * clamp(g);
      canvas_img.data[i * 4 + 2] = 255 * clamp(b);
      canvas_img.data[i * 4 + 3] = 255;
    }
  }
}
