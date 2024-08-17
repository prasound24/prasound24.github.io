import { FFT } from './webfft.js';

let { min, max, sin, cos, abs, PI } = Math;

export const DEBUG = location.hostname == '0.0.0.0' || location.hostname == 'localhost';

export const fft = FFT;
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);
export const log = (...args) => console.log(args.join(' '));
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
export const mix = (a, b, x) => a * (1 - x) + b * x;
export const step = (min, x) => x < min ? 0 : 1;
export const sqr = (x) => x * x;
export const clamp = (x, min = 0, max = 1) => Math.max(Math.min(x, max), min);
export const hann = (x) => x > 0 && x < 1 ? sqr(Math.sin(Math.PI * x)) : 0;
export const hann_ab = (x, a, b) => hann((x - a) / (b - a));
export const sinc = (x) => Math.abs(x) < 1e-6 ? 1.0 : sin(x) / x;
export const lanczos = (x, p) => sinc(PI * x) * sinc(PI * x / p);
export const lanczos_ab = (x, p, a, b) => lanczos((x - a) / (b - a) * 2 - 1, p);
export const fract = (x) => x - Math.floor(x);
export const reim2 = (re, im) => re * re + im * im;
export const is_pow2 = (x) => (x & (x - 1)) == 0;
export const hhmmss = (sec) => new Date(sec * 1000).toISOString().slice(11, -1);
export const dcheck = (x) => { if (x) return; debugger; throw new Error('dcheck failed'); }

export class Float32Tensor {
  constructor(dims, data) {
    let size = dims.reduce((p, d) => p * d, 1);
    dcheck(!data || data.length == size);

    // ds[i] = dims[i + 1] * dims[i + 2] * ...
    let dim = dims, ds = dim.slice(), n = ds.length;

    ds[n - 1] = 1;
    for (let i = n - 2; i >= 0; i--)
      ds[i] = ds[i + 1] * dim[i + 1];

    this.data = data || new Float32Array(size);

    this.rank = dims.length;
    this.dims = dims;
    this.dim_size = ds;

    this.array = this.data; // don't use
    this.dimensions = this.dims; //  don't use
  }

  at(...indexes) {
    dcheck(indexes.length == this.rank);
    let offset = 0;
    for (let i = 0; i < this.rank; i++)
      offset += indexes[i] * this.dim_size[i];
    return this.data[offset];
  }

  slice(begin, end) {
    dcheck(begin >= 0 && begin < end && end <= this.dims[0]);
    let size = this.dim_size[0];
    let dims = this.dims.slice(1);
    let data = this.data.subarray(begin * size, end * size);
    return new Float32Tensor([end - begin, ...dims], data);
  }

  subtensor(index) {
    let t = this.slice(index, index + 1);
    let d = t.dims;
    dcheck(d[0] == 1);
    return new Float32Tensor(d.slice(1), t.data);
  }

  transpose() {
    dcheck(this.rank >= 2);
    let [n, m, ...ds] = this.dims;
    let dsn = this.dim_size[1];
    let r = new Float32Tensor([m, n, ...ds]);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        let jni = (j * n + i) * dsn;
        let imj = (i * m + j) * dsn;
        for (let k = 0; k < dsn; k++)
          r.data[jni + k] = this.data[imj + k];
      }
    }
    return r;
  }

  clone() {
    return new Float32Tensor(this.dims.slice(), this.data.slice(0));
  }

  max() {
    return this.data.reduce((s, x) => Math.max(s, x), -Infinity);
  }
}

// (1, 0) -> (1, 0)
// (-1, +0) -> (1, +PI)
// (-1, -0) -> (1, -PI)
export function xy2ra(x, y) {
  let r = Math.sqrt(x * x + y * y);
  let a = Math.atan2(y, x); // -PI..PI
  return [r, a]
}

// Returns null if no file was selected.
export async function selectAudioFile({ multiple = false } = {}) {
  let input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.multiple = multiple;
  input.click();
  return await new Promise(resolve =>
    input.onchange = () => resolve(multiple ? input.files : input.files[0]));
}

// Returns a Float32Array.
export async function decodeAudioFile(file, sample_rate = 48000) {
  let encoded_data = file instanceof Blob ? await file.arrayBuffer() : file;
  let audio_ctx = new AudioContext({ sampleRate: sample_rate });
  try {
    let cloned_data = encoded_data.slice(0);
    let audio_buffer = await audio_ctx.decodeAudioData(cloned_data);
    let channel_data = audio_buffer.getChannelData(0);
    return channel_data;
  } finally {
    audio_ctx.close();
  }
}

export async function playSound(sound_data, sample_rate) {
  let audio_ctx = new AudioContext({ sampleRate: sample_rate });
  try {
    let buffer = audio_ctx.createBuffer(1, sound_data.length, sample_rate);
    buffer.getChannelData(0).set(sound_data);
    let source = audio_ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(audio_ctx.destination);
    source.start();
    await new Promise(resolve => source.onended = resolve);
  } finally {
    audio_ctx.close();
  }
}

// Returns an audio/wav Blob.
export async function recordAudio({ sample_rate = 48000, max_duration = 1.0 } = {}) {
  let stream = await navigator.mediaDevices.getUserMedia({ audio: true, sampleRate: sample_rate });
  try {
    let recorder = new AudioRecorder(stream, sample_rate);
    await recorder.start();

    if (max_duration > 0)
      await sleep(max_duration * 1000);
    else if (max_duration instanceof Promise)
      await max_duration;
    else
      dcheck('Invalid max_duration: ' + max_duration);

    let blob = await recorder.fetch();
    await recorder.stop();
    return blob;
  } finally {
    stream.getTracks().map(t => t.stop());
  }
}

export class AudioRecorder {
  constructor(stream, sample_rate) {
    this.stream = stream;
    this.sample_rate = sample_rate;
    this.onaudiodata = null;
    this.onaudiochunk = null;

    this.audio_blob = null;
    this.audio_ctx = null;
    this.worklet = null;
    this.mss = null;
    this.stream_ended = null;
  }

  async start() {
    try {
      await this.init();
    } catch (err) {
      this.close();
      throw err;
    }

    let stream = this.stream;
    if (!stream.active)
      throw new Error('Stream is not active: ' + stream.id);

    this.stream_ended = new Promise((resolve) => {
      if ('oninactive' in stream) {
        console.debug('Watching for stream.oninactive');
        stream.addEventListener('inactive', resolve);
      } else {
        console.debug('Started a timer waiting for !stream.active');
        let timer = setInterval(() => {
          if (!stream.active) {
            resolve();
            clearInterval(timer);
            console.debug('Stopped the !stream.active timer');
          }
        }, 50);
      }
    });

    this.stream_ended.then(async () => {
      console.debug('Audio stream ended');
      this.stop();
    });
  }

  async stop() {
    await this.fetch();
    this.close();
  }

  async init() {
    log('Initializing the mic recorder @', this.sample_rate, 'Hz');
    this.audio_ctx = new AudioContext({ sampleRate: this.sample_rate });

    await this.audio_ctx.audioWorklet.addModule('/create/mic_thread.js');
    this.worklet = new AudioWorkletNode(this.audio_ctx, 'mic_thread');
    // this.worklet.onprocessorerror = (e) => console.error('mic_thread worklet:', e);
    this.worklet.port.onmessage = (e) => {
      // usually it's 128 samples per chunk
      if (e.data.chunk && this.onaudiochunk)
        this.onaudiochunk(e.data.chunk);
    };

    this.mss = this.audio_ctx.createMediaStreamSource(this.stream);
    this.mss.connect(this.worklet);
    await this.audio_ctx.resume();
  }

  async fetch() {
    if (!this.worklet) return;
    log('Fetching audio data from the worklet');
    this.worklet.port.postMessage('fetch-all');
    let { channels } = await new Promise((resolve) => {
      this.worklet.port.onmessage = (e) => {
        if (e.data.channels)
          resolve(e.data);
      }
    });;

    dcheck(channels.length > 0);
    let blob = new Blob(channels[0]);
    let data = await blob.arrayBuffer();
    dcheck(data.byteLength % 4 == 0);
    let wave = new Float32Array(data);
    log('Recorded audio:', (wave.length / this.sample_rate).toFixed(2), 'sec');
    this.audio_blob = generateWavFile(wave, this.sample_rate);
    this.onaudiodata?.(this.audio_blob);
    return this.audio_blob;
  }

  close() {
    this.mss?.disconnect();
    this.worklet?.disconnect();
    this.audio_ctx?.close();
    this.mss = null;
    this.worklet = null;
    this.audio_ctx = null;
  }
}

// https://docs.fileformat.com/audio/wav
export function generateWavFile(wave, sample_rate) {
  let len = wave.length;
  let i16 = new Int16Array(22 + len + len % 2);
  let i32 = new Int32Array(i16.buffer);

  i16.set([
    0x4952, 0x4646, 0x0000, 0x0000, 0x4157, 0x4556, 0x6d66, 0x2074,
    0x0010, 0x0000, 0x0001, 0x0001, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0002, 0x0010, 0x6164, 0x6174, 0x0000, 0x0000]);

  i32[1] = i32.length * 4; // file size
  i32[6] = sample_rate;
  i32[7] = sample_rate * 2; // bytes per second
  i32[10] = len * 2; // data size

  for (let i = 0; i < len; i++)
    i16[22 + i] = wave[i] * 0x7FFF;

  return new Blob([i16.buffer], { type: 'audio/wav' });
}

export async function decodeWavFile(blob) {
  let i16 = new Int16Array(await blob.arrayBuffer());
  let res = new Float32Array(i16.subarray(22));
  for (let i = 0; i < res.length; i++)
    res[i] /= 0x7FFF;
  return res;
}

// await showStatus("foobar", { "exit": () => ... })
export async function showStatus(text, buttons) {
  let str = Array.isArray(text) ? text.join(' ') : text + '';
  str && console.info(str);
  let status = initStatusBar();
  status.style.display = str || buttons ? '' : 'none';
  status.innerText = str;
  if (buttons) {
    for (let name in buttons) {
      let handler = buttons[name];
      let a = document.createElement('a');
      a.innerText = name;
      if (typeof handler == 'function')
        a.onclick = () => { a.onclick = null; handler(); };
      else if (typeof handler == 'string')
        a.href = handler;
      else
        throw new Error('Invalid button handler for ' + name);
      a.style.textDecoration = 'underline';
      a.style.cursor = 'pointer';
      a.style.marginLeft = '1em';
      a.style.color = 'inherit';
      status.append(a);
    }
  }
  await sleep(15);
}

export function hideStatus() {
  showStatus('');
}

function initStatusBar() {
  let id = 'status_283992';
  let status = $('#' + id);
  if (status) return status;

  status = document.createElement('div');
  status.id = id;
  status.style.background = '#112';
  status.style.color = '#fff';
  status.style.padding = '0.25em';
  status.style.display = 'none';

  let middle = document.createElement('div');
  middle.style.zIndex = '432';
  middle.style.position = 'fixed';
  middle.style.width = '100%';
  middle.style.top = '50%';
  middle.style.textAlign = 'center';

  middle.append(status);
  document.body.append(middle);
  return status;
}

export function setUncaughtErrorHandlers() {
  window.onerror = (event, source, lineno, colno, error) => showStatus(error);
  window.onunhandledrejection = (event) => showStatus(event.reason);
}

// An indexedDB wrapper:
//
//    db = DB.open("foo");
//    tab = db.openTable("bar");
//    await tab.set("key", "value");
//    val = await tab.get("key");
//
//    tab = DB.open("foo/bar"); // short form
//
export class DB {
  static open(name) {
    if (name.indexOf('/') < 0)
      return new DB(name);
    let [db_name, tab_name, ...etc] = name.split('/');
    dcheck(etc.length == 0);
    return DB.open(db_name).openTable(tab_name);
  }

  static get(key_path) {
    let [db_name, tab_name, key_name, ...etc] = key_path.split('/');
    dcheck(etc.length == 0);
    return DB.open(db_name).openTable(tab_name).get(key_name);
  }

  static set(key_path, val) {
    let [db_name, tab_name, key_name, ...etc] = key_path.split('/');
    dcheck(etc.length == 0);
    return DB.open(db_name).openTable(tab_name).set(key_name, val);
  }

  constructor(name) {
    dcheck(name.indexOf('/') < 0);
    this.name = name;
    this.version = 1;
    this.tnames = new Set();
  }
  openTable(name) {
    if (this.tnames.has(name))
      throw new Error(`Table ${this.name}.${name} is alredy opened.`);
    let t = new IndexedDBTable(name, this);
    this.tnames.add(name);
    return t;
  }
  _init() {
    if (this.ready)
      return this.ready;
    let time = Date.now();
    this.ready = new Promise((resolve, reject) => {
      let req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = (e) => {
        log(this.name + ':upgradeneeded');
        let db = e.target.result;
        for (let tname of this.tnames) {
          log('Opening a table:', tname);
          db.createObjectStore(tname);
        }
      };
      req.onsuccess = (e) => {
        // log(this.name + ':success', Date.now() - time, 'ms');
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = e => {
        console.error(this.name + ':error', e);
        reject(e);
      };
    });
    return this.ready;
  }
}

class IndexedDBTable {
  constructor(name, db) {
    dcheck(name.indexOf('/') < 0);
    this.name = name;
    this.db = db;
  }
  async get(key) {
    let db = await this.db._init();
    return new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readonly');
      let s = t.objectStore(this.name);
      let r = s.get(key);
      r.onerror = () => reject(new Error(`${this.name}.get(${key}) failed: ${r.error}`));
      r.onsuccess = () => resolve(r.result);
    });
  }
  async set(key, value) {
    let db = await this.db._init();
    await new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readwrite');
      let s = t.objectStore(this.name);
      let r = s.put(value, key);
      r.onerror = () => reject(new Error(`${this.name}.set(${key}) failed: ${r.error}`));
      r.onsuccess = () => resolve();
    });
  }
  async remove(key) {
    let db = await this.db._init();
    await new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readwrite');
      let s = t.objectStore(this.name);
      let r = s.delete(key);
      r.onerror = () => reject(new Error(`${this.name}.remove(${key}) failed: ${r.error}`));
      r.onsuccess = () => resolve();
    });
  }
  async keys() {
    let db = await this.db._init();
    return new Promise((resolve, reject) => {
      let t = db.transaction(this.name, 'readonly');
      let s = t.objectStore(this.name);
      let r = s.getAllKeys();
      r.onerror = () => reject(new Error(`${this.name}.keys() failed: ${r.error}`));
      r.onsuccess = () => resolve(r.result);
    });
  }
}

export function hsl2rgb(h, s = 1.0, l = 0.5) {
  if (!s) return [l, l, l];

  let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  let p = 2 * l - q;
  let r = hue2rgb(p, q, h + 1 / 3);
  let g = hue2rgb(p, q, h);
  let b = hue2rgb(p, q, h - 1 / 3);

  return [r, g, b];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function rgb2hsl(r, g, b) {
  let vmax = max(r, g, b);
  let vmin = min(r, g, b);
  let c = vmax - vmin; // chroma
  let h, l = (vmax + vmin) / 2;
  let s = 0.5 * c / min(l, 1.0 - l);

  if (!c) return [0, 0, l];

  if (vmax == r) h = (g - b) / c + (g < b ? 6 : 0);
  if (vmax == g) h = (b - r) / c + 2;
  if (vmax == b) h = (r - g) / c + 4;

  return [h / 6, s, l];
}

export function rgb2hcl(r, g, b) {
  let [h, s, l] = rgb2hsl(r, g, b);
  let c = s * min(l, 1.0 - l) * 2;
  return [h, c, l];
}

export function hcl2rgb(h, c, l) {
  let s = 0.5 * c / min(l, 1.0 - l);
  return hsl2rgb(h, min(s, 1.0), l);
}

export async function ctcheck(ctoken) {
  if (!ctoken || Date.now() < 100 + (ctoken.time || 0))
    return;
  await sleep(1);
  if (ctoken.cancelled)
    throw new Error('Cancelled');
  ctoken.time = Date.now();
}

export async function reverseDiskMapping(src, res, { fs_full = false, r_zoom = 1, num_reps = 1, ctoken }) {
  dcheck(res.rank == 2 && src.rank == 2);
  let [h, w] = res.dims;
  let [sh, sw] = src.dims;
  dcheck(h * w > 0 && sh * sw > 0);

  for (let y = 0; y < h; y++) {
    await ctcheck(ctoken);
    for (let x = 0; x < w; x++) {
      let dx = (x - 0.5) / w * 2 - 1;
      let dy = (y - 0.5) / h * 2 - 1;
      let [r, a] = xy2ra(dy, dx);
      if (r >= 1.0) continue;

      a = (a / Math.PI * 0.5 + 1.0) % 1.0;

      if (fs_full)
        r = r * (a > 0.5 ? 0.5 : -0.5);
      r = r / r_zoom;
      r = (r % 1 + 1) % 1;
      a = a * num_reps % 1;
      // dcheck(r >= 0 && r <= 1);
      // dcheck(a >= 0 && a <= 1);

      let t = Math.min(Math.round(r * sh), sh - 1);
      let f = Math.min(Math.round(a * sw), sw - 1);
      res.data[y * w + x] = src.data[t * sw + f];
    }
  }
}

async function resampleData(src, res, { ctoken, coords_fn, num_steps }) {
  dcheck(src.rank == 2 && res.rank == 2);
  const lw = 1;
  let [src_r, src_a] = src.dims;
  let [res_h, res_w] = res.dims;
  let r_steps = src_r * max(1, Math.ceil(num_steps[0] / src_r));
  let a_steps = src_a * max(1, Math.ceil(num_steps[1] / src_a));
  let weights = new Float32Tensor([res_h, res_w]);

  res.data.fill(0);

  let lanczos_xy = (x, y) =>
    lanczos(x, lw) * lanczos(y, lw);

  let interpolate_src = (r, a) => {
    let a0 = Math.round(a);
    let r0 = Math.round(r);
    if (a == a0 && r == r0 || lw == 0)
      return src.at(r0, a0);
    let sum = 0;
    for (let i = -lw; i <= lw; i++) {
      for (let j = -lw; j <= lw; j++) {
        if (i && j) continue;
        let a1 = a0 + i, r1 = r0 + j;
        if (a1 < 0 || a1 >= src_a || r1 < 0 || r1 >= src_r)
          continue;
        let w = lanczos_xy(a1 - a, r1 - r);
        sum += src.at(r1, a1) * w;
      }
    }
    return sum;
  };

  for (let sr = 0; sr < r_steps; sr++) {
    await ctcheck(ctoken);
    for (let sa = 0; sa < a_steps; sa++) {
      let r = sr / r_steps * src_r;
      let a = sa / a_steps * src_a;

      for (let [x, y] of coords_fn(a, r)) {
        x = Math.round(x);
        y = Math.round(y);
        if (x < 0 || x >= res_w || y < 0 || y >= res_h)
          continue;
        let val = interpolate_src(r, a);
        res.data[y * res_w + x] += val;
        weights.data[y * res_w + x] += 1.0;
      }
    }
  }

  for (let i = 0; i < res.data.length; i++)
    if (weights.data[i] > 0)
      res.data[i] /= weights.data[i];
}

export async function resampleDisk(src, res, { ctoken, fs_full = false, r_zoom = 1, num_reps = 1 } = {}) {
  dcheck(src.rank == 2 && res.rank == 2);
  let [src_r, src_a] = src.dims; // src.at(radius, arg)
  let [res_h, res_w] = res.dims;

  await resampleData(src, res, {
    ctoken,
    num_steps: [
      0.5 * max(res_w, res_h), // radius
      0.5 * (res_w + res_h) * PI], // circumference
    coords_fn: (a, r) => {
      let coords = [];
      for (let i = 0; i < num_reps; i++) {
        let rad = (r + 0.5) / src_r;
        let arg = (a + 0.5) / src_a;
        // dcheck(arg >= 0 && arg <= 1);
        // dcheck(rad >= 0 && rad <= 1);
        if (fs_full)
          rad = arg > 0.5 ? rad * 2 : 1 - rad * 2;
        rad = rad * r_zoom;
        // arg = (0.0 + arg + i) * 2 * PI / num_reps;
        arg = (0.0 + arg + i) * 2 * PI / num_reps;
        let x = (rad * Math.sin(arg) * 0.5 + 0.5) * res_w;
        let y = (rad * Math.cos(arg) * 0.5 + 0.5) * res_h;
        coords.push([x, y]);
      }
      return coords;
    },
  });
}

// Returns a Promise<Blob>.
export async function recordMic({ sample_rate = 48000 } = {}) {
  let mic_stream, resolve, reject;
  let audio_file = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  let ctx = {
    blob: () => audio_file,
    stop: () => stopRecording(),
    onaudiochunk: null,
  };

  async function getMicStream() {
    console.log('Requesting mic access');
    return navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleSize: 16,
        sampleRate: { exact: sample_rate },
        //echoCancellation: false,
        //noiseSuppression: false,
        //autoGainControl: false,
      }
    });
  }

  async function startRecording() {
    mic_stream = await getMicStream();

    try {
      console.log('Initializing AudioRecorder');
      let recorder = new AudioRecorder(mic_stream, sample_rate);
      recorder.onaudiodata = (blob) => resolve(blob);
      recorder.onaudiochunk = (chunk) => ctx.onaudiochunk?.(chunk);
      await recorder.start();
      console.log('Started recording...');
    } catch (err) {
      await stopRecording();
      throw err;
    }
  }

  // can be invoked multiple times
  function stopRecording() {
    if (!mic_stream) return;
    console.log('Releasing the mic stream');
    let tracks = mic_stream.getTracks();
    tracks.map((t) => t.stop());
    mic_stream = null;
  }

  try {
    await startRecording();
  } catch (err) {
    reject(err);
  }

  return ctx;
}

export function approxPercentile(values, pctile, sample_size = 1000) {
  dcheck(pctile >= 0.0 && pctile <= 1.0);
  let n = values.length;
  let a = new Float32Array(Math.min(n, sample_size));
  for (let i = 0; i < a.length; i++)
    a[i] = values[Math.round(Math.random() * (n - 1))];
  a.sort();
  return a[Math.round(pctile * (a.length - 1))];
}

export function interpolateLinear(t, list) {
  dcheck(list.length >= 1);
  let n = list.length;
  let i0 = clamp(t, 0, 1) * (n - 1);
  let i1 = Math.floor(i0);
  let i2 = Math.ceil(i0);
  return mix(list[i1], list[i2], i0 - i1);
}

export function interpolateSmooth(sig, t, kernel_size = 2, wrap = false) {
  if (t < 0.0 || t > 1.0) {
    if (!wrap)
      return 0.0;
    t = (t + 1.0) % 1.0;
  }

  let n = sig.length;
  let i0 = t * (n - 1);
  let imin = Math.floor(i0 - kernel_size);
  let imax = Math.ceil(i0 + kernel_size);
  let sum = 0.0;

  for (let i = imin; i <= imax; i++) {
    let j = !wrap ? clamp(i, 0, n - 1) : (i & (n - 1));
    sum += sig[j] * lanczos(i - i0, kernel_size);
  }

  return sum;
}

export function sumArray(a) {
  let sum = 0.0;
  for (let i = 0; i < a.length; i++)
    sum += a[i];
  return sum;
}
