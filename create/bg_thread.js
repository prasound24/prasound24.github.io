import { StringOscillator } from './oscillator.js';
import * as utils from '/utils.js';

let { sqr, dcheck, clamp, resampleDisk, reverseDiskMapping, Float32Tensor } = utils;

let img_rect = null;

onmessage = (e) => {
  console.log('received command:', e.data.type);
  switch (e.data.type) {
    case 'wave1d':
      drawStringOscillations(e.data.signal, e.data.config);
      break;
    case 'draw_disk':
      drawDiskImage(e.data.config);
      break;
    default:
      console.warn('unknown command:', e.data.type);
  }
};

async function drawStringOscillations(signal, conf) {
  let width = conf.frameSize; // oscillating string length
  let height = conf.numFrames;
  let oscillator = new StringOscillator({ width });
  let wave_sum = new Float32Array(width);
  let wave_min = new Float32Array(width);
  let wave_max = new Float32Array(width);
  let wave_res = new Float32Array(width);
  let img = { data: new Uint8Array(width * height * 4), width, height };
  let y_curr = 0;

  img_rect = new Float32Tensor([height, width]);

  oscillator.damping = 10 ** conf.damping;
  oscillator.driving = 0.0;
  oscillator.gravity = 0.0;

  for (let t = 0; t < signal.length; t++) {
    oscillator.wave[0] = signal[t];
    oscillator.update();

    for (let x = 0; x < width; x++) {
      let w = oscillator.wave[x];
      wave_sum[x] += w;
      wave_min[x] = Math.min(wave_min[x], w);
      wave_max[x] = Math.max(wave_max[x], w);
    }

    let y = t / signal.length * conf.numFrames | 0;

    if (y > y_curr) {
      for (let x = 0; x < width; x++)
        wave_res[x] = utils.sqr(wave_max[x] - wave_min[x]);
      img_rect.data.set(wave_res, y_curr * width);
      drawImgData(img, img_rect, [y_curr, y_curr], conf);
      let img_row = img.data.subarray(y_curr * width * 4, (y_curr + 1) * width * 4);
      postMessage({ type: 'img_data', img_data: img_row, rows: [y_curr, y_curr] });
      y_curr = y;
      wave_sum.fill(0);
      wave_min.fill(0);
      wave_max.fill(0);
      wave_res.fill(0);
    }
  }

  conf.brightness = adjustBrightness(img_rect, conf);
  drawImgData(img, img_rect, [0, height - 1], conf);
  postMessage({ type: 'img_data', img_data: img.data, rows: [0, height - 1] });
  postMessage({ type: 'img_done' });
}

async function drawDiskImage(conf) {
  let img_disk = new Float32Tensor([conf.diskSize, conf.diskSize]);
  let resample = conf.smooth ? resampleDisk : reverseDiskMapping;
  await resample(img_rect, img_disk, { num_reps: conf.numReps });

  conf.brightness = adjustBrightness(img_rect, conf);
  let img_data = new Uint8Array(conf.diskSize ** 2 * 4);
  let canvas_img = { data: img_data, width: conf.diskSize, height: conf.diskSize };
  drawImgData(canvas_img, img_disk, [0, conf.diskSize - 1], conf);
  postMessage({ type: 'disk', img_data });
}

function adjustBrightness(img, { exposure }) {
  dcheck(img.data instanceof Float32Array);
  return 1.0 / utils.approxPercentile(img.data, exposure, 1e4);
}

function drawImgData(canvas_img, temperature, [ymin, ymax] = [0, canvas_img.height - 1], conf) {
  dcheck(canvas_img.data);
  dcheck(temperature.data);
  dcheck(conf.brightness > 0.0);

  let width = canvas_img.width;
  let color = conf.flame_color;

  for (let y = ymin; y <= ymax; y++) {
    for (let x = 0; x < width; x++) {
      let i = y * width + x;
      let temp = Math.abs(temperature.data[i]) * conf.brightness;
      canvas_img.data[i * 4 + 0] = 255 * utils.interpolateLinear(temp, color.r);
      canvas_img.data[i * 4 + 1] = 255 * utils.interpolateLinear(temp, color.g);
      canvas_img.data[i * 4 + 2] = 255 * utils.interpolateLinear(temp, color.b);
      canvas_img.data[i * 4 + 3] = 255;
    }
  }
}
