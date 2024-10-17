import { StringOscillator } from './oscillator.js';
import * as utils from '../lib/utils.js';
import * as cielab from '../lib/cielab.js';

let { dcheck, clamp, fireballRGB, Float32Tensor } = utils;

let img_amps, img_hues;

onmessage = (e) => {
  // console.log('received command:', e.data.type);
  switch (e.data.type) {
    case 'wave_1d':
      utils.time('img_amps:', () => computeImgAmps(e.data.signal, e.data.config));
      utils.time('img_hues:', () => computeImgHues(e.data.signal, e.data.config));
      break;
    case 'draw_disk':
      drawDiskImage(e.data.config);
      break;
    default:
      dcheck();
  }
};

function computeImgHues(sig, conf) {
  let siglen = sig.length;
  let [steps, strlen] = img_amps.dims;
  let sig1 = new Float32Array(sig);
  let sig2 = new Float32Array(sig);

  for (let t = 0; t < siglen; t++) {
    let s = utils.smoothstep(t / siglen);
    sig1[t] *= 1 - s;
    sig2[t] *= s;
  }

  let freq1 = utils.meanFreq(sig1, conf.sampleRate);
  let freq2 = utils.meanFreq(sig2, conf.sampleRate);
  let hue1 = utils.meanPitch(freq1);
  let hue2 = utils.meanPitch(freq2);
  let note1 = utils.pitchToNote(hue1);
  let note2 = utils.pitchToNote(hue2);

  console.debug('Pitch:', freq1.toFixed(0) + '..' + freq2.toFixed(0) + ' Hz,',
    hue1.toFixed(2) + '..' + hue2.toFixed(2), note1 + '..' + note2);

  img_hues = new Float32Tensor([steps, strlen]);

  for (let t = 0; t < steps; t++)
    for (let x = 0; x < strlen; x++)
      img_hues.data[t * strlen + x] = utils.mix(freq1, freq2, t / steps);
}

function computeImgAmps(signal, conf) {
  let strlen = Math.round(conf.stringLen / 1000 * conf.sampleRate); // oscillating string length
  let oscillator = new StringOscillator({ width: strlen });
  let siglen = signal.length;
  let steps = conf.numSteps;
  let y_prev = 0, y_curr = 0, ts = Date.now();

  console.debug('siglen=' + siglen, 'strlen=' + strlen, 'steps=' + steps);
  console.debug('sn/height=' + (siglen / steps));

  img_amps = new Float32Tensor([steps, strlen]);
  oscillator.damping = 10 ** conf.damping;

  let wave_minmax = [];
  for (let x = 0; x < strlen; x++)
    wave_minmax[x] = new utils.MinMaxFilter(Math.ceil(siglen / steps)); // new utils.DWTFilter(dwt_levels);

  for (let t = 0; t < siglen; t++) {
    oscillator.update();
    oscillator.wave[0] = signal[t];

    for (let x = 0; x < strlen; x++)
      wave_minmax[x].push(oscillator.wave[x] - oscillator.wave[0]);

    let y = clamp(Math.round(t / siglen * steps), 0, steps - 1);

    if (y > y_curr) {
      for (let x = 0; x < strlen; x++) {
        let mm = wave_minmax[x];
        img_amps.data[y_curr * strlen + x] = (mm.max - mm.min) / 2;
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

async function drawDiskImage(conf) {
  utils.time('rect2disk:', () => {
    for (let img of [img_amps, img_hues]) {
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
  let freqs = img_hues?.disk;

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
        let pitch = utils.meanPitch(freqs.data[i], conf.sampleRate);
        [r, g, b] = cielab.hue_rotate([r, g, b], (pitch - 0.1) * 2 * Math.PI);
      }

      canvas_img.data[i * 4 + 0] = 255 * clamp(r);
      canvas_img.data[i * 4 + 1] = 255 * clamp(g);
      canvas_img.data[i * 4 + 2] = 255 * clamp(b);
      canvas_img.data[i * 4 + 3] = 255;
    }
  }
}
