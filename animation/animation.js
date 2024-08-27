import * as utils from '../utils.js';
import { GpuContext } from '../webgl2.js';

const { $, DB, fetchText, fetchRGBA } = utils;

const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const DEFAULT_IMG_ID = 'flute_6';
const CW = 2048, CH = 2048;
let canvas = $('canvas#webgl');
let conf = {};

initImgRGBA();
initWebGL();

function resizeCanvas() {
  let w = window.innerWidth;
  let h = window.innerHeight;
  // landscape = w x h; portrait = w x w
  canvas.width = w;
  canvas.height = Math.min(h, w);
}

async function initImgRGBA(width, height) {
  let args = new URLSearchParams(location.search);
  let img_id = args.get('src');
  let img_url;

  if (!img_id) {
    let file = await DB.get(DB_PATH_IMAGE);
    if (file) {
      img_url = URL.createObjectURL(file);
      conf = await DB.get(DB_PATH_CONFIG);
      if (conf.hue > 0)
        canvas.style.filter = 'hue-rotate(' + conf.hue + 'deg)';
    } else {
      img_id = DEFAULT_IMG_ID;
    }
  }

  if (!img_url)
    img_url = '/img/xl/' + img_id + '.jpg'

  return await fetchRGBA(img_url, width, height);
}

async function initShader(ctx, glsl_url) {
  let adapter = await fetchText('./adapter.glsl');
  let user_shader = await fetchText(glsl_url);
  let fshader = adapter.replace('//${USER_SHADER}', user_shader);
  return ctx.createTransformProgram({ fshader });
}

async function initWebGL() {
  window.onresize = resizeCanvas;
  resizeCanvas();

  let ctx = new GpuContext(canvas);
  ctx.init();

  let shader_img = await initShader(ctx, './fluid_img.glsl');
  let shader_ch1 = await initShader(ctx, './fluid_ch0.glsl');
  let img = await initImgRGBA(CW, CH);
  let iChannel1 = ctx.createFrameBufferFromRGBA(img);
  let iChannel0 = ctx.createFrameBuffer(CW, CH, 4);
  let bufferA = ctx.createFrameBuffer(CW, CH, 4);
  let animationId = 0, iFrame = 0;
  let stats = { frames: 0, time: 0 };

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

  function drawFrame(time_msec) {
    let iTime = time_msec / 1000;
    let iResolution = [canvas.width, canvas.height];
    let args = {
      iTime,
      iFrame: iFrame++,
      iResolution,
      iChannelResolution0: [iChannel0.width, iChannel0.height],
      iChannelResolution1: [iChannel1.width, iChannel1.height],
      iChannel0,
      iChannel1,
    };

    shader_img.draw(args);
    shader_ch1.draw(args, bufferA);
    [iChannel0, bufferA] = [bufferA, iChannel0];

    if (!time_msec)
      return;

    stats.frames++;
    if (time_msec > stats.time + 5000) {
      let fps = stats.frames / (time_msec - stats.time) * 1000;
      console.log(fps.toFixed(0) + ' fps');
      stats.time = time_msec;
      stats.frames = 0;
    }
    animationId = requestAnimationFrame(drawFrame);
  }

  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();
}


