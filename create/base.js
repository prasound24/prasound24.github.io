
import * as utils from '../utils.js';

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
gconf.numSteps = 1024;
gconf.imageSize = 2048;
gconf.damping = -3.1;
gconf.stiffness = -10.0;
gconf.frequency = -10.0;
gconf.boundary = 1.0;
gconf.symmetry = 2;
gconf.brightness = 0.0;
gconf.exposure = -2.0;
gconf.maxDuration = 15.0; // sec
gconf.maxFileSize = 100e3; // 100 KB
gconf.silenceThreshold = 0.003;
gconf.silencePadding = 2.0;
gconf.color = null;
gconf.hue = 0; // 0..360 degrees

let bg_thread = null;

export function padAudioWithSilence(a) {
  let n = a.length;
  let b = new Float32Array(n * gconf.silencePadding);
  b.set(a, (b.length - a.length) / 2);
  return b;
}

export function findSilenceMarks(signal, threshold) {
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

export async function loadAudioSignal(src) {
  if (!src)
    return await DB.get(DB_PATH_AUDIO);

  if (src.startsWith('db:'))
    return await base.loadTempSound(src.slice(3));

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
  bg_thread.postMessage({ ...command, txid });
  bg_thread.onmessage = (e) => {
    console.debug('received message:', e.data.type);
    let handler = handlers[e.data.type];
    dcheck(handler);
    handler.call(null, e);
  };
}

export async function drawStringOscillations(signal, canvas, cfg, { onprogress } = {}) {
  // let width = cfg.stringLen; // oscillating string length
  // canvas.width = cfg.stringLen;
  // canvas.height = cfg.numSteps;
  // let ctx = canvas.getContext('2d', { willReadFrequently: true });
  // let img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  await new Promise((resolve) => {
    postWorkerCommand({
      command: { type: 'wave_1d', signal, config: clone(cfg) },
      handlers: {
        img_data: (e) => {
          let [ymin, ymax] = e.data.rows;
          //let img_data = e.data.img_data;
          //dcheck(img_data.length == (ymax - ymin + 1) * width * 4);
          //img.data.set(img_data, ymin * width * 4);
          //ctx.putImageData(img, 0, 0);
          //console.debug('updated img data: ' + ymin + '..' + ymax);
          onprogress?.call(null, ymax / cfg.numSteps);
        },
        img_done: (e) => {
          resolve();
        },
      },
    });
  });

  // ctx.putImageData(img, 0, 0);
  await sleep(5);
}

export async function drawDiskImage(canvas, cfg, { smooth = false } = {}) {
  let ds = cfg.imageSize;
  let config = clone(cfg);
  config.smooth = smooth;

  let img_data = await new Promise((resolve) => {
    postWorkerCommand({
      command: { type: 'draw_disk', config },
      handlers: {
        disk: (e) => resolve(e.data.img_data),
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
