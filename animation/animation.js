import * as utils from '../utils.js';
import { GpuContext } from '../webgl2.js';

const { $, DB, fetchText, fetchRGBA } = utils;

const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const DEFAULT_IMG_ID = 'flute_6';
const CW = 1024, CH = CW;
const IMG_W = 2048, IMG_H = 2048;
let canvas = $('canvas#webgl');
let shaders = {};
let conf = {};

initErrHandler();
initImgRGBA();
initWebGL();

function initErrHandler() {
  utils.setUncaughtErrorHandlers((err) => {
    if (err instanceof Error)
      $('#error_info').textContent = err.message;
  });
}

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
      // if (conf.hue > 0)
      //   canvas.style.filter = 'hue-rotate(' + conf.hue + 'deg)';
    } else {
      img_id = DEFAULT_IMG_ID;
    }
  }

  if (!img_url)
    img_url = '/img/xl/' + img_id + '.jpg'

  $('#preview').src = img_url;
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

  let iChannel2 = ctx.createFrameBufferFromRGBA(img);
  let iChannel1 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel0 = ctx.createFrameBuffer(CW, CH, 4);
  let iChannel3 = ctx.createFrameBuffer(CW, CH, 4);
  let bufferA = ctx.createFrameBuffer(CW, CH, 4);
  let bufferB = ctx.createFrameBuffer(CW, CH, 4);
  let bufferC = ctx.createFrameBuffer(CW, CH, 4);
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

  function drawFrame(time_msec = 0) {
    if (iFrame == 0) base_time = time_msec;
    let iTime = (time_msec - base_time) / 1000;
    let iResolution = [canvas.width, canvas.height];
    let args = { iTime, iFrame, iResolution, iChannel0, iChannel1, iChannel2, iChannel3 };

    shaders['fireball'].draw(args, bufferB);
    //shaders['fluid_ch0'].draw(args, bufferA);
    //shaders['fluid_img'].draw(args, bufferC);
    //shaders['sphere'].draw(args);
    shaders['disk'].draw(args);

    [iChannel0, bufferA] = [bufferA, iChannel0];
    [iChannel1, bufferB] = [bufferB, iChannel1];
    [iChannel3, bufferC] = [bufferC, iChannel3];

    iFrame++;

    if (time_msec) {
      stats.frames++;
      if (time_msec > stats.time + 5000) {
        let fps = stats.frames / (time_msec - stats.time) * 1000;
        $('#fps').textContent = fps.toFixed(0) + ' fps';
        stats.time = time_msec;
        stats.frames = 0;
      }
      animationId = requestAnimationFrame(drawFrame);
    }

    if (iFrame == 1) {
      $('#preview').style.display = 'none';
      canvas.style.display = '';
    }
  }

  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();
}


