import * as utils from '../lib/utils.js';
import * as base from '../create/base.js';
import { GpuContext } from '../webgl2.js';
import { createEXR } from '../lib/exr.js';
import { createRGBE } from '../lib/rgbe.js';

const { $, dcheck, DB, fetchText, fetchRGBA } = utils;

let args = new URLSearchParams(location.search);

const DB_PATH_CONFIG = 'user_samples/_last/config';
const LANDSCAPE = window.innerWidth > window.innerHeight;
const [CW, CH] = parseImgSize(args.get('i') || '720p');
const SAMPLE_RATE = 48000;

let sound = null;
let canvas = $('canvas#webgl');
let spanFPS = $('#fps'), spanFrameId = $('#frame_id');
let elGamma = $('input#gamma');
let elAlpha = $('input#alpha');
let shaders = {};

init();

async function init() {
  elGamma.value = 2.2;
  elAlpha.value = 0.0;
  $('#img_size').textContent = CW + '×' + CH;
  await initErrHandler();
  await initSound();
  await initWebGL();
  showStatus(null);
}

function showStatus(text) {
  $('#status').textContent = text || '';
}

function parseImgSize(s) {
  let h = 1, w = 1;
  if (/^\d+x\d+$/.test(s))
    [w, h] = s.split('x').map(a => +a);

  if (/^\d+p$/.test(s)) {
    let hh = +s.slice(0, -1);
    [w, h] = [hh * 16 / 9 | 0, hh];
  }

  return LANDSCAPE ? [w, h] : [h, w];
}

function initErrHandler() {
  utils.setUncaughtErrorHandlers((err) => {
    if (err instanceof Error)
      $('#error_info').textContent = err.message;
  });
}

async function initSound() {
  let blob = await base.loadAudioSignal(args.get('src'));
  if (!blob) return;
  sound = await utils.decodeAudioFile(blob, SAMPLE_RATE);
  console.log('Sound:', (sound.length / SAMPLE_RATE).toFixed(1), 'sec,', sound.length, 'samples');
}

function resizeCanvas() {
  let w = window.innerWidth;
  let h = window.innerHeight;
  // landscape = w x h; portrait = w x w
  canvas.width = w;
  canvas.height = Math.min(h, w);
}

async function fetchWaveData(ctx) {
  showStatus('Loading wave data...');
  let conf = await DB.get(DB_PATH_CONFIG);
  let blob = await DB.get(base.DB_PATH_WAVE_DATA);
  if (!blob) return ctx.createFrameBuffer(1, 1, 1);
  let buffer = await blob.arrayBuffer();
  let fp32array = new Float32Array(buffer);
  let n = conf.numSteps, m = fp32array.length / n;
  dcheck(m % 1 == 0);
  console.debug('Wave data:', m, 'x', n);
  return ctx.createFrameBuffer(m, n, 1, fp32array);
}

async function createLogoTexture(webgl) {
  let img = await base.createLogoTexture();
  return webgl.createFrameBufferFromRGBA(img);
}

async function initShader(ctx, filename) {
  showStatus('Loading ' + filename + '...');
  let adapter = await fetchText('./glsl/adapter.glsl');
  let user_shader = await fetchText('./glsl/' + filename + '.glsl');
  let fshader = adapter.replace('//#include ${USER_SHADER}', user_shader);
  shaders[filename] = ctx.createTransformProgram({ fshader });
}

async function initWebGL() {
  // window.onresize = resizeCanvas;
  // resizeCanvas();
  canvas.width = CW;
  canvas.height = CH;

  showStatus('Initializing WebGL...');
  let ctx = new GpuContext(canvas);
  ctx.init();

  //await initShader(ctx, 'disk');
  //await initShader(ctx, 'sphere');
  //await initShader(ctx, 'fireball');
  //await initShader(ctx, 'fluid_img');
  //await initShader(ctx, 'fluid_ch0');
  //await initShader(ctx, 'drum');
  //await initShader(ctx, 'minmax');
  //await initShader(ctx, 'drum_img');
  //await initShader(ctx, 'string_wave');
  //await initShader(ctx, 'string_draw');
  //await initShader(ctx, 'waveform_draw');
  await initShader(ctx, 'string_4d');

  let iLogo = await createLogoTexture(ctx);
  let iChannelImage = await fetchWaveData(ctx);
  let iChannelSound = ctx.createFrameBuffer(CW, CH, 1);
  let iChannel0 = ctx.createFrameBuffer(CW, 2, 4);
  let iChannel1 = ctx.createFrameBuffer(CW, 1, 4);
  let iChannel2 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel3 = ctx.createFrameBuffer(CW, CH, 4);
  let bufferA = ctx.createFrameBuffer(iChannel0.width, iChannel0.height, iChannel0.channels);
  let bufferB = ctx.createFrameBuffer(iChannel1.width, iChannel1.height, iChannel1.channels);
  let bufferC = ctx.createFrameBuffer(iChannel2.width, iChannel2.height, iChannel2.channels);
  let bufferD = ctx.createFrameBuffer(iChannel3.width, iChannel3.height, iChannel3.channels);
  let iSoundMax = 0, iSoundLen = 0;
  let animationId = 0, iFrame = 0;
  let stats = { frames: 0, time: 0 };
  let base_time = 0;

  if (sound) {
    iSoundMax = sound.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
    iSoundLen = sound.length;
    iChannelSound.upload(sound);
  }

  if (canvas.requestFullscreen)
    $('#fullscreen').onclick = () => canvas.requestFullscreen();
  else
    $('#fullscreen').style.display = 'none';

  canvas.onclick = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
      //console.log('animation stopped');
    } else {
      animationId = requestAnimationFrame(drawFrame);
      //console.log('animation started');
    }
  };

  document.onkeydown = (e) => {
    if (!animationId) {
      let key = e.key.toUpperCase();
      //console.debug('onkeydown:', key);
      if (key == 'ARROWRIGHT')
        drawFrame();
    }
  };

  elGamma.onchange = () => runShader('string_4d', initShaderArgs());
  elAlpha.onchange = () => runShader('string_4d', initShaderArgs());

  $('#save_png').onclick = () => downloadPNG();
  $('#save_exr').onclick = () => downloadEXR();
  $('#save_hdr').onclick = () => downloadHDR();

  function downloadRGBA() {
    console.debug('Saving the float32 RGBA framebuffer');
    runShader('string_4d', initShaderArgs(), bufferD);
    let f32 = bufferD.download();
    dcheck(f32.length == CW * CH * 4);
    return f32;
  }

  function genImageName() {
    let t = new Date().toJSON().replace(/[-:T]|\.\d+Z$/g, '');
    return 'image_' + t;
  }

  function saveBlobAsFile(blob, name) {
    console.log('Downloading the image:', (blob.size / 2 ** 20).toFixed(1), 'MB', blob.type);
    let a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.click();
  }

  function downloadPNG() {
    let f32 = downloadRGBA();

    console.debug('Creating a int16 RGBA PNG image');
    let u16 = new Uint16Array(CW * CH * 4);
    for (let i = 0; i < CW * CH * 4; i++) {
      let CW4 = CW * 4, y = i / CW4 | 0, x = i % CW4;
      let j = (CH - 1 - y) * CW4 + x; // flip Y
      let b = utils.clamp(f32[j], 0, 1) * 0xFFFF;
      u16[i] = (b >> 8) | ((b & 255) << 8); // big-endian for PNG
    }

    let png = UPNG.encodeLL([u16.buffer], CW, CH, 3, 1, 16);
    let blob = new Blob([png], { type: 'image/png' });
    saveBlobAsFile(blob, genImageName() + '.png');
  }

  function downloadEXR() {
    let f32 = downloadRGBA();
    let blob = createEXR(CW, CH, 3, f32);
    saveBlobAsFile(blob, genImageName() + '.exr');
  }

  function downloadHDR() {
    let rgba = downloadRGBA();
    let blob = createRGBE(CW, CH, rgba);
    saveBlobAsFile(blob, genImageName() + '.hdr');
  }

  function runShader(name, args, out = null) {
    let iResolution = out ? [out.width, out.height] : [canvas.width, canvas.height];
    args = { ...args, iChannel0, iChannel1, iChannel2, iChannel3 };
    args.iChannelResolution0 = [iChannel0.width, iChannel0.height];
    args.iChannelResolution1 = [iChannel1.width, iChannel1.height];
    args.iChannelResolution2 = [iChannel2.width, iChannel2.height];
    args.iChannelResolution3 = [iChannel3.width, iChannel3.height];
    shaders[name].draw({ ...args, iResolution }, out);
  }

  function initShaderArgs(time_msec = performance.now()) {
    let iTime = (time_msec - base_time) / 1000;
    let iMouse = [0, 0, 0];
    let iGamma = [+elGamma.value, +elAlpha.value];
    return {
      iTime, iMouse, iFrame, iLogo, iSoundMax, iSoundLen, iPass: 0,
      iChannelSound, iChannelImage, iGamma, iChannelId: -1,
    };
  }

  function drawFrame(time_msec = 0) {
    if (iFrame == 0) {
      base_time = time_msec;
      $('#preview').style.display = 'none';
      canvas.style.display = '';
    }

    let num_steps = 1;

    for (let k = num_steps; k > 0; k--) {
      let args = initShaderArgs(time_msec);

      runShader('string_4d', { ...args, iChannelId: 0 }, bufferA);
      [iChannel0, bufferA] = [bufferA, iChannel0];

      for (let i = 0; i < 2; i++) {
        runShader('string_4d', { ...args, iChannelId: 1, iPass: i }, bufferB);
        [iChannel1, bufferB] = [bufferB, iChannel1];
      }

      runShader('string_4d', { ...args, iChannelId: 2 }, bufferC);
      [iChannel2, bufferC] = [bufferC, iChannel2];

      runShader('string_4d', { ...args, iChannelId: 3 }, bufferD);
      [iChannel3, bufferD] = [bufferD, iChannel3];

      if (k == 1) runShader('string_4d', { ...args, iChannelId: -1 });

      //let iSound = sound[iFrame % sound.length];
      //runShader('string_wave', { ...args, iSound }, bufferA);
      //if (k == 1) {
      //  runShader('string_draw', { ...args, iSound }, bufferB);
      //  bufferB.draw();
      //}

      //runShader('fireball', args, bufferB);
      //runShader('fluid_ch0', args, bufferA);
      //if (k == 1) runShader('fluid_img', args);

      //runShader('fireball', args, bufferB);
      //runShader('sphere', args);

      //runShader('fireball', args, bufferB);
      //runShader('disk', args);

      //let iSound = sound[iFrame % sound.length];
      //runShader('fireball', args, bufferC);
      //runShader('drum', { ...args, iSound }, bufferA);
      //runShader('minmax', { ...args, iSound }, bufferB);
      //if (k == 1) runShader('drum_img', args);

      //[iChannel0, bufferA] = [bufferA, iChannel0];
      //[iChannel1, bufferB] = [bufferB, iChannel1];
      //[iChannel2, bufferC] = [bufferC, iChannel2];
      //[iChannel3, bufferD] = [bufferD, iChannel3];

      iFrame++;

      let fps = (iFrame - stats.frames) / num_steps / (time_msec - stats.time) * 1000;
      spanFPS.textContent = 'fps ' + fps.toFixed(0);
      spanFrameId.textContent = iFrame;
    }

    if (time_msec) {
      if (time_msec > stats.time + 5000) {
        stats.time = time_msec;
        stats.frames = iFrame;
        //sound && console.debug('sound:', (iFrame / sound.length * 100).toFixed() + '%');
      }
      animationId = requestAnimationFrame(drawFrame);
    }
  }

  showStatus('Rendering the 1st frame...');
  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();
}


