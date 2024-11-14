import { StringOscillator } from './oscillator.js';
import * as utils from '../lib/utils.js';
import * as cielab from '../lib/cielab.js';
import { interpolate_1d_re } from '../lib/webfft.js';

let { sleep, dcheck, clamp, fireballRGB, CurrentOp, Float32Tensor } = utils;

let img_amps, img_freq, current_op;

onmessage = async (e) => {
  let { type, txid, signal, config } = e.data;
  // console.log('received command:', type);
  switch (type) {
    case 'cancel':
      await current_op?.cancel();
      current_op = null;
      break;
    case 'wave_1d':
      current_op = new CurrentOp('bg:computeImgAmps', async () => {
        await utils.time('img_amps:', () => computeImgAmps(signal, config));
        await utils.time('img_hues:', () => computeImgHues(signal, config));
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

  let freq0 = utils.meanFreq(sig, conf.sampleRate);
  //let freq1 = utils.meanFreq(sig1, conf.sampleRate);
  //let freq2 = utils.meanFreq(sig2, conf.sampleRate);

  console.debug('Avg freq:', freq0.toFixed(0) + ' Hz');

  img_freq = [freq0];
}

async function computeImgAmps(signal, conf) {
  let strlen = Math.round(conf.stringLen / 1000 * conf.sampleRate); // oscillating string length
  let ds = conf.imageSize;
  let subsampling = ds * 2 / conf.symmetry / strlen;
  strlen = Math.round(strlen * subsampling) & ~1; // make it even for FFT resampling
  let oscillator = new StringOscillator({ width: strlen });

  let siglen = signal.length;
  let siglen2 = Math.round(siglen * subsampling);
  let sig2 = new Float32Array(siglen2);
  interpolate_1d_re(signal, sig2);
  siglen = sig2.length;
  signal = sig2;
  oscillator.dt = 1.0 / subsampling;

  let steps = conf.numSteps;
  let y_prev = 0, y_curr = 0, ts = Date.now();

  console.debug('siglen=' + siglen, 'strlen=' + strlen, 'steps=' + steps);
  console.debug('sn/height=' + (siglen / steps));

  img_amps = new Float32Tensor([steps, strlen]);
  //img_amps.disk = new Float32Tensor([ds, ds]);
  oscillator.damping = 10 ** conf.damping;

  for (let t = 0; t < siglen; t++) {
    oscillator.update(signal[t]);

    for (let x = 0; x < strlen; x++) {
      let amp = oscillator.wave[x] - signal[t];
      let i = y_curr * strlen + x;
      if (img_amps.data[i] < Math.abs(amp))
        img_amps.data[i] = Math.abs(amp);
    }

    let y = clamp(Math.round(t / siglen * steps), 0, steps - 1);

    if (y > y_curr) {
      y_curr = y;

      if (Date.now() > ts + 250) {
        await sleep(5);
        ts = Date.now();
        postMessage({ type: 'wave_1d', progress: Math.min(y_curr / steps, 0.99) });
        y_prev = y_curr;
        if (current_op?.cancelled) {
          postMessage({ type: 'wave_1d', error: 'cancelled' });
          img_amps = null;
          await current_op.throwIfCancelled();
        }
      }
    }
  }

  postMessage({ type: 'wave_1d', progress: 1.00 });
}

async function drawDiskImage(conf) {
  await utils.time('rect2disk:', async () => {
    let imgs = [img_amps]
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
      img_amps: img_amps.disk.data,
      img_freq: img_freq,
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
