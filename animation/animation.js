import * as utils from '../utils.js';
import { GpuContext } from '../webgl2.js';

const { $, fetchText, fetchRGBA } = utils;

let args = new URLSearchParams(location.search);
let img_id = args.get('src') || 'saxophone_D6_15_fortissimo_normal_96';
let img_url = '/img/xl/' + img_id + '.jpg';

initWebGL();

async function initWebGL() {
  let canvas = $('canvas');
  canvas.width = 1024;
  canvas.height = 1024;

  let ctx = new GpuContext(canvas);
  ctx.init();

  let wrapper = await fetchText('./wrapper.glsl');
  let user_shader = await fetchText('./fireball.glsl');
  let fshader = wrapper.replace('//${USER_SHADER}', user_shader);
  let program = ctx.createTransformProgram({ fshader });
  let img = await fetchRGBA(img_url, canvas.width, canvas.height);
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

