import * as utils from '../utils.js';
import { GpuContext } from '../webgl2.js';

const { $, DB, fetchText, fetchRGBA } = utils;

const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const DEFAULT_IMG_ID = 'flute_6';
const CW = 1024, CH = CW;
let canvas = $('canvas#webgl');
let shaders = {};
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

  let ctx = new GpuContext(canvas);
  ctx.init();

  await initShader(ctx, 'fireball');
  await initShader(ctx, 'fluid_img');
  await initShader(ctx, 'fluid_ch0');
  let img = await initImgRGBA(CW, CH);
  let iChannel2 = ctx.createFrameBufferFromRGBA(img);
  let iChannel1 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel0 = ctx.createFrameBuffer(CW, CH, 4);
  let bufferA = ctx.createFrameBuffer(CW, CH, 4);
  let bufferB = ctx.createFrameBuffer(CW, CH, 4);
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
      iChannel0,
      iChannel1,
      iChannel2,
    };

    // image RGBA -> iChannel2
    // #fireball -> bufferB
    // iChannel0,1,2 -> #fluid_ch0 -> bufferA
    // #fluid_img -> canvas
    // bufferA -> iChannel0
    // bufferB -> iChannel1

    shaders['fireball'].draw(args, bufferB);
    shaders['fluid_ch0'].draw(args, bufferA);
    shaders['fluid_img'].draw(args);

    [iChannel0, bufferA] = [bufferA, iChannel0];
    [iChannel1, bufferB] = [bufferB, iChannel1];

    if (time_msec) {
      stats.frames++;
      if (time_msec > stats.time + 5000) {
        let fps = stats.frames / (time_msec - stats.time) * 1000;
        console.log(fps.toFixed(0) + ' fps');
        stats.time = time_msec;
        stats.frames = 0;
      }
      animationId = requestAnimationFrame(drawFrame);
    }
  }

  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();
}


