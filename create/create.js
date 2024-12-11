import * as utils from '../lib/utils.js';
import * as base from './base.js';

const { $, $$, sleep, clamp, check, dcheck, clone, ErrorCancelled, CurrentOp, DB } = utils;
const { gconf } = base;
const TEMP_GRADIENT = '/img/blackbody.png';

let args = new URLSearchParams(location.search);
let recorder = null;
let rec_timer = null;
let is_drawing = false;
let current_op = null;
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
  initWaveMouseEvents();
  initSettings();

  $('#preview').onclick = () => saveToGallery();
  $('#upload').onclick = () => runUserAction('uploadAudio', uploadAudio);
  $('#record').onclick = () => runUserAction('recordAudio', recordAudio);
  $('#stop_recording').onclick = () => stopRecording();
  $('#download_audio').onclick = () => downloadAudio();
  $('#play_sound').onclick = () => playAudioSignal();
  $('svg.progress').onclick = () => runUserAction('Stop', () => { });

  setupAudioNameEditor();

  //setPitchClass();

  runUserAction('showInitialSignal', async () => {
    if (await loadAudioSignal()) {
      await drawWaveform();
      await redrawImg();
    }
  });
}

async function runUserAction(name, async_fn) {
  try {
    base.cancelWorkerCommand();
    await current_op?.cancel();
    current_op = new CurrentOp(name, async_fn);
    await current_op.promise;
  } catch (err) {
    if (!(err instanceof ErrorCancelled))
      throw err;
  }
  current_op = null;
}

function initSettings() {
  if (utils.DEBUG)
    document.body.classList.add('debug');

  initSetting('sampleRate', {
    debug: true,
    units: 'kHz',
    toText: (x) => (x / 1000).toFixed(0),
    addStep: (x, d) => clamp(x * 2 ** Math.sign(d), 3000, 384000),
    onChanged: () => runUserAction('redrawImg', async () => {
      await drawWaveform();
      await redrawImg();
    }),
  });

  initSetting('hue', {
    units: '\u00b0',
    addStep: (x, d) => (x + 10 * d + 360) % 360,
    toText: (x) => x.toFixed(0),
    onChanged: () => runUserAction('redrawImg', async () => {
      //$('#disk').style.filter = 'hue-rotate(' + gconf.hue + 'deg)';
      await redrawImg();
    }),
  });

  initSetting('brightness', {
    delay: 0.0,
    addStep: (x, d) => clamp(x + d * 0.1, -5.5, 5.5),
    toText: (x) => x.toFixed(1),
    onChanged: () => runUserAction('redrawImg', async () => {
      await drawDiskImage();
      await saveImageConfig();
    }),
  });

  initSetting('exposure', {
    debug: true,
    addStep: (x, d) => clamp(x + d * 0.5, -9.5, -0.5),
    toText: (x) => x.toFixed(1),
    onChanged: () => runUserAction('redrawImg', redrawImg),
  });

  initSetting('imageSize', {
    debug: true,
    addStep: (x, d) => clamp(x * 2 ** Math.sign(d), 1, 4096),
    onChanged: () => runUserAction('redrawImg', redrawImg),
  });

  initSetting('numSteps', {
    addStep: (x, d) => clamp(x * 2 ** d | 0, 1, 8192),
    onChanged: () => runUserAction('redrawImg', redrawImg),
  });

  initSetting('stringLen', {
    units: 'ms',
    addStep: (x, d) => clamp(x * 2 ** d, 1, 100),
    toText: (x) => x.toFixed(2),
    onChanged: () => runUserAction('redrawImg', redrawImg),
  });

  initSetting('symmetry', {
    addStep: (x, d) => clamp(x + Math.sign(d), 1, 6),
    onChanged: () => runUserAction('redrawImg', redrawImg),
  });

  initSetting('damping', {
    debug: true,
    addStep: (x, d) => clamp(x + d * 0.1, -6.0, 0.0),
    toText: (x) => x.toFixed(1),
    onChanged: () => runUserAction('redrawImg', redrawImg),
  });
}

function initSetting(name, { debug, delay = 1, units, addStep, onChanged, toText }) {
  dcheck(name in gconf);
  let settings = $('#settings');
  let setting = settings.firstElementChild.cloneNode(true);
  settings.append(setting);
  let value = setting.querySelector('.value');
  toText = toText || (x => x + '');

  if (debug)
    setting.classList.toggle('debug', debug);

  setting.querySelector('.units').textContent = units || '';
  setting.querySelector('.name').textContent =
    name.replace(/[A-Z]/g, (c) => ' ' + c.toLowerCase());
  value.textContent = toText(gconf[name]);
  setting.querySelector('.dec').onclick = () => changeValue(-1);
  setting.querySelector('.inc').onclick = () => changeValue(+1);
  let slider = setting.querySelector('.slider');
  let svgdot = setting.querySelector('svg.dot');
  let linefg = setting.querySelector('line.fg');
  let dotpos = 0, pos0 = 0;

  slider.onclick = (e) => console.debug('sliderPos=' + sliderPos(e).toFixed(4));

  initMouseEvents(setting, {
    capture: (e) => {
      pos0 = sliderPos(e);
      dotpos = +linefg.getAttribute('x2');
      return e.target.tagName == 'circle';
    },
    release: (e) => {
      linefg.setAttribute('x2', '50');
      svgdot.style.left = '50%';
      let pos = clamp(sliderPos(e) - pos0 + 0.5);
      changeValue(pos * 2 - 1);
    },
    move: (e) => {
      let pos = clamp(sliderPos(e) - pos0 + 0.5);
      if (!updateValue(pos * 2 - 1))
        return;
      let pp = (100 * pos).toFixed(2);
      linefg.setAttribute('x2', pp);
      svgdot.style.left = pp + '%';
    },
  });

  let timer = 0;

  function sliderPos(e) {
    return (e.clientX - slider.offsetLeft) / slider.clientWidth;
  }

  function updateValue(dir = 0) {
    let x = addStep(gconf[name], dir);
    if (x != gconf[name])
      value.textContent = toText(x);
    return x;
  }

  async function changeValue(dir = 0) {
    let x = addStep(gconf[name], dir);
    if (x == gconf[name])
      return;
    value.textContent = toText(x);
    gconf[name] = x;
    clearTimeout(timer);
    timer = setTimeout(() => onChanged(gconf[name]), delay * 1000);
  }

  function refresh() {
    value.textContent = toText(gconf[name]);
  }

  ui_settings[name] = { refresh };
}

function initWaveMouseEvents() {
  let wrapper = $('#wave_wrapper');
  initMouseEvents(wrapper, {
    capture: (e) => e.target.classList.contains('ptr'),
    release: () => runUserAction('redrawImg', redrawImg),
    move: (e, dx, target) => {
      let diff = dx / wrapper.clientWidth * mem.audio_signal.length / gconf.sampleRate;
      if (target.id == 'ptr_start')
        setSilenceMarks(mem.sig_start + diff, mem.sig_end);
      if (target.id == 'ptr_end')
        setSilenceMarks(mem.sig_start, mem.sig_end + diff);
    },
  });
}

function initMouseEvents(wrapper, { capture, release, move }) {
  let target = null, touch = null, moved = false;

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
        if (capture(e)) {
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
            release(e, target);
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
            move(e, dx, target);
            moved = true;
          }
          touch = t;
        }
        break;
    }
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
    prepareAudioSignal(mem.audio_signal);
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

function prepareAudioSignal(s) {
  let sum = s.reduce((s, x) => s + x, 0);
  let avg = sum / s.length;
  s.forEach((x, i) => s[i] -= avg);
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
    mem.audio_name = mem.audio_file.name.replace(/\.\w+$/, ''); // drop the .mp3 part

    await decodeAudio();
    await current_op.throwIfCancelled();

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
  $('#audio_name').textContent = mem.audio_name.replace(/_/g, ' ');
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
    await drawLabel();
    await drawRoundWaveform();
    let ts = Date.now();
    let url = await saveDiskImage();
    let url_xs = await saveDiskImagePreview(url);
    $('html > head > link[rel=icon]').href = url_xs;
    await saveImageConfig();
    console.debug('saveDiskImage:', Date.now() - ts, 'ms');
    //await drawGallery();
  } finally {
    is_drawing = false;
  }

  console.debug('image ready:', Date.now() - time, 'ms');
}

async function drawRoundWaveform() {
  let canvas = $('canvas#disk');
  let ctx = canvas.getContext('2d');
  let cw = canvas.width, sw = cw / 6 | 0;
  let img = ctx.getImageData(cw - sw, cw - sw, sw, sw);

  let s = getSelectedAudio(), sn = s.length;
  let smax = s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  let buf = new utils.Float32Tensor([img.width, img.height]);
  let da = new utils.DrawingArea(buf, [-1, 1], [-1, 1]);

  for (let t = 0; t < sn; t++) {
    let r = s[t] / smax;
    r = r * 0.5 + 0.5;
    let a = -t / sn * 2 * Math.PI;
    a += Math.PI / 2;
    buf.data[da.offsetRA(r, a / 2)] += 1;
    buf.data[da.offsetRA(r, a / 2 + Math.PI)] += 1;
  }

  let bmax = buf.max();
  dcheck(bmax >= 0);

  for (let i = 0; i < buf.data.length; i++) {
    let v = Math.sqrt(buf.data[i] / bmax);
    img.data[4 * i + 0] += v * 255;
    img.data[4 * i + 1] += v * 255;
    img.data[4 * i + 2] += v * 255;
  }

  ctx.putImageData(img, cw - sw, cw - sw);
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
    await base.drawDiskImage(canvas, { conf });
  }
}

async function drawStringOscillations() {
  try {
    base.setCircleProgress(0);
    await base.drawStringOscillations(getSelectedAudio(), $('canvas#disk'), gconf, {
      onprogress: (pct) => base.setCircleProgress(pct * 50),
    });
    await current_op.throwIfCancelled();
    await drawDiskImage([0.5, 1.0]);
  } finally {
    base.setCircleProgress(null);
  }
}

async function drawDiskImage([pct_min, pct_max] = [0, 1]) {
  try {
    await base.drawDiskImage($('canvas#disk'), {
      cop: current_op,
      conf: gconf,
      onprogress: (pct) => base.setCircleProgress(100 * utils.mix(pct_min, pct_max, pct)),
    });
  } finally {
    base.setCircleProgress(null);
  }
}

function setupAudioNameEditor() {
  let p = $('#audio_name');
  p.onblur = (e) => {
    drawLabel();
  };
  p.onkeypress = (e) => {
    if (e.keyCode == 13) {
      e.preventDefault();
      p.blur();
    }
  };
}

async function drawLabel() {
  let label = $('#audio_name').textContent;
  let canvas = $('canvas#disk');
  let ctx = canvas.getContext('2d');
  let ch = canvas.height;
  let em = ch * 0.015;
  ctx.font = em + 'px DancingScript';
  ctx.fillStyle = '#888';
  ctx.fillText(label, em, ch - em);
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

async function saveDiskImagePreview(img_url, db_path = base.DB_PATH_IMAGE_XS) {
  dcheck(img_url);
  let img = new Image();
  img.width = 256;
  img.height = 256;
  img.src = img_url;
  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('img.onerror'));
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
    await saveDiskImagePreview(url, base.DB_SAVED_IMAGES_XS + '/' + sid);
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
    wave_drawer.draw(chunk, [xmin, xmin + xlen], 1.0);
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
    $('canvas#disk').toBlob(resolve, 'image/jpeg', 0.85));
  let a = document.createElement('a');
  a.download = mem.audio_name + '.jpg';
  a.href = URL.createObjectURL(blob);
  a.click();
}
