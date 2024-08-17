import * as utils from '../utils.js';

const { $, sleep, clamp, dcheck, DB } = utils;
const DB_PATH_AUDIO = 'user_samples/_last/audio';
const DB_PATH_IMAGE = 'user_samples/_last/image';

let conf = {};
conf.sampleRate = 48000;
conf.frameSize = 1024;
conf.numFrames = 512;
conf.diskSize = 1024;
conf.brightness = 1.0;
conf.damping = -3.25;
conf.numReps = 2;
conf.exposure = 0.99;
conf.maxDuration = 15.0; // sec
conf.maxFileSize = 1e6;
conf.silenceThreshold = 1e-3;
conf.silencePadding = 2.0;
conf.flame_color = null;

let bg_thread = null;
let recorder = null;
let rec_timer = null;
let is_drawing = false;

let mem = {
  audio_name: '',
  audio_file: null,
  audio_signal: null,
  decoded_audio: { data: null, sample_rate: 0, file: null },

  sig_start: 0,
  sig_end: 0,
};

window.conf = conf;
window.utils = utils;
window.onload = init;
utils.setUncaughtErrorHandlers();

async function init() {
  initDebugGUI();
  initMouseEvents();
  initFlameColor();

  $('#upload').onclick = () => uploadAudio();
  $('#record').onclick = () => recordAudio();
  $('#show_disk').onclick = () => document.body.classList.add('show_disk');
  $('#show_rect').onclick = () => document.body.classList.remove('show_disk');
  $('#stop_recording').onclick = () => stopRecording();
  $('#download_image').onclick = () => downloadImage();
  $('#download_audio').onclick = () => downloadAudio();
  $('#play_sound').onclick = () => playAudioSignal();

  if (await loadAudioSignal()) {
    await drawWaveform();
    await redrawImg();
  }
}

function initFlameColor() {
  let n = 4, r = [], g = [], b = [];

  for (let i = 0; i <= n; i++) {
    r[i] = clamp(i / n * 4);
    g[i] = clamp(i / n * 2);
    b[i] = clamp(i / n * 1);
  }

  conf.flame_color = { r, g, b };
}

function initMouseEvents() {
  let target = null, touch = null, moved = false;
  let wrapper = $('#wave_wrapper');

  wrapper.addEventListener('mousedown', ontouch);
  wrapper.addEventListener('mousemove', ontouch);
  wrapper.addEventListener('mouseup', ontouch);
  wrapper.addEventListener('mouseleave', ontouch);
  wrapper.addEventListener('touchstart', ontouch);
  wrapper.addEventListener('touchend', ontouch);
  wrapper.addEventListener('touchcancel', ontouch);
  wrapper.addEventListener('touchmove', ontouch);

  function ontouch(e) {
    switch (e.type) {
      case 'mousedown':
      case 'touchstart':
        if (e.touches && e.touches.length != 1)
          break;
        if (e.target.classList.contains('ptr')) {
          e.preventDefault();
          target = e.target;
          touch = e.touches?.[0];
        }
        break;
      case 'mouseup':
      case 'mouseleave':
      case 'mouseout':
      case 'touchend':
      case 'touchcancel':
        if (target) {
          e.preventDefault();
          if (moved)
            redrawImg();
          target = null;
          touch = null;
        }
        break;
      case 'mousemove':
      case 'touchmove':
        if (target) {
          e.preventDefault();
          let t = e.touches?.[0];
          let dx = t ? t.clientX - touch.clientX : e.movementX;
          if (dx) {
            move(dx);
            moved = true;
          }
          touch = t;
        }
        break;
    }
  }

  function move(dx) {
    let diff = dx / wrapper.clientWidth * mem.audio_signal.length | 0;
    if (target.id == 'ptr_start')
      setSilenceMarks(mem.sig_start + diff, mem.sig_end);
    if (target.id == 'ptr_end')
      setSilenceMarks(mem.sig_start, mem.sig_end + diff);
  }
}

async function initDebugGUI() {
  if (!utils.DEBUG)
    return;
  document.body.classList.add('debug');
  await import('./dat.gui.js');
  let gui = new dat.GUI();
  gui.close();
  gui.add(conf, 'sampleRate', 4000, 48000, 4000);
  gui.add(conf, 'frameSize', 256, 8192, 256);
  gui.add(conf, 'diskSize', 1024, 4096, 1024);
  gui.add(conf, 'numFrames', 256, 4096, 256);
  gui.add(conf, 'damping', -5.0, 5.0, 0.01);
  gui.add(conf, 'exposure', 0.0, 1.0, 0.01);
  gui.add(conf, 'numReps', 0, 6, 1);
  conf.redraw = () => hardRefresh();
  gui.add(conf, 'redraw');
}

async function hardRefresh() {
  if (is_drawing) return;

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

async function decodeAudio() {
  let sample_rate = conf.sampleRate;
  let file = mem.audio_file;
  let decoded = mem.decoded_audio || {};

  if (decoded.file != mem.audio_file || decoded.sample_rate != sample_rate) {
    console.log('decoding audio file:', '"' + mem.audio_file.name + '"',
      (mem.audio_file.size / 1024).toFixed(1) + ' KB');
    if (!mem.audio_file._buffer)
      mem.audio_file._buffer = await mem.audio_file.arrayBuffer();
    mem.audio_signal = await utils.decodeAudioFile(mem.audio_file._buffer, sample_rate);
    mem.decoded_audio = { data: mem.audio_signal, sample_rate, file };
    await saveAudioSignal();
    normalizeAudioSignal(mem.audio_signal);
    mem.audio_signal = padAudioWithSilence(mem.audio_signal);
  }
}

async function drawWaveform() {
  if (is_drawing || !mem.audio_file)
    return;

  try {
    is_drawing = true;
    mem.audio_name = mem.audio_file.name.replace(/\.\w+$/, '');

    await decodeAudio();

    let drawer = initWaveformDrawer();
    let amin = Infinity, amax = -Infinity;

    for (let i = 0; i < mem.audio_signal.length; i++) {
      amin = Math.min(amin, mem.audio_signal[i]);
      amax = Math.max(amax, mem.audio_signal[i]);
    }

    drawer.draw(mem.audio_signal, [0, 1], [amin, amax]);
    await sleep(50);
  } finally {
    is_drawing = false;
  }

  let [sleft, sright] = findSilenceMarks(mem.audio_signal, conf.silenceThreshold);
  setSilenceMarks(sleft, sright);
}

function updateAudioInfo() {
  $('#audio_name').textContent = mem.audio_name;
  $('#audio_info').textContent = getSelectedDuration().toFixed(2) + ' s, '
    + (conf.sampleRate / 1000) + ' kHz, ' + (mem.audio_file.size / 1024).toFixed(1) + ' KB';
}

function padAudioWithSilence(a) {
  let n = a.length;
  let b = new Float32Array(n * conf.silencePadding);
  b.set(a, (b.length - a.length) / 2);
  return b;
}

function setSilenceMarks(sleft, sright) {
  sright = Math.max(sright, sleft);
  sleft = clamp(sleft, 0, mem.audio_signal.length - 1);
  sright = clamp(sright, 0, mem.audio_signal.length - 1);
  mem.sig_start = sleft;
  mem.sig_end = sright;
  let l = mem.sig_start * 100 / mem.audio_signal.length;
  let r = mem.sig_end * 100 / mem.audio_signal.length;
  $('#wave_start').style.width = l.toFixed(2) + 'vw';
  $('#wave_end').style.width = (100 - r).toFixed(2) + 'vw';
  $('#wave_label').textContent = getSelectedDuration().toFixed(2) + ' s';
  updateAudioInfo();
}

function getSelectedDuration() {
  return (mem.sig_end - mem.sig_start) / conf.sampleRate;
}

function getSelectedAudio() {
  return mem.audio_signal.subarray(mem.sig_start, mem.sig_end);
}

function initWaveformDrawer(canvas = $('canvas#wave')) {
  let cw = canvas.width;
  let ch = canvas.height;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, cw, ch);

  new Int32Array(img.data.buffer).fill(0x00FFFFFF);
  ctx.putImageData(img, 0, 0);

  function draw(sig, [xmin, xmax] = [0, 1], [amin, amax] = [-1, 1]) {
    if (xmax < 0.0 || xmin > 1.0)
      return;

    for (let t = 0; t < sig.length; t++) {
      let s = sig[t];
      let a = (s - amin) / (amax - amin);
      let x = Math.round(cw * utils.mix(xmin, xmax, t / (sig.length - 1)));
      let y = Math.round(ch * a);

      if (x < 0 || x >= cw || y < 0 || y >= ch)
        continue;

      img.data[(y * cw + x) * 4 + 3] += 255 * cw / sig.length * 25;
    }

    let dirty_xmin = Math.floor(xmin * cw);
    let dirty_xmax = Math.ceil(xmax * cw);
    ctx.putImageData(img, 0, 0, dirty_xmin, 0, dirty_xmax - dirty_xmin + 1, ch);
  }

  return { draw };
}

async function redrawImg() {
  if (is_drawing || !mem.audio_signal)
    return;

  let time = Date.now();
  is_drawing = true;

  // bg_thread?.terminate();
  // bg_thread = null;

  try {
    document.body.classList.remove('show_disk');
    await drawStringOscillations();
    await sleep(10);
    await drawDiskImage(false);
    document.body.classList.add('show_disk');
    await sleep(10);
    // await drawDiskImage(true);
    // await sleep(10);
    await saveDiskImage();
  } finally {
    is_drawing = false;
  }

  console.log('image ready:', Date.now() - time, 'ms');
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

function findSilenceMarks(signal, threshold) {
  let right = signal.length - findSilenceLeft(signal.reverse(), threshold);
  let left = findSilenceLeft(signal.reverse(), threshold);
  return [left, right];
}

function findSilenceLeft(signal, threshold) {
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

function initWorker() {
  if (bg_thread)
    return;
  console.log('starting bg_thread.js');
  bg_thread = new Worker('./bg_thread.js', { type: 'module' });
}

function postCommand({ command, handlers }) {
  initWorker();
  dcheck(!command.txid);
  let txid = Math.random().toString(16).slice(2);
  bg_thread.postMessage({ ...command, txid });
  bg_thread.onmessage = (e) => {
    let handler = handlers[e.data.type];
    dcheck(handler);
    handler.call(null, e);
  };
}

function getSerializableConfig() {
  let config = {};
  for (let i in conf)
    if (typeof conf[i] != 'function')
      config[i] = conf[i];
  return config;
}

async function drawStringOscillations(signal = getSelectedAudio()) {
  let width = conf.frameSize; // oscillating string length
  let height = conf.numFrames;
  let last_draw = Date.now();
  let canvas = $('canvas#rect');
  canvas.width = conf.frameSize;
  canvas.height = conf.numFrames;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  await new Promise((resolve) => {
    postCommand({
      command: { type: 'wave_1d', signal, config: getSerializableConfig() },
      handlers: {
        img_data: (e) => {
          let img_data = e.data.img_data;
          let [ymin, ymax] = e.data.rows;
          dcheck(img_data.length == (ymax - ymin + 1) * width * 4);
          img.data.set(img_data, ymin * width * 4);
          if (Date.now() > last_draw + 250) {
            last_draw = Date.now();
            ctx.putImageData(img, 0, 0);
          }
        },
        img_done: (e) => resolve(),
      },
    });
  });

  ctx.putImageData(img, 0, 0);
  await sleep(0);
}

async function drawDiskImage(smooth = false) {
  let ds = conf.diskSize;
  let config = getSerializableConfig();
  config.smooth = smooth;

  let img_data = await new Promise((resolve) => {
    postCommand({
      command: { type: 'draw_disk', config },
      handlers: {
        disk: (e) => resolve(e.data.img_data),
      },
    });
  });

  let canvas = $('canvas#disk');
  canvas.width = ds;
  canvas.height = ds;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, ds, ds);
  img.data.set(img_data);
  ctx.putImageData(img, 0, 0);
  await sleep(0);
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
  dcheck(mem.audio_name);
  let a = document.createElement('a');
  a.download = mem.audio_name;
  a.href = URL.createObjectURL(mem.audio_file);
  a.click();
}

async function playAudioSignal() {
  if (mem.audio_signal)
    await utils.playSound(getSelectedAudio(), conf.sampleRate);
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
    return mem.audio_file;
  } catch (err) {
    console.error(err);
  }
}

async function stopRecording() {
  if (!recorder)
    return;
  try {
    clearInterval(rec_timer);
    recorder.stop();
  } finally {
    document.body.classList.remove('recording');
    recorder = null;
  }
}

async function recordAudio() {
  recorder = await utils.recordMic({ sample_rate: conf.sampleRate });
  let wave_drawer = initWaveformDrawer();
  let num_samples = 0, duration_sec = '';
  let label = $('#stop_recording span');

  updateButton();
  document.body.classList.add('recording');

  recorder.onaudiochunk = (chunk) => {
    let xmin = num_samples / conf.sampleRate / conf.maxDuration;
    let xlen = chunk.length / conf.sampleRate / conf.maxDuration;
    wave_drawer.draw(chunk, [xmin, xmin + xlen]);
    num_samples += chunk.length;
    updateButton();
    if (xmin + xlen > 1.0)
      stopRecording();
  };

  function updateButton() {
    let ts = '00:' + ('0' + (num_samples / conf.sampleRate).toFixed(2)).slice(-6);
    if (ts == duration_sec)
      return;
    duration_sec = ts;
    label.textContent = ts;
  }

  // wait for the full recording ready
  let blob = await recorder.blob();
  let date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let name = 'microphone_' + date + '_' + blob.size;
  mem.audio_file = new File([blob], name, { type: blob.type });

  await drawWaveform();
  await redrawImg();
}

async function downloadImage() {
  dcheck(mem.audio_name);
  let blob = await new Promise(resolve =>
    $('canvas#disk').toBlob(resolve, 'image/jpeg', 0.85));
  let a = document.createElement('a');
  a.download = mem.audio_name;
  a.href = URL.createObjectURL(blob);
  a.click();
}
