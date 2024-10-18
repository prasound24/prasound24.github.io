import * as utils from '../lib/utils.js';
import * as base from './base.js';

const { $, $$, sleep, clamp, check, dcheck, clone, DB } = utils;
const { gconf } = base;
const TEMP_GRADIENT = '/img/blackbody.png';

let args = new URLSearchParams(location.search);
let recorder = null;
let rec_timer = null;
let is_drawing = false;
let ui_settings = {};

let mem = {
  audio_name: '',
  audio_file: null,
  audio_signal: null,
  decoded_audio: { data: null, sample_rate: 0, file: null },

  sig_start: 0, // sec
  sig_end: 0, // sec
};

window.conf = gconf;
window.utils = utils;
window.onload = init;
utils.setUncaughtErrorHandlers((err) => {
  if (!err) return;
  $('#error_info').textContent = err;
});

async function init() {
  base.initConfFromURL();
  initMouseEvents();
  //initTempGradientImg();
  initSettings();

  $('#preview').onclick = () => saveToGallery();
  $('#upload').onclick = () => uploadAudio();
  $('#record').onclick = () => recordAudio();
  $('#stop_recording').onclick = () => stopRecording();
  $('#download_image').onclick = () => downloadImage();
  $('#show_settings').onclick = () => showSettings();
  $('#download_audio').onclick = () => downloadAudio();
  $('#play_sound').onclick = () => playAudioSignal();

  //setPitchClass();

  if (await loadAudioSignal()) {
    await drawWaveform();
    await redrawImg();
  }
}

function showSettings() {
  document.body.classList.toggle('settings');
}

function initSettings() {
  if (utils.DEBUG)
    document.body.classList.add('debug');

  initSetting('sampleRate', {
    debug: true,
    units: 'kHz',
    toText: (x) => (x / 1000).toFixed(0),
    addStep: (x, d) => clamp(x * 2 ** d, 3000, 384000),
    onChanged: async () => {
      await drawWaveform();
      await redrawImg();
    },
  });

  initSetting('hue', {
    delay: 0.0,
    units: '\u00b0',
    addStep: (x, d) => (x + 10 * d + 360) % 360,
    toText: (x) => x.toFixed(0),
    onChanged: () => {
      $('#disk').style.filter = 'hue-rotate(' + gconf.hue + 'deg)';
      saveImageConfig();
    },
  });

  initSetting('brightness', {
    delay: 0.0,
    addStep: (x, d) => clamp(x + d * 0.1, -5.5, 5.5),
    toText: (x) => x.toFixed(1),
    onChanged: () => {
      drawDiskImage();
      saveImageConfig();
    },
  });

  initSetting('exposure', {
    debug: true,
    addStep: (x, d) => clamp(x + d * 0.5, -9.5, -0.5),
    toText: (x) => x.toFixed(1),
    onChanged: () => redrawImg(),
  });

  initSetting('imageSize', {
    addStep: (x, d) => clamp(x * 2 ** d, 1, 4096),
    onChanged: () => {
      // conf.stringLen = conf.imageSize;
      // conf.numSteps = conf.imageSize / 2;
      redrawImg();
    },
  });

  initSetting('numSteps', {
    addStep: (x, d) => clamp(x * 2 ** d, 1, 8192),
    onChanged: () => redrawImg(),
  });

  initSetting('stringLen', {
    units: 'ms',
    addStep: (x, d) => clamp(x + d * 0.01, 1, 100),
    toText: (x) => x.toFixed(2),
    onChanged: () => redrawImg(),
  });

  initSetting('symmetry', {
    addStep: (x, d) => clamp(x + d, 1, 6),
    onChanged: () => redrawImg(),
  });

  initSetting('damping', {
    debug: true,
    addStep: (x, d) => clamp(x + d * 0.1, -5.0, 0.0),
    toText: (x) => x.toFixed(1),
    onChanged: () => redrawImg(),
  });
}

function initSetting(name, { debug, delay = 1, units, addStep, onChanged, toText }) {
  dcheck(name in gconf);
  let settings = $('#settings');
  let setting = settings.firstElementChild.cloneNode(true);
  settings.append(setting);
  let value = setting.querySelector('u');
  toText = toText || (x => x + '');

  if (debug)
    setting.classList.toggle('debug', debug);

  setting.querySelector('s').textContent = units || '';
  setting.querySelector('div').textContent =
    name.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase());
  value.textContent = toText(gconf[name]);
  setting.querySelector('i').onclick = changeValue;
  setting.querySelector('b').onclick = changeValue;

  let timer = 0;

  async function changeValue(e) {
    let dir = e.target.textContent == '+' ? +1 : -1;
    let x = addStep(gconf[name], dir);
    if (x == gconf[name])
      return;
    gconf[name] = x;
    refresh();
    clearTimeout(timer);
    timer = setTimeout(() => onChanged(gconf[name]), delay * 1000);
  }

  function refresh() {
    value.textContent = toText(gconf[name]);
  }

  ui_settings[name] = { refresh };
}

async function initTempGradientImg() {
  let img = new Image;
  img.src = TEMP_GRADIENT;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  dcheck(img.width > 0 && img.height > 0);
  let canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  let ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  let rgba = ctx.getImageData(0, 0, img.width, img.height);
  let r = [], g = [], b = [];

  for (let x = 0; x < img.width; x++) {
    r[x] = rgba.data[x * 4 + 0] / 255;
    g[x] = rgba.data[x * 4 + 1] / 255;
    b[x] = rgba.data[x * 4 + 2] / 255;
    dcheck(r[x] + g[x] + b[x] >= 0.0);
  }

  gconf.color = { r, g, b };
  console.log('temperature gradient:', r.length, img.src);
}

function initTempGradient421() {
  let n = 4, r = [], g = [], b = [];

  for (let i = 0; i <= n; i++) {
    r[i] = clamp(i / n * 4);
    g[i] = clamp(i / n * 2);
    b[i] = clamp(i / n * 1);
  }

  gconf.color = { r, g, b };
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
    let diff = dx / wrapper.clientWidth * mem.audio_signal.length / gconf.sampleRate;
    if (target.id == 'ptr_start')
      setSilenceMarks(mem.sig_start + diff, mem.sig_end);
    if (target.id == 'ptr_end')
      setSilenceMarks(mem.sig_start, mem.sig_end + diff);
  }
}

async function uploadAudio() {
  if (is_drawing) return;
  let files = await utils.selectAudioFile({ multiple: true });

  if (files.length > 1) {
    console.log('multiple files selected:', files.length);
    await base.saveTempSounds(files);
    location.href = '/gallery';
    return;
  }

  mem.audio_file = files[0];
  mem.sig_start = mem.sig_end = 0;

  base.checkFileSize(mem.audio_file);

  await drawWaveform();
  await redrawImg();
}

async function decodeAudio() {
  let sample_rate = gconf.sampleRate;
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
    // normalizeAudioSignal(mem.audio_signal);
    mem.audio_signal = base.padAudioWithSilence(mem.audio_signal);

    document.body.classList.remove('empty');

    //let freq = utils.meanFreq(mem.audio_signal, sample_rate) | 0;
    //let pitch = utils.meanPitch(freq);
    //let note = utils.pitchToNote(pitch);
    //console.debug('Avg freq:', freq + ' Hz', note + '=' + (pitch * 360).toFixed(0) + 'deg');
    //setPitchColor(pitch);
  }
}

function setPitchColor(pitch) {
  if (!args.get('c')) {
    gconf.hue = Math.round(pitch * 360 / 30) * 30;
    ui_settings.hue.refresh();
    for (let canvas of $$('#art_main canvas'))
      canvas.style.filter = 'hue-rotate(' + gconf.hue + 'deg)';
  }
}

function setPitchClass() {
  let c = args.get('c');
  if (c) {
    for (let canvas of $$('#art_main canvas'))
      canvas.classList.add(c);
  }
}

async function drawWaveform() {
  if (is_drawing || !mem.audio_file)
    return;

  try {
    is_drawing = true;
    mem.audio_name = mem.audio_file.name.replace(/\.\w+$/, '');

    await decodeAudio();

    let drawer = base.initWaveformDrawer($('canvas#wave'));
    drawer.draw(mem.audio_signal, [0, 1]);
    await sleep(50);
  } finally {
    is_drawing = false;
  }

  if (!mem.sig_start && !mem.sig_end) {
    let [sleft, sright] = base.findSilenceMarks(mem.audio_signal, gconf.silenceThreshold, gconf.numSteps);
    setSilenceMarks(sleft / gconf.sampleRate, 0.1 + sright / gconf.sampleRate);
  }
}

function updateAudioInfo() {
  $('#audio_name').textContent = mem.audio_name;
  $('#audio_info').textContent = getSelectedDuration().toFixed(2) + ' s, '
    + (gconf.sampleRate / 1000) + ' kHz, ' + (mem.audio_file.size / 1024).toFixed(1) + ' KB';
}

function setSilenceMarks(start_sec, end_sec) {
  let sleft = start_sec * gconf.sampleRate;
  let sright = end_sec * gconf.sampleRate;
  sright = Math.max(sright, sleft);
  sleft = clamp(sleft, 0, mem.audio_signal.length - 1);
  sright = clamp(sright, 0, mem.audio_signal.length - 1);
  mem.sig_start = sleft / gconf.sampleRate;
  mem.sig_end = sright / gconf.sampleRate;
  let l = sleft * 100 / mem.audio_signal.length;
  let r = sright * 100 / mem.audio_signal.length;
  $('#wave_start').style.width = l.toFixed(2) + 'vw';
  $('#wave_end').style.width = (100 - r).toFixed(2) + 'vw';
  $('#wave_label').textContent = getSelectedDuration().toFixed(2) + ' s';
  updateAudioInfo();
}

function getSelectedDuration() {
  return mem.sig_end - mem.sig_start;
}

function getSelectedAudio() {
  let from = mem.sig_start * gconf.sampleRate;
  let to = mem.sig_end * gconf.sampleRate;
  return mem.audio_signal.subarray(from, to);
}

async function redrawImg() {
  if (is_drawing || !mem.audio_signal)
    return;

  let time = Date.now();
  is_drawing = true;
  $('#error_info').textContent = '';

  try {
    await drawStringOscillations();
    let ts = Date.now();
    let url = await saveDiskImage();
    $('html > head > link[rel=icon]').href = url;
    await saveImageConfig();
    console.debug('saveDiskImage:', Date.now() - ts, 'ms');
    //await drawGallery();
  } finally {
    is_drawing = false;
  }

  console.debug('image ready:', Date.now() - time, 'ms');
}

async function drawGallery() {
  let index = 0, sig = getSelectedAudio();

  for (let canvas of $$('#gallery canvas')) {
    index++;
    let conf = clone(gconf);
    conf.imageSize = 256;
    conf.stringLen *= index == 1 ? 2 : 2 ** -(index - 1);
    console.debug('Drawing small img #' + index, 'stringLen=' + conf.stringLen);
    await base.drawStringOscillations(sig, canvas, conf);
    await base.drawDiskImage(canvas, conf);
  }
}

async function drawStringOscillations() {
  base.setCircleProgress(0);

  await base.drawStringOscillations(getSelectedAudio(), $('canvas#disk'), gconf, {
    onprogress: (pct) => base.setCircleProgress(pct * 90),
  });

  await drawDiskImage();
  base.setCircleProgress(null);
}

async function drawDiskImage() {
  await base.drawDiskImage($('canvas#disk'), gconf);
  base.setCircleProgress(null);
}

async function saveDiskImage(db_path = base.DB_PATH_IMAGE, canvas = $('canvas#disk'),
  mime = 'image/png', quality = 1.00) {
  let blob = await new Promise(resolve =>
    canvas.toBlob(resolve, mime, quality));
  let file = new File([blob], mem.audio_name, { type: blob.type });
  await DB.set(db_path, file);
  console.log('Saved disk image to DB:', file.type, (file.size / 1e6).toFixed(1), 'MB');
  return URL.createObjectURL(blob);
}

async function saveDiskImagePreview(db_path, img_url) {
  dcheck(img_url);
  let img = new Image();
  img.width = 256;
  img.height = 256;
  img.src = img_url;
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject();
  });

  let canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0, img.width, img.height);

  return await saveDiskImage(db_path, canvas, 'image/jpeg', 0.85);
}

async function saveImageConfig(db_path = base.DB_PATH_CONFIG) {
  let json = utils.clone(gconf);
  await DB.set(db_path, json);
}

async function saveToGallery() {
  let sid = base.createSID();
  await utils.time('saveToGallery:', async () => {
    await saveImageConfig(base.DB_SAVED_CONFIGS + '/' + sid);
    await saveAudioSignal(base.DB_SAVED_SOUNDS + '/' + sid);
    let url = await saveDiskImage(base.DB_SAVED_IMAGES + '/' + sid);
    let xs = await saveDiskImagePreview(base.DB_SAVED_IMAGES_XS + '/' + sid, url);
    console.log(xs);
  });
  location.href = '/preview?src=db:' + sid;
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
    await utils.playSound(getSelectedAudio(), gconf.sampleRate);
}

async function saveAudioSignal(db_path = base.DB_PATH_AUDIO) {
  try {
    if (!mem.audio_signal) return;
    let file = utils.generateWavFile(mem.audio_signal, gconf.sampleRate, mem.audio_name);
    console.log('Saving audio to DB:', file.size, file.type);
    await DB.set(db_path, file);
  } catch (err) {
    console.error(err);
  }
}

async function loadAudioSignal() {
  try {
    let src = args.get('src');
    mem.audio_file = await base.loadAudioSignal(src);
    if (!src)
      mem.sig_start = mem.sig_end = 0;
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
  recorder = await utils.recordMic({ sample_rate: gconf.sampleRate });
  let wave_drawer = base.initWaveformDrawer($('canvas#wave'));
  let num_samples = 0, duration_sec = '';
  let label = $('#stop_recording span');

  updateButton();
  document.body.classList.add('recording');

  recorder.onaudiochunk = (chunk) => {
    let xmin = num_samples / gconf.sampleRate / gconf.maxDuration;
    let xlen = chunk.length / gconf.sampleRate / gconf.maxDuration;
    wave_drawer.draw(chunk, [xmin, xmin + xlen], [-1, 1]);
    num_samples += chunk.length;
    updateButton();
    if (xmin + xlen > 1.0)
      stopRecording();
  };

  function updateButton() {
    let ts = '00:' + ('0' + (num_samples / gconf.sampleRate).toFixed(2)).slice(-6);
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
  mem.sig_start = mem.sig_end = 0;

  await drawWaveform();
  await redrawImg();
}

async function downloadImage() {
  dcheck(mem.audio_name);
  let blob = await new Promise(resolve =>
    $('canvas#disk').toBlob(resolve, 'image/jpeg', 1.00));
  let a = document.createElement('a');
  a.download = mem.audio_name + '.jpg';
  a.href = URL.createObjectURL(blob);
  a.click();
}
