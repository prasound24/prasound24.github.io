
import * as utils from '../lib/utils.js';

const { $, check, dcheck, clone, sleep, DB } = utils;

const DB_TEMP = 'temp_sounds';
const DB_TEMP_SOUNDS = DB_TEMP + '/sounds';
const DB_TEMP_IMAGES = DB_TEMP + '/images';
const DB_TEMP_CONFIGS = DB_TEMP + '/configs';

export const DB_PATH = 'user_samples';
export const DB_PATH_AUDIO = DB_PATH + '/_last/audio';
export const DB_PATH_IMAGE = DB_PATH + '/_last/image';
export const DB_PATH_CONFIG = DB_PATH + '/_last/config';

export const gconf = {};
gconf.sampleRate = 48000;
gconf.stringLen = 9.1; // msec
gconf.numSteps = 512;
gconf.imageSize = 1024;
gconf.damping = -3.1;
gconf.phase = 0; // 0..1 maps to 0..2PI
gconf.symmetry = 2;
gconf.brightness = 0.0;
gconf.exposure = -2.0;
gconf.maxDuration = 15.0; // sec
gconf.maxFileSize = 100e3; // 100 KB
gconf.silenceThreshold = 0.001;
gconf.silencePadding = 2.0;
gconf.color = null;
gconf.hue = 0; // 0..360 degrees

let bg_thread = null;

export function initConfFromURL(conf = gconf) {
  let args = new URLSearchParams(location.search);
  for (let name in conf) {
    let str = args.get('conf.' + name);
    let val = parseFloat(str);
    if (str && Number.isFinite(val)) {
      console.debug('Overridden param: conf.' + name + '=' + val);
      conf[name] = val;
    }
  }
}

export function padAudioWithSilence(a) {
  let n = a.length;
  let b = new Float32Array(n * gconf.silencePadding);
  b.set(a, (b.length - a.length) / 2);
  return b;
}

export function findSilenceMarks(signal, threshold, num_frames) {
  let right = signal.length - findSilenceLeft(signal.reverse(), threshold, num_frames);
  let left = findSilenceLeft(signal.reverse(), threshold, num_frames);
  return [left, right];
}

function findSilenceLeft(signal, threshold, num_frames) {
  let n = signal.length;
  let smin = signal[0], smax = signal[0];

  for (let i = 0; i < n; i++) {
    smin = Math.min(smin, signal[i]);
    smax = Math.max(smax, signal[i]);
  }

  let cmin = 0, cmax = 0, frame = -1;

  for (let i = 0; i < n; i++) {
    let f = i / n * num_frames | 0;
    dcheck(f >= 0);
    if (f > frame) {
      cmin = Infinity;
      cmax = -Infinity;
      frame = f;
    }
    cmin = Math.min(cmin, signal[i]);
    cmax = Math.max(cmax, signal[i]);
    if (cmax - cmin > threshold * (smax - smin))
      return i;
  }

  return signal.length;
}

export async function loadAudioSignal(src) {
  if (!src)
    return await DB.get(DB_PATH_AUDIO);

  if (src.startsWith('db:'))
    return await loadTempSound(src.slice(3));

  let res = await fetch('/mp3/' + src + '.mp3');
  check(res.status == 200, src + '.mp3 not found');
  let blob = await res.blob();
  return new File([blob], src + '.mp3', { type: blob.type });
}

export async function saveTempSounds(files) {
  let time = Date.now();
  console.log('Cleaning up old sounds');
  await DB.remove(DB_TEMP_SOUNDS);
  await DB.remove(DB_TEMP_IMAGES);
  await DB.remove(DB_TEMP_CONFIGS);

  console.log('Saving sounds to DB');
  let db_id_base = new Date().toJSON().replace(/[-:T]|\.\d+Z$/g, '');
  let count = 0;
  let additions = [...files].map(async (file) => {
    count++;
    let sid = db_id_base + '_' + count; // sound id

    try {
      checkFileSize(file);
      await saveTempSound(sid, file);
    } catch (err) {
      console.error(err);
    }
  });

  await Promise.all(additions);
  console.log('Sounds saved in', Date.now() - time, 'ms');
}

export async function saveTempSound(sid, file) {
  await DB.set(DB_TEMP_SOUNDS + '/' + sid, file);
}

export async function loadTempSound(sid) {
  return await DB.get(DB_TEMP_SOUNDS + '/' + sid);
}

export async function playTempSound(sid, sample_rate) {
  let ts = Date.now();
  let blob = await loadTempSound(sid);
  let sound = await utils.decodeAudioFile(blob, sample_rate);
  await utils.playSound(sound, sample_rate, {
    onstarted: () => console.debug('Delay to sound playing:', Date.now() - ts, 'ms'),
  });
}

export async function loadTempSoundImage(sid) {
  return DB.get(DB_TEMP_IMAGES + '/' + sid);
}

export async function saveTempSoundImage(sid, image) {
  await DB.set(DB_TEMP_IMAGES + '/' + sid, image);
}

export async function loadTempSoundConfig(sid) {
  return await DB.get(DB_TEMP_CONFIGS + '/' + sid);
}

export async function saveTempSoundConfig(sid, conf) {
  return await DB.set(DB_TEMP_CONFIGS + '/' + sid, conf);
}

export async function getTempSoundIds() {
  return await DB.keys(DB_TEMP_SOUNDS);
}

function initWorker() {
  if (bg_thread)
    return;
  console.log('starting bg_thread.js');
  bg_thread = new Worker('/create/bg_thread.js', { type: 'module' });
}

function postWorkerCommand({ command, handlers }) {
  initWorker();
  dcheck(!command.txid);
  let txid = Math.random().toString(16).slice(2);
  bg_thread.onmessage = (e) => {
    let type = e.data.type;
    let handler = handlers[type];
    //console.info('[bg->main]', 'type=' + type, 'progress=' + e.data.progress);
    dcheck(handler, 'handlers.' + type + ' is null');
    handler.call(null, e);
  };
  //console.info('[main->bg]', 'type=' + command.type);
  bg_thread.postMessage({ ...command, txid });
}

export async function drawStringOscillations(signal, canvas, conf, { onprogress } = {}) {
  await new Promise((resolve) => {
    postWorkerCommand({
      command: { type: 'wave_1d', signal, config: clone(conf) },
      handlers: {
        'wave_1d': (e) => {
          let p = e.data.progress;
          onprogress?.call(null, p);
          if (p == 1.00) resolve();
        }
      },
    });
  });
}

export async function drawOscillationFreqs(conf, { onprogress } = {}) {
  await new Promise((resolve) => {
    postWorkerCommand({
      command: { type: 'img_freqs', config: clone(conf) },
      handlers: {
        'img_freqs': (e) => {
          if (e.data.progress < 1.00)
            onprogress?.call(null, e.data.progress);
          else
            resolve();
        },
      },
    });
  });
}

export async function drawDiskImage(canvas, cfg) {
  let ds = cfg.imageSize;
  let config = clone(cfg);

  let img_data = await new Promise((resolve) => {
    postWorkerCommand({
      command: { type: 'draw_disk', config },
      handlers: {
        'draw_disk': (e) => resolve(e.data.img_data),
      },
    });
  });

  canvas.width = ds;
  canvas.height = ds;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, ds, ds);
  img.data.set(img_data);
  ctx.putImageData(img, 0, 0);
  await sleep(0);
}

export function checkFileSize(file) {
  if (file.size <= gconf.maxFileSize)
    return;
  let max = (gconf.maxFileSize / 1024).toFixed(0) + ' KB';
  let cur = (file.size / 1024).toFixed(0) + ' KB';
  throw new Error('The max file size is ' + max + '. ' +
    'The selected file "' + file.name + '" is ' + cur + '.');
}

// value=0..100, or value=null to hide
export function setCircleProgress(value = 100, svg = $('svg.progress')) {
  let c = svg.querySelector('circle');
  if (!c) {
    let r = 100 / 2 / Math.PI, sw = 0.25;
    svg.setAttribute('viewBox', [-r - sw / 2, -r - sw / 2, 2 * r + sw, 2 * r + sw].join(' '));
    c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', r);
    svg.append(c);
  }
  c.setAttribute('stroke-dashoffset', 100 - utils.clamp(Math.round(value), 0, 100));
  svg.style.display = Number.isFinite(value) ? '' : 'none';
}

export function initWaveformDrawer(canvas) {
  let cw = canvas.width;
  let ch = canvas.height;
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  let img = ctx.getImageData(0, 0, cw, ch);

  clear();

  function clear() {
    new Int32Array(img.data.buffer).fill(0x00FFFFFF);
    ctx.putImageData(img, 0, 0);
  }

  function draw(sig, [xmin, xmax] = [0, 1], aminmax = []) {
    if (xmax < 0.0 || xmin > 1.0 || !sig.length)
      return;

    let [amin, amax] = aminmax;

    if (!amin && !amax) {
      amin = sig[0];
      amax = sig[0];
      for (let i = 0; i < sig.length; i++) {
        amin = Math.min(amin, sig[i]);
        amax = Math.max(amax, sig[i]);
      }
    }

    for (let t = 0; t < sig.length; t++) {
      let x = Math.round(cw * utils.mix(xmin, xmax, t / (sig.length - 1)));
      let a = (sig[t] - amin) / (amax - amin);
      let y = Math.round(ch * (1 - a));
      if (x >= 0 || x < cw || y >= 0 || y < ch)
        img.data[(y * cw + x) * 4 + 3] += 255 * cw / sig.length * 25;
    }

    let dirty_xmin = Math.floor(xmin * cw);
    let dirty_xmax = Math.ceil(xmax * cw);
    ctx.putImageData(img, 0, 0, dirty_xmin, 0, dirty_xmax - dirty_xmin + 1, ch);
    return img;
  }

  return { draw, clear };
}
