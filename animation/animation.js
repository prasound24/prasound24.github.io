import * as utils from '../lib/utils.js';
import * as base from '../create/base.js';
import { GpuContext } from '../webgl2.js';

const { $, dcheck, DB, fetchText, fetchRGBA } = utils;

const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const DEFAULT_IMG_ID = 'bass-clarinet_As2_very-long_mezzo-piano_harmonic';
const LANDSCAPE = window.innerWidth > window.innerHeight;
const WH = [2048, 1024];
const [CW, CH] = LANDSCAPE ? WH : WH.reverse();
const SAMPLE_RATE = 48000;
let args = new URLSearchParams(location.search);
let sound = [0];
let canvas = $('canvas#webgl');
let spanFPS = $('#fps');
let shaders = {};

init();

async function init() {
  await initErrHandler();
  await initSound();
  await initWebGL();
  showStatus(null);
}

function showStatus(text) {
  $('#status').textContent = text || '';
}

function initErrHandler() {
  utils.setUncaughtErrorHandlers((err) => {
    if (err instanceof Error)
      $('#error_info').textContent = err.message;
  });
}

async function initSound() {
  let blob = await base.loadAudioSignal(args.get('src'));
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
  let buffer = await blob.arrayBuffer();
  let fp32array = new Float32Array(buffer);
  let n = conf.numSteps, m = fp32array.length / n;
  dcheck(m % 1 == 0);
  console.debug('Wave data:', m, 'x', n);
  return ctx.createFrameBuffer(m, n, 1, fp32array);
}

async function initShader(ctx, filename) {
  showStatus('Loading ' + filename + '...');
  let adapter = await fetchText('./adapter.glsl');
  let user_shader = await fetchText('./' + filename + '.glsl');
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

  let iChannelImage = await fetchWaveData(ctx);
  let iChannelSound = ctx.createFrameBuffer(CW, CH, 1);
  let iChannel3 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel2 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel1 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel0 = ctx.createFrameBuffer(CW, CH, 4);
  let bufferA = ctx.createFrameBuffer(iChannel0.width, iChannel0.height, iChannel0.channels);
  let bufferB = ctx.createFrameBuffer(iChannel1.width, iChannel1.height, iChannel1.channels);
  let bufferC = ctx.createFrameBuffer(iChannel2.width, iChannel2.height, iChannel2.channels);
  let bufferD = ctx.createFrameBuffer(iChannel3.width, iChannel3.height, iChannel3.channels);
  let iSoundMax = sound.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
  let iSoundLen = sound.length;
  let animationId = 0, iFrame = 0;
  let stats = { frames: 0, time: 0 };
  let base_time = 0;

  iChannelSound.upload(sound);

  if (canvas.requestFullscreen)
    $('#fullscreen').onclick = () => canvas.requestFullscreen();
  else
    $('#fullscreen').style.display = 'none';

  canvas.onclick = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
      console.log('animation stopped');
    } else {
      animationId = requestAnimationFrame(drawFrame);
      console.log('animation started');
    }
  };

  document.onkeydown = (e) => {
    if (!animationId) {
      let key = e.key.toUpperCase();
      console.debug('onkeydown:', key);
      if (key == 'ARROWRIGHT')
        drawFrame();
    }
  };

  function runShader(name, args, out = null) {
    let iResolution = out ? [out.width, out.height] : [canvas.width, canvas.height];
    shaders[name].draw({ ...args, iResolution }, out);
  }

  function drawFrame(time_msec = 0) {
    if (iFrame == 0) {
      base_time = time_msec;
      $('#preview').style.display = 'none';
      canvas.style.display = '';
    }

    let num_steps = 1;

    for (let k = num_steps; k > 0; k--) {
      let iTime = (time_msec - base_time) / 1000;
      let iMouse = [0, 0, 0];
      let args = {
        iTime, iMouse, iFrame, iSoundMax, iSoundLen,
        iChannel0, iChannel1, iChannel2, iChannel3,
        iChannelSound, iChannelImage
      };
      args.iChannelResolution0 = [iChannel0.width, iChannel0.height];
      args.iChannelResolution1 = [iChannel1.width, iChannel1.height];
      args.iChannelResolution2 = [iChannel2.width, iChannel2.height];
      args.iChannelResolution3 = [iChannel3.width, iChannel3.height];

      runShader('string_4d', { ...args, iChannelId: 0 }, bufferA);
      runShader('string_4d', { ...args, iChannelId: 1 }, bufferB);
      runShader('string_4d', { ...args, iChannelId: 2 }, bufferC);
      runShader('string_4d', { ...args, iChannelId: 3 }, bufferD);

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

      [iChannel0, bufferA] = [bufferA, iChannel0];
      [iChannel1, bufferB] = [bufferB, iChannel1];
      [iChannel2, bufferC] = [bufferC, iChannel2];
      [iChannel3, bufferD] = [bufferD, iChannel3];

      iFrame++;

      let fps = (iFrame - stats.frames) / num_steps / (time_msec - stats.time) * 1000;
      spanFPS.textContent = fps.toFixed(0) + ' fps ' + ' ' + iFrame;
    }

    if (time_msec) {
      if (time_msec > stats.time + 5000) {
        stats.time = time_msec;
        stats.frames = iFrame;
        console.debug('sound:', (iFrame / sound.length * 100).toFixed() + '%');
      }
      animationId = requestAnimationFrame(drawFrame);
    }
  }

  showStatus('Rendering the 1st frame...');
  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();
}


