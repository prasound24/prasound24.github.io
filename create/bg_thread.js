import { StringOscillator } from './oscillator.js';
import { subsampleAudio, sqr, resampleDisk, reverseDiskMapping, Float32Tensor } from '/utils.js';

onmessage = (e) => {
  console.log('received command:', e.data.type);
  switch (e.data.type) {
    case 'wave1d':
      drawStringOscillations(e.data.signal, e.data.config);
      break;
    case 'disk':
      drawDiskImage(e.data.rect, e.data.config);
      break;
    default:
      console.warn('unknown command:', e.data.type);
  }
};

async function drawStringOscillations(signal, conf) {
  let width = conf.frameSize; // oscillating string length
  let oscillator = new StringOscillator({ width, height: 1 });
  oscillator.dx = conf.strLengthMsec / 1000 / conf.frameSize;
  oscillator.dt = oscillator.dx * conf.frameSize / conf.numFrames; // otherwise the diff scheme is unstable
  oscillator.k2 = conf.damping;
  console.log('dx = dt =', oscillator.dt.toExponential(2));

  let wave_sum = new Float32Array(width);
  let y_curr = 0;
  let steps = signal.length * Math.max(1, 1 / conf.sampleRate / oscillator.dt) | 0;
  let vol = 10 ** conf.volume;
  let decay = Math.exp(-oscillator.dt * 10 ** conf.expDecay);
  console.log('steps:', steps, 'vs sig length:', signal.length);

  for (let t = 0; t < steps; t++) {
    let sig = subsampleAudio(signal, t / steps);
    for (let y = 0; y < oscillator.height; y++)
      oscillator.wave[y * oscillator.width] = sig * vol;
    oscillator.update();

    let y = t / steps * conf.numFrames | 0;

    for (let x = 0; x < width; x++) {
      wave_sum[x] *= decay;
      for (let y = 0; y < oscillator.height; y++)
        wave_sum[x] += sqr(oscillator.wave[y * oscillator.width + x]);
    }

    if (y > y_curr) {
      y_curr = y;
      postMessage({ type: 'data', data: wave_sum, rows: [y, y] });
    }
  }

  postMessage({ type: 'done' });
}

async function drawDiskImage(rect, conf) {
  let img_rect = new Float32Tensor([conf.numFrames, conf.frameSize], rect);
  let img_disk = new Float32Tensor([conf.diskSize, conf.diskSize]);
  let resample = conf.smooth ? resampleDisk : reverseDiskMapping;
  await resample(img_rect, img_disk, { num_reps: conf.numReps });
  postMessage({ type: 'disk', data: img_disk.data });
}
