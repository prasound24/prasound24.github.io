import * as utils from '../lib/utils.js';
import * as base from '../create/base.js';
import { GpuContext } from '../webgl2.js';

const { $, DB, fetchText, fetchRGBA } = utils;

const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const DEFAULT_IMG_ID = 'bass-clarinet_As2_very-long_mezzo-piano_harmonic';
const CW = 1024, CH = CW;
const IMG_W = 2048, IMG_H = 2048;
const SAMPLE_RATE = 48000;
let args = new URLSearchParams(location.search);
let sound = [0];
let canvas = $('canvas#webgl');
let shaders = {};

init();

async function init() {
  await initErrHandler();
  await initSound();
  await initImgRGBA();
  await initWebGL();
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

async function initImgRGBA(width, height) {
  let img_id = args.get('src');
  let img_url;

  if (!img_id) {
    let file = await DB.get(DB_PATH_IMAGE);
    if (file) {
      img_url = URL.createObjectURL(file);
      // conf = await DB.get(DB_PATH_CONFIG);
    } else {
      img_id = DEFAULT_IMG_ID;
    }
  }

  if (!img_url)
    img_url = '/img/xl/' + img_id + '.jpg'

  //$('#preview').src = img_url;
  canvas.style.display = 'none';

  return await fetchRGBA(img_url, width, height);
}

async function initShader(ctx, filename) {
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

  let img = await initImgRGBA(IMG_W, IMG_H);
  let ctx = new GpuContext(canvas);
  ctx.init();

  await initShader(ctx, 'disk');
  await initShader(ctx, 'sphere');
  await initShader(ctx, 'fireball');
  await initShader(ctx, 'fluid_img');
  await initShader(ctx, 'fluid_ch0');
  await initShader(ctx, 'drum');
  await initShader(ctx, 'minmax');
  await initShader(ctx, 'drum_img');
  await initShader(ctx, 'string_wave');
  await initShader(ctx, 'string_draw');

  let iChannel3 = ctx.createFrameBufferFromRGBA(img);
  let iChannel2 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel1 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel0 = ctx.createFrameBuffer(128, 1, 4);
  let bufferA = ctx.createFrameBuffer(iChannel0.width, iChannel0.height, 4);
  let bufferB = ctx.createFrameBuffer(iChannel1.width, iChannel1.height, 4);
  let bufferC = ctx.createFrameBuffer(iChannel2.width, iChannel2.height, 4);
  let animationId = 0, iFrame = 0;
  let stats = { frames: 0, time: 0 };
  let base_time = 0;

  if (canvas.requestFullscreen)
    $('#fullscreen').onclick = () => canvas.requestFullscreen();
  else
    $('fullscreen').style.display = 'none';

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

    let num_steps = 4;

    for (let k = num_steps; k > 0; k--) {
      let iTime = (time_msec - base_time) / 1000;
      let args = { iTime, iFrame, iChannel0, iChannel1, iChannel2, iChannel3 };
      args.iChannelResolution0 = [iChannel0.width, iChannel0.height];
      args.iChannelResolution1 = [iChannel1.width, iChannel1.height];
      args.iChannelResolution2 = [iChannel2.width, iChannel2.height];
      args.iChannelResolution3 = [iChannel3.width, iChannel3.height];

      let iSound = sound[iFrame % sound.length];
      runShader('string_wave', { ...args, iSound }, bufferA);
      if (k == 1) {
        runShader('string_draw', { ...args, iSound }, bufferB);
        bufferB.draw();
      }

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

      iFrame++;
    }

    if (time_msec) {
      if (time_msec > stats.time + 5000) {
        let fps = (iFrame - stats.frames) / num_steps / (time_msec - stats.time) * 1000;
        $('#fps').textContent = fps.toFixed(0) + ' fps x ' + num_steps;
        stats.time = time_msec;
        stats.frames = iFrame;
        console.debug('sound:', (iFrame / sound.length * 100).toFixed() + '%');
      }
      animationId = requestAnimationFrame(drawFrame);
    }
  }

  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();
}


