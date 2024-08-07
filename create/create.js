import * as utils from '../utils.js';
import { StringOscillator } from './oscillator.js';

const { $, lanczos, sleep, interpolate, DB } = utils;
const DB_PATH_AUDIO = 'user_samples/_last/audio';
const DB_PATH_IMAGE = 'user_samples/_last/image';

let gui = new dat.GUI();
let conf = {};
conf.sampleRate = 48000;
conf.frameSize = 1024;
conf.numFrames = 1024;
conf.diskSize = 1024;
conf.strLengthMsec = 8;
conf.brightness = 1.0;
conf.volume = 1.0;
conf.damping = 75.0;
conf.expDecay = 5;
conf.numReps = 2;
conf.exposure = 0.95;
conf.maxFileSize = 50000;
conf.silenceThreshold = 0.01;
conf.flame_color = {
  b: [0, 1.00, 1.00, 1.00, 1],
  g: [0, 0.50, 1.00, 1.00, 1],
  r: [0, 0.25, 0.50, 0.75, 1],
};

let is_drawing = false;

let mem = {
  audio_name: '',
  audio_file: null,
  audio_signal: null,
  audio_signal_inner: null,
  img_rect: null,
  img_disk: null,
};

window.conf = conf;
window.utils = utils;
window.onload = init;
utils.setUncaughtErrorHandlers();

async function init() {
  initDebugGUI();
  $('#upload').onclick = () => uploadAudio();
  $('#record').onclick = () => recordAudio();
  $('#download_image').onclick = () => downloadImage();
  $('#download_audio').onclick = () => downloadAudio();
  $('#play_sound').onclick = () => playAudioSignal();
  if (await loadAudioSignal()) {
    await drawWaveform();
    await redrawImg();
  }
}

function initDebugGUI() {
  if (!utils.DEBUG)
    return;
  gui.close();
  gui.add(conf, 'sampleRate', 4000, 48000, 4000);
  gui.add(conf, 'strLengthMsec', 1, 1000, 1);
  gui.add(conf, 'frameSize', 256, 8192, 256);
  gui.add(conf, 'diskSize', 1024, 4096, 1024);
  gui.add(conf, 'numFrames', 256, 4096, 256);
  gui.add(conf, 'damping', 0.0, 150.0, 0.1);
  gui.add(conf, 'expDecay', 0.0, 1.0, 0.001);
  gui.add(conf, 'exposure', 0.0, 1.0, 0.01);
  gui.add(conf, 'numReps', 0, 6, 1);
  conf.redraw = () => hardRefresh();
  gui.add(conf, 'redraw');
}

async function hardRefresh() {
  if (is_drawing) return;
  mem = {
    audio_file: mem.audio_file,
    audio_signal: mem.audio_signal,
  };
  await drawWaveform();
  await redrawImg();
}

async function uploadAudio() {
  if (is_drawing) return;
  mem.audio_file = await utils.selectAudioFile();

  let erm = $('#file_error');
  if (mem.audio_file.size <= conf.maxFileSize) {
    erm.textContent = '';
  } else {
    let max = (conf.maxFileSize / 1024).toFixed(0) + ' KB';
    let cur = (mem.audio_file.size / 1024).toFixed(0) + ' KB';
    erm.textContent = 'The max file size is ' + max + '. ' +
      'The selected file "' + mem.audio_file.name + '" is ' + cur + '.';
    return;
  }

  await drawWaveform();
  await redrawImg();
}

async function drawWaveform() {
  if (is_drawing || !mem.audio_file)
    return;

  let time = Date.now();
  is_drawing = true;

  try {
    console.log('decoding audio file:', '"' + mem.audio_file.name + '"',
      (mem.audio_file.size / 1024).toFixed(1) + ' KB');
    mem.audio_name = mem.audio_file.name.replace(/\.\w+$/, '');
    mem.audio_signal = await utils.decodeAudioFile(mem.audio_file, conf.sampleRate);
    normalizeAudioSignal(mem.audio_signal);
    await saveAudioSignal();

    $('#audio_name').textContent = mem.audio_name;
    $('#audio_info').textContent = (mem.audio_signal.length / conf.sampleRate).toFixed(2) + ' s, '
      + (conf.sampleRate / 1000) + ' kHz, ' + (mem.audio_file.size / 1024).toFixed(1) + ' KB';

    let canvas = $('canvas#wave');
    let cw = canvas.width;
    let ch = canvas.height;
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    let img = ctx.getImageData(0, 0, cw, ch);
    img.data.fill(0);

    let amin = Infinity, amax = -Infinity;
    for (let i = 0; i < mem.audio_signal.length; i++) {
      amin = Math.min(amin, mem.audio_signal[i]);
      amax = Math.max(amax, mem.audio_signal[i]);
    }

    for (let t = 0; t < 1.0; t += 1.0 / mem.audio_signal.length) {
      let s = subsampleAudio(mem.audio_signal, t);
      let a = (s - amin) / (amax - amin);
      let x = t * cw;
      let y = a * ch;

      x = utils.clamp(Math.round(x), 0, cw - 1);
      y = utils.clamp(Math.round(y), 0, ch - 1);

      let p = (y * cw + x) * 4;
      img.data[p + 0] = 255;
      img.data[p + 1] = 255;
      img.data[p + 2] = 255;
      img.data[p + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
    await sleep(50);
  } finally {
    is_drawing = false;
  }

  let [sleft, sright] = findSilenceMarks(mem.audio_signal, conf.silenceThreshold);
  // sleft = 0; sright = mem.audio_signal.length - 1;
  mem.audio_signal_inner = mem.audio_signal.slice(sleft, sright);
  sleft *= 100 / mem.audio_signal.length;
  sright *= 100 / mem.audio_signal.length;
  sright = Math.max(sright, sleft);
  $('#wave_start').style.width = sleft.toFixed(2) + 'vw';
  $('#wave_end').style.width = (100 - sright).toFixed(2) + 'vw';

  console.log('done in', Date.now() - time, 'ms');
}

async function redrawImg() {
  if (is_drawing || !mem.audio_signal)
    return;

  let time = Date.now();
  is_drawing = true;

  try {
    await drawStringOscillations();
    await drawDiskImage(false);
    await drawDiskImage(true);
    await saveDiskImage();
  } finally {
    is_drawing = false;
  }

  console.log('done in', Date.now() - time, 'ms');
}

// normalized: avg sig[t]^2 = 1.0
function normalizeAudioSignal(sig) {
  let sum = 0.0;
  for (let i = 0; i < sig.length; i++)
    sum += utils.sqr(sig[i]);
  if (!sum) return;

  let sq2 = Math.sqrt(sum / sig.length * conf.sampleRate);
  for (let i = 0; i < sig.length; i++)
    sig[i] /= sq2;
}

function findSilenceMarks(signal, threshold = 0.001) {
  let right = signal.length - findSilenceLeft(signal.reverse(), threshold);
  let left = findSilenceLeft(signal.reverse(), threshold);
  return [left, right];
}

function findSilenceLeft(signal, threshold = 0.001) {
  let n = signal.length;
  let smin = signal[0], smax = signal[0];

  for (let i = 0; i < n; i++) {
    smin = Math.min(smin, signal[i]);
    smax = Math.max(smax, signal[i]);
  }

  let cmin = signal[0], cmax = signal[0];
  for (let i = 0; i < n; i++) {
    cmin = Math.min(cmin, signal[i]);
    cmax = Math.max(cmax, signal[i]);
    if (cmax - cmin >= threshold * (smax - smin))
      return i;
  }

  return signal.length;
}

function subsampleAudio(sig, t) {
  if (t < 0.0 || t >= 1.0)
    return 0.0;

  let width = 2; // lanczos kernel width
  let i0 = t * sig.length;
  let imin = Math.max(0, Math.floor(i0) - width);
  let imax = Math.min(sig.length - 1, Math.ceil(i0) + width);
  let sum = 0.0;

  for (let i = imin; i <= imax; i++)
    sum += sig[i] * lanczos(i - i0, width);

  return sum;
}

async function drawStringOscillations(signal = mem.audio_signal_inner) {
  let width = conf.frameSize; // oscillating string length
  let oscillator = new StringOscillator({ width, height: 1 });
  oscillator.dx = conf.strLengthMsec / 1000 / conf.frameSize;
  oscillator.dt = oscillator.dx * conf.frameSize / conf.numFrames; // otherwise the diff scheme is unstable
  oscillator.k2 = conf.damping;
  console.log('dx = dt =', oscillator.dt.toExponential(2));

  mem.img_rect = new utils.Float32Tensor([conf.numFrames, conf.frameSize]);

  let wave_sum = new Float32Array(width);
  let y_curr = 0;
  let last_draw = Date.now();
  let canvas = $('canvas#rect');
  canvas.width = conf.frameSize;
  canvas.height = conf.numFrames;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // img.data.fill(0);
  wave_sum.fill(0);

  let steps = signal.length * Math.max(1, 1 / conf.sampleRate / oscillator.dt) | 0;
  let vol = 10 ** conf.volume;
  let decay = Math.exp(-oscillator.dt * 10 ** conf.expDecay);
  console.log('steps:', steps, 'vs sig length:', signal.length);

  for (let t = 0; t < steps; t++) {
    let sig = subsampleAudio(signal, t / steps);
    for (let y = 0; y < oscillator.height; y++)
      oscillator.wave[y * oscillator.width] = sig * vol;
    oscillator.update();

    let y = t / steps * canvas.height | 0;

    for (let x = 0; x < width; x++) {
      wave_sum[x] *= decay;
      for (let y = 0; y < oscillator.height; y++)
        wave_sum[x] += utils.sqr(oscillator.wave[y * oscillator.width + x]);
    }

    if (y > y_curr) {
      y_curr = y;

      for (let x = 0; x < width; x++)
        mem.img_rect.data[y * width + x] = wave_sum[x];

      drawImgData(img, mem.img_rect, [y, y]);
    }

    if (t == steps - 1 || Date.now() > last_draw + 250) {
      last_draw = Date.now();
      ctx.putImageData(img, 0, 0);
      await sleep(0);
    }
  }

  adjustBrightness(mem.img_rect);
  drawImgData(img, mem.img_rect, [0, img.height - 1]);
  ctx.putImageData(img, 0, 0);
  await sleep(0);
}

async function drawDiskImage(smooth = false) {
  let canvas = $('canvas#disk');
  canvas.width = conf.diskSize;
  canvas.height = conf.diskSize;
  let cw = canvas.width;
  let ch = canvas.height;

  mem.img_disk = new utils.Float32Tensor([ch, cw]);
  let resample = smooth ? utils.resampleDisk : utils.reverseDiskMapping;
  await resample(mem.img_rect, mem.img_disk, { num_reps: conf.numReps });

  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, cw, ch);

  adjustBrightness(mem.img_rect);
  drawImgData(img, mem.img_disk, [0, img.height - 1]);
  ctx.putImageData(img, 0, 0);
}

function adjustBrightness(img) {
  utils.dcheck(img.data);
  conf.brightness = 1.0 / utils.approxPercentile(img.data, conf.exposure, 1e4);
  console.log('brightness:', conf.brightness);
}

function drawImgData(canvas_img, amps, [ymin, ymax] = [0, canvas_img.height - 1]) {
  utils.dcheck(canvas_img.data);
  utils.dcheck(amps.data);

  let brightness = conf.brightness;
  let width = canvas_img.width;
  let color = conf.flame_color;

  for (let y = ymin; y <= ymax; y++) {
    for (let x = 0; x < width; x++) {
      let i = y * width + x;
      let amp = amps.data[i] * brightness;
      canvas_img.data[i * 4 + 0] = interpolate(amp, color.r) * 255;
      canvas_img.data[i * 4 + 1] = interpolate(amp, color.g) * 255;
      canvas_img.data[i * 4 + 2] = interpolate(amp, color.b) * 255;
      canvas_img.data[i * 4 + 3] = 255;
    }
  }
}

async function saveDiskImage() {
  let canvas = $('canvas#disk');
  let blob = await new Promise(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85));
  let file = new File([blob], mem.audio_name, { type: blob.type });
  console.log('Saving disk image to DB:', file.size, file.type);
  await DB.set(DB_PATH_IMAGE, file);
}

async function downloadAudio() {
  utils.dcheck(mem.audio_name);
  let a = document.createElement('a');
  a.download = mem.audio_name;
  a.href = URL.createObjectURL(mem.audio_file);
  a.click();
}

async function playAudioSignal() {
  utils.dcheck(mem.audio_signal_inner);
  await utils.playSound(mem.audio_signal_inner, conf.sampleRate);
}

async function saveAudioSignal() {
  try {
    if (!mem.audio_signal) return;
    let blob = utils.generateWavFile(mem.audio_signal, conf.sampleRate);
    let file = new File([blob], mem.audio_name, { type: blob.type });
    console.log('Saving audio to DB:', file.size, file.type);
    await DB.set(DB_PATH_AUDIO, file);
  } catch (err) {
    console.error(err);
  }
}

async function loadAudioSignal() {
  try {
    console.log('loading audio signal from DB');
    mem.audio_file = await DB.get(DB_PATH_AUDIO);
    if (!mem.audio_file) return;
    mem.audio_signal = await utils.decodeWavFile(mem.audio_file);
    return true;
  } catch (err) {
    console.error(err);
  }
}

async function recordAudio() {
  let blob = await utils.recordMic({ sample_rate: conf.sampleRate });
  let date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let name = 'microphone_' + date + '_' + blob.size;
  mem.audio_file = new File([blob], name, { type: blob.type });
  await drawWaveform();
  await redrawImg();
}

async function downloadImage() {
  utils.dcheck(mem.audio_name);
  let blob = await new Promise(resolve =>
    $('canvas#disk').toBlob(resolve, 'image/jpeg', 0.85));
  let a = document.createElement('a');
  a.download = mem.audio_name;
  a.href = URL.createObjectURL(blob);
  a.click();
}
