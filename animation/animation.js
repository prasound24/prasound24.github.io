import * as utils from '../utils.js';
import { GpuContext } from '../webgl2.js';

const { $, DB, fetchText, fetchRGBA } = utils;

const DB_PATH_IMAGE = 'user_samples/_last/image';
const DEFAULT_IMG_ID = 'flute_6';

let canvas = $('canvas#webgl');

initImgRGBA();
initWebGL();
window.onresize = resizeCanvas;

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
    if (file)
      img_url = URL.createObjectURL(file);
    else
      img_id = DEFAULT_IMG_ID;
  }

  if (!img_url)
    img_url = '/img/xl/' + img_id + '.jpg'

  return await fetchRGBA(img_url, width, height);
}

async function initWebGL() {
  resizeCanvas();

  let ctx = new GpuContext(canvas);
  ctx.init();

  let wrapper = await fetchText('./wrapper.glsl');
  let user_shader = await fetchText('./fireball.glsl');
  let fshader = wrapper.replace('//${USER_SHADER}', user_shader);
  let program = ctx.createTransformProgram({ fshader });
  let img = await initImgRGBA(2048, 2048);
  let fbuffer = ctx.createFrameBufferFromImgData(img);
  let animationId = 0;
  let stats = { frames: 0, time: 0 };

  canvas.onclick = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
      return;
    }
    animationId = requestAnimationFrame(drawFrame);
  };

  function drawFrame(time_msec) {
    program.draw({
      iTime: time_msec / 1000,
      iResolution: [canvas.width, canvas.height],
      iChannel0: fbuffer,
    });
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


