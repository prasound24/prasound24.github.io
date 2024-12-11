
import * as utils from '../lib/utils.js';
import { GpuContext } from '../webgl2.js';

const { $, check, dcheck, clone, sleep, DB } = utils;

const DB_TEMP = 'temp_sounds';
const DB_TEMP_SOUNDS = DB_TEMP + '/sounds';
const DB_TEMP_IMAGES = DB_TEMP + '/images';
const DB_TEMP_CONFIGS = DB_TEMP + '/configs';

// sounds saved by the user
export const DB_SAVED = 'saved_sounds';
export const DB_SAVED_SOUNDS = DB_SAVED + '/sounds';
export const DB_SAVED_IMAGES = DB_SAVED + '/images';
export const DB_SAVED_IMAGES_XS = DB_SAVED + '/images_xs';
export const DB_SAVED_CONFIGS = DB_SAVED + '/configs';

export const DB_PATH = 'user_samples';
export const DB_PATH_AUDIO = DB_PATH + '/_last/audio';
export const DB_PATH_IMAGE = DB_PATH + '/_last/image';
export const DB_PATH_IMAGE_XS = DB_PATH + '/_last/image_xs';
export const DB_PATH_CONFIG = DB_PATH + '/_last/config';

export const gconf = {};
gconf.sampleRate = 48000;
gconf.stringLen = 9.1; // msec
gconf.numSteps = 32;
gconf.imageSize = 1024;
gconf.damping = -3.1;
gconf.symmetry = 2;
gconf.brightness = 0.0;
gconf.exposure = -2.0;
gconf.maxDuration = 60; // 1 min
gconf.maxFileSize = 1e6; // 1 MB
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

export function createSID() {
  return new Date().toJSON().replace(/[-:T]|\.\d+Z$/g, '');
}

export async function loadAudioConfig(src) {
  if (!src)
    return await DB.get(DB_PATH_CONFIG);

  if (src.startsWith('db:'))
    return await DB.get(DB_SAVED_CONFIGS + '/' + src.slice(3));
}

export async function loadAudioImage(src) {
  if (!src)
    return await DB.get(DB_PATH_IMAGE);

  if (src.startsWith('db:'))
    return await DB.get(DB_SAVED_IMAGES + '/' + src.slice(3));
}

export async function loadAudioSignal(src) {
  if (!src)
    return await DB.get(DB_PATH_AUDIO);

  if (src.startsWith('db:')) {
    let tmp = await loadTempSound(src.slice(3));
    return tmp || await DB.get(DB_SAVED_SOUNDS + '/' + src.slice(3));
  }

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
  let db_id_base = createSID();
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
  if (handlers) {
    bg_thread.onmessage = (e) => {
      let type = e.data.type;
      let handler = handlers[type];
      //console.info('[bg->main]', 'type=' + type, 'progress=' + e.data.progress);
      dcheck(handler, 'handlers.' + type + ' is null');
      handler(e);
    };
  }
  //console.info('[main->bg]', 'type=' + command.type);
  bg_thread.postMessage({ ...command, txid });
  return txid;
}

export function cancelWorkerCommand() {
  postWorkerCommand({ command: { type: 'cancel' } });
}

export async function drawStringOscillations(signal, canvas, conf, { cop, onprogress } = {}) {
  await new Promise((resolve, reject) => {
    postWorkerCommand({
      command: { type: 'wave_1d', signal, config: clone(conf) },
      handlers: {
        'wave_1d': (e) => {
          if (e.data.error)
            return reject(new Error(e.data.error));
          let p = e.data.progress;
          onprogress?.call(null, p);
          if (p == 1.00) resolve();
        }
      },
    });
  });
}

export async function drawDiskImage(canvas, { cop, conf, onprogress } = {}) {
  let ds = conf.imageSize;
  let config = clone(conf);

  let res = await new Promise((resolve, reject) => {
    postWorkerCommand({
      command: { type: 'draw_disk', config },
      handlers: {
        'draw_disk': (e) => {
          if (e.data.error)
            return reject(new Error(e.data.error));
          if (onprogress && e.data.progress)
            onprogress(e.data.progress);
          if (e.data.result)
            resolve(e.data.result);
        },
      },
    });
  });

  let { img_amps, img_freq, sig_freqs, brightness } = res;

  await cop?.throwIfCancelled();

  await utils.time('drawFrameGPU:', async () => {
    canvas.width = ds;
    canvas.height = ds;
    let img_data = await drawFrameGPU();
    let ctx = canvas.getContext('2d', { willReadFrequently: true });
    let img = ctx.getImageData(0, 0, ds, ds);
    img.data.set(img_data);
    ctx.putImageData(img, 0, 0);
  });

  async function drawFrameGPU() {
    let canvas_webgl = canvas.cloneNode();
    let ctx = new GpuContext(canvas_webgl);
    try {
      ctx.init();
      let shader = await initShader(ctx, 'draw_img');
      let ch0 = new Float32Array(ds * ds * 2);
      for (let i = 0; i < ds * ds; i++) {
        ch0[2 * i + 0] = img_amps[i];
        ch0[2 * i + 1] = img_freq[i];
      }
      let iChannel0 = ctx.createFrameBuffer(ds, ds, 2, ch0);
      let bufferA = ctx.createFrameBuffer(ds, ds, 4);
      let args = {
        iChannel0, iResolution: [ds, ds],
        iBrightness: brightness,
        iSigFreqs: sig_freqs,
        iHue: conf.hue,
        iSampleRate: conf.sampleRate,
      };
      shader.draw(args, bufferA);
      //bufferA.draw();

      await cop?.throwIfCancelled();

      let rgba = await utils.time('GPU->CPU download:', () => bufferA.download());
      for (let i = 0; i < rgba.length; i++)
        rgba[i] *= 255;
      return rgba;
    } finally {
      ctx.destroy();
      canvas_webgl.width = 0;
      canvas_webgl.height = 0;
    }
  }

  async function initShader(ctx, filename) {
    let adapter = await utils.fetchText('./adapter.glsl');
    let user_shader = await utils.fetchText('./' + filename + '.glsl');
    let fshader = adapter.replace('//#include ${USER_SHADER}', user_shader);
    return ctx.createTransformProgram({ fshader });
  }
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
    let r = 100 / 2 / Math.PI, sw = 3.5, size = r + sw * 2; // stroke width
    svg.setAttribute('viewBox', [-size, -size, 2 * size, 2 * size].join(' '));
    c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('r', r);
    svg.append(c);

    let cross = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cross.setAttribute('class', 'cross');
    svg.append(cross);

    for (let [x1, y1] of [[-1, -1], [+1, -1]]) {
      let line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      let scale = r / 3;
      line.setAttribute('x1', -x1 * scale);
      line.setAttribute('y1', -y1 * scale);
      line.setAttribute('x2', +x1 * scale);
      line.setAttribute('y2', +y1 * scale);
      cross.append(line);
    }
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

  function draw(sig, [xmin, xmax] = [0, 1], amax = 0.0) {
    let sn = sig.length;
    if (xmax < 0.0 || xmin > 1.0 || !sn)
      return;

    amax = amax || sig.reduce((s, x) => Math.max(s, Math.abs(x)), 0);

    let area = new utils.Float32Tensor([ch, cw]);
    let mapper = new utils.DrawingArea(area, [0, 1], [-1, 1]);

    for (let t = 0; t < sn; t++) {
      let x = utils.mix(xmin, xmax, (t + 0.5) / sn);
      let i = mapper.offsetXY(x, sig[t] / amax);
      if (i >= 0) area.data[i] += 1.0;
    }

    let bmax = area.max();

    for (let i = 0; i < area.data.length; i++) {
      let v = Math.pow(area.data[i] / bmax, 0.2);
      img.data[4 * i + 3] = 255 * v;
    }

    let dirty_xmin = Math.floor(xmin * cw);
    let dirty_xmax = Math.ceil(xmax * cw);
    ctx.putImageData(img, 0, 0, dirty_xmin, 0, dirty_xmax - dirty_xmin + 1, ch);
    return img;
  }

  return { draw, clear };
}
