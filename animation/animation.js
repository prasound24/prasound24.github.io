import * as utils from '../lib/utils.js';
import * as base from '../create/base.js';
import { GpuContext } from '../webgl2.js';
import { createEXR } from '../lib/exr.js';
import { createRGBE } from '../lib/rgbe.js';

const { $, check, dcheck, DB, fetchText } = utils;

let url_args = new URLSearchParams(location.search);

const LANDSCAPE = window.innerWidth > window.innerHeight;
const [CW, CH] = parseImgSize(url_args.get('i') || '720p');
const SHADER_ID = url_args.get('s') || 'string_4d';
const SAMPLE_RATE = 48000;

let sound = null;
let canvas = $('canvas#webgl');
let spanFPS = $('#fps'), spanFrameId = $('#frame_id');
let elGamma = $('input#gamma');
let elAlpha = $('input#alpha');
let shaders = {};

init();

async function init() {
  if (utils.DEBUG) document.body.classList.add('debug');
  check(/^[\w_]+$/.test(SHADER_ID), 'Bad shader id: ?s=');
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
  let blob = await base.loadAudioSignal(url_args.get('src'));
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

class DefaultShader {
  drawFrame(ctx, args) {
    return ctx.runShader(args);
  }
}

async function loadShaderConfig() {
  try {
    return await import('./glsl/' + SHADER_ID + '.js');
  } catch (err) {
    return new DefaultShader;
  }
}

async function initWebGL() {
  // window.onresize = resizeCanvas;
  // resizeCanvas();
  canvas.width = CW;
  canvas.height = CH;

  showStatus('Initializing WebGL...');
  let ctx = new GpuContext(canvas);
  ctx.init();

  let iLogo = await createLogoTexture(ctx);
  let iKeyboard = ctx.createFrameBuffer(256, 1, 1);
  let iChannels = [0, 1, 2, 3].map(i => ctx.createFrameBuffer(CW, CH, 4));
  let tmpBuffers = {};
  let iMouse = [0, 0, 0, 0];
  let animationId = 0, iFrame = 0;
  let stats = { frames: 0, time: 0 };
  let frames = 0;
  let base_time = 0;
  let dispChannelId = -1;

  await initShader(ctx, SHADER_ID);
  let shader = await loadShaderConfig();
  if (shader.initChannels)
    await shader.initChannels(iChannels, ctx);

  let shader_ctx = {
    runShader(args, chid = -1) {
      args.iFrame = iFrame;

      for (let i = 0; i < iChannels.length; i++)
        args['iChannel' + i] = iChannels[i];

      let ch = iChannels[chid]; // null if the output is the canvas
      let shape = ch && ch.width + 'x' + ch.height + 'x' + ch.channels;
      let buffer = tmpBuffers[shape];

      if (ch && !buffer) {
        buffer = ctx.createFrameBuffer(ch.width, ch.height, ch.channels);
        tmpBuffers[shape] = buffer;
      }

      runShader(SHADER_ID, args, buffer);

      if (!ch) return;
      iChannels[chid] = buffer;
      tmpBuffers[shape] = ch;
    },
  };

  setFullscreenHandler();

  $('#fps').onclick = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
      //console.log('animation stopped');
    } else {
      animationId = requestAnimationFrame(drawFrame);
      //console.log('animation started');
    }
  };

  initMouseHandler();
  setKeyboardHandler(iKeyboard);

  elGamma.onchange = () => runShader(SHADER_ID, initShaderArgs());
  elAlpha.onchange = () => runShader(SHADER_ID, initShaderArgs());

  $('#frame_id').onclick = () => !animationId && drawFrame();
  $('#channel').onclick = () => switchChannel();
  $('#save_png').onclick = () => downloadPNG();
  $('#save_exr').onclick = () => downloadEXR();
  $('#save_hdr').onclick = () => downloadHDR();

  function switchChannel() {
    dispChannelId++;
    if (dispChannelId > 3)
      dispChannelId = -1;
    $('#channel').textContent = dispChannelId < 0 ? 'img' : 'ch' + dispChannelId;
    drawFrame();
  }

  function downloadRGBA() {
    console.debug('Saving the float32 RGBA framebuffer');
    let f32 = null;

    if (dispChannelId < 0) {
      shader_ctx.runShader(initShaderArgs(), 3);
      f32 = iChannels[3].download();
    } else {
      f32 = iChannels[dispChannelId].download();
    }

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

  function downloadEXR(fb = null) {
    let f32 = downloadRGBA();
    let blob = createEXR(CW, CH, 4, f32, 4);
    saveBlobAsFile(blob, genImageName() + '.exr');
  }

  function downloadHDR() {
    let rgba = downloadRGBA();
    let blob = createRGBE(CW, CH, rgba);
    saveBlobAsFile(blob, genImageName() + '.hdr');
  }

  function runShader(name, args, out = null) {
    let iResolution = out ? [out.width, out.height] : [canvas.width, canvas.height];
    shaders[name].draw({ ...args, iResolution }, out); // calls WebGL
    iFrame++;
  }

  function initShaderArgs(time_msec = performance.now()) {
    let iTime = time_msec / 1000;
    let iGamma = [+elGamma.value, +elAlpha.value];
    return {
      iTime, iMouse, iFrame, iLogo, iKeyboard, iPass: 0,
      iGamma, iChannelId: -1,
    };
  }

  function drawFrame(time_msec = 0) {
    if (iFrame == 0) {
      base_time = time_msec;
      $('#preview').style.display = 'none';
      canvas.style.display = '';
    }

    if (dispChannelId < 0) {
      let args = initShaderArgs(time_msec);
      shader.drawFrame(shader_ctx, args);
      frames++;
    } else {
      //let args = initShaderArgs();
      //args.iChannelId = dispChannelId;
      //shader_ctx.runShader(args);
      iChannels[dispChannelId].draw();
    }

    let fps = (frames - stats.frames) / (time_msec - stats.time) * 1000;
    if (!Number.isFinite(fps) || fps < 0) fps = 0;
    spanFPS.textContent = fps ? 'fps ' + fps.toFixed(0) : 'fps --';
    spanFrameId.textContent = frames;

    if (time_msec) {
      if (time_msec > stats.time + 5000) {
        stats.time = time_msec;
        stats.frames = frames;
        //sound && console.debug('sound:', (iFrame / sound.length * 100).toFixed() + '%');
      }
      animationId = requestAnimationFrame(drawFrame);
    }
  }

  showStatus('Rendering the 1st frame...');
  animationId = requestAnimationFrame(drawFrame);
  // drawFrame(0);
  // ctx.destroy();

  function initMouseHandler() {
    let mouseXY = (e) => {
      let x = e.clientX - canvas.offsetLeft;
      let y = e.clientY - canvas.offsetTop;
      return [
        (x + 0.5) / canvas.offsetWidth * canvas.width,
        (1 - (y + 0.5) / canvas.offsetHeight) * canvas.height];
    };

    canvas.onmousemove = (e) => {
      iMouse[0] = iMouse[2];
      iMouse[1] = iMouse[3];
      if (e.buttons == 1) {
        let [x, y] = mouseXY(e);
        iMouse[2] = x;
        iMouse[3] = y;
      } else {
        iMouse[2] = 0;
        iMouse[3] = 0;
      }
      if (!animationId && e.buttons) drawFrame();
    };
    canvas.onmousedown = (e) => {
      if (e.buttons != 1)
        return;
      iMouse[0] = 0;
      iMouse[1] = 0;
      let [x, y] = mouseXY(e);
      iMouse[2] = x;
      iMouse[3] = y;
      if (!animationId) drawFrame();
    };
    canvas.onmouseup = (e) => {
      iMouse[0] = iMouse[2];
      iMouse[1] = iMouse[3];
    };
    canvas.onmouseout = canvas.onmouseleave = () => iMouse.fill(0);
  }
}

function setKeyboardHandler(iKeyboard) {
  let keyboard = new Int32Array(iKeyboard.width);

  let update = (e) => {
    let ch = e.key.toUpperCase();
    if (ch.length != 1) return;
    let i = ch.charCodeAt(0);
    if (i >= iKeyboard.width) return;
    let v = e.type == 'keydown' ? 1 : 0;
    if (v == keyboard[i]) return;
    keyboard[i] = v;
    iKeyboard.setPixel([v], i, 0);
    //console.debug('key', ch, i, '=', v);
  };

  document.onkeydown = update;
  document.onkeyup = update;
}

function setFullscreenHandler() {
  if (canvas.requestFullscreen)
    $('#fullscreen').onclick = () => canvas.requestFullscreen();
  else
    $('#fullscreen').style.display = 'none';
}
