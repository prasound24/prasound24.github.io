import { StringOscillator } from './oscillator.js';
import * as utils from '../lib/utils.js';
import * as cielab from '../lib/cielab.js';
import { interpolate_1d_re } from '../lib/webfft.js';
import { createEXR } from '../lib/exr.js';

let { sleep, dcheck, clamp, fireballRGB, CurrentOp, Float32Tensor } = utils;

let img_amps, img_freq, current_op, wforms, sig_freqs = [];

onmessage = async (e) => {
  let { type, txid, channels, config } = e.data;
  // console.log('received command:', type);
  switch (type) {
    case 'cancel':
      await current_op?.cancel();
      current_op = null;
      break;
    case 'wave_1d':
      current_op = new CurrentOp('bg:computeImgAmps', async () => {
        await utils.time('img_amps:', () => computeImgAmps(channels, config, [0.00, 0.90]));
        await utils.time('img_hues:', () => computeImgHues(channels, config, [0.90, 0.99]));
        //exportAsEXR(wforms);
        postMessage({ type: 'wave_1d', img_amps_rect: img_amps.data, progress: 1.00 });
      });
      break;
    case 'draw_disk':
      current_op = new CurrentOp('bg:drawDiskImage',
        () => drawDiskImage(config));
      break;
    default:
      dcheck();
  }
};

async function exportAsEXR(src) {
  let [h, w] = src.dims;
  dcheck(src.data.length == h * w * 4);

  let rgba = new Float32Array(h * w * 4);
  for (let i = 0; i < h * w * 4; i++)
    rgba[i] = Math.abs(src.data[i]);

  let blob = createEXR(w, h, 3, rgba);
  let file = new File([blob], 'waveforms.exr');
  let url = URL.createObjectURL(file);
  console.log('waveforms:', (blob.size / 1e9).toFixed(1), 'GB', url);
}

async function computeImgHues([sig], conf, [pmin, pmax]) {
  //let wf = wforms;
  let steps = 4; // conf.numSteps;
  let freqs = 8;
  let sn = sig.length;
  //let [sn, strlen] = wf.dims;
  let ts = Date.now();
  let avg_freq = 0;
  img_freq = new Float32Tensor([steps, freqs]);

  let sig1 = sig.slice(), sig2 = sig.slice();
  for (let i = 0; i < sn; i++) {
    let w = utils.hann((i + 0.5) / sn * 0.5 + 0.5);
    sig1[i] = sig[i] * w;
    sig2[i] = sig[i] * (1 - w);
  }
  sig_freqs[0] = utils.meanFreq(sig1, conf.sampleRate);
  postMessage({ type: 'wave_1d', progress: utils.mix(pmin, pmax, 0.5) });
  sig_freqs[1] = utils.meanFreq(sig2, conf.sampleRate);
  postMessage({ type: 'wave_1d', progress: utils.mix(pmin, pmax, 1.0) });
  console.log('Avg freq:', sig_freqs[0].toFixed(0) + '..' + sig_freqs[1].toFixed(0), 'Hz');
  return;

  let range = sn / steps * 2 | 0;
  let weights = new Float32Array(range);
  let section = new Float32Tensor([freqs, range]);

  for (let i = 0; i < weights.length; i++)
    weights[i] = utils.hann((i + 0.5) / weights.length);

  for (let y = 0; y < steps; y++) {
    let t1 = Math.round((y - 1) * range / 2);
    let t2 = Math.round((y + 1) * range / 2);

    for (let t = t1; t <= t2; t++) {
      if (t < 0 || t >= sn || t - t1 >= range)
        continue;
      let weight = weights[t - t1] || 0;
      for (let f = 0; f < freqs; f++) {
        let x = Math.round(f / freqs * strlen);
        let amp = weight * wf.data[t * strlen + x];
        section.data[f * range + t - t1] = amp;
      }
    }

    for (let f = 0; f < freqs; f++) {
      let section_f = section.data.subarray(f * range, (f + 1) * range);
      let freq_hz = utils.meanFreq(section_f, conf.sampleRate);
      dcheck(freq_hz >= 0);
      avg_freq += freq_hz / freqs / steps;
      img_freq.data[y * freqs + f] = freq_hz;
    }

    if (Date.now() > ts + 250) {
      await sleep(0);
      ts = Date.now();
      postMessage({ type: 'wave_1d', progress: utils.mix(pmin, pmax, y / steps) });
      if (current_op?.cancelled) {
        postMessage({ type: 'wave_1d', error: 'cancelled' });
        img_freqs = null;
        await current_op.throwIfCancelled();
      }
    }
  }

  console.debug('Avg freq:', avg_freq.toFixed(1), 'Hz');
}

async function computeImgAmps(channels, conf, [pmin, pmax]) {
  let nch = channels.length;
  let strlen = Math.round(conf.stringLen / 1000 * conf.sampleRate); // oscillating string length
  let ds = conf.imageSize;
  let subsampling = ds * 2 / conf.symmetry / strlen;
  strlen = Math.round(strlen * subsampling) & ~1; // make it even for FFT resampling
  let siglen = channels[0].length;

  for (let i = 0; i < nch; i++) {
    dcheck(channels[i].length == siglen);
    let siglen2 = Math.round(siglen * subsampling);
    let sig2 = new Float32Array(siglen2);
    interpolate_1d_re(channels[i], sig2);
    channels[i] = sig2;
  }

  siglen = channels[0].length;

  let oscillators = [];

  for (let ch = 0; ch < nch; ch++) {
    oscillators[ch] = new StringOscillator(strlen);
    oscillators[ch].dt = 1.0 / subsampling;
    oscillators[ch].damping = 10 ** conf.damping;
  }

  let steps = conf.numSteps;
  let y_prev = 0, ts = Date.now();

  console.debug('siglen=' + siglen, 'strlen=' + strlen, 'steps=' + steps);
  console.debug('sn/height=' + (siglen / steps));

  img_amps = new Float32Tensor([steps, strlen]);

  for (let t = 0; t < siglen; t++) {
    for (let ch = 0; ch < nch; ch++)
      oscillators[ch].update(channels[ch][t]);

    let y = Math.round(t / siglen * steps);

    for (let x = 0; x < strlen; x++) {
      let sum = 0;
      for (let ch = 0; ch < nch; ch++)
        sum += utils.sqr(oscillators[ch].wave[x] - channels[ch][t]);

      let i = y * strlen + x;
      img_amps.data[i] = Math.max(img_amps.data[i], Math.sqrt(sum));
    }

    if (y <= y_prev) continue;
    y_prev = y;

    if (Date.now() > ts + 250) {
      await sleep(0);
      ts = Date.now();
      postMessage({ type: 'wave_1d', progress: utils.mix(pmin, pmax, y / steps) });
      if (current_op?.cancelled) {
        postMessage({ type: 'wave_1d', error: 'cancelled' });
        img_amps = null;
        await current_op.throwIfCancelled();
      }
    }
  }
}

async function drawDiskImage(conf) {
  await utils.time('rect2disk:', async () => {
    let imgs = [img_amps, img_freq]
      .filter(img => img && !img.disk);

    for (let i = 0; i < imgs.length; i++) {
      let img = imgs[i];
      img.disk = new Float32Tensor([conf.imageSize, conf.imageSize]);
      utils.rect2disk(img, img.disk, {
        num_reps: conf.symmetry,
        onprogress: (pct) => {
          postMessage({
            type: 'draw_disk',
            progress: (i + pct) / (imgs.length + 1),
          });
        },
      });
      await sleep(5);
      if (current_op?.cancelled) {
        postMessage({ type: 'draw_disk', error: 'cancelled' });
        await current_op.throwIfCancelled();
      }
    }
  });

  let autoBrightness = adjustBrightness(img_amps.disk, conf);
  console.debug('brightness:', 10 ** -autoBrightness);
  //let img_data = new Uint8Array(conf.imageSize ** 2 * 4);
  //let canvas_img = { data: img_data, width: conf.imageSize, height: conf.imageSize };
  //utils.time('img_rgba:', () =>
  //  drawImgData(canvas_img, [0, conf.imageSize - 1], autoBrightness, conf));

  postMessage({
    type: 'draw_disk',
    result: {
      img_amps_disk: img_amps.disk.data,
      img_freq_disk: img_freq.disk.data,
      sig_freqs,
      brightness: 10 ** (autoBrightness + conf.brightness),
    },
  });
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
      canvas_img.data[i * 4 + 3] = 255 * utils.smoothstep(clamp(temp / 0.005));
    }
  }
}
