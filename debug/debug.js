import * as utils from '../utils.js';

const { $, clamp, dcheck, resampleSignal } = utils;

const AUDIO_URL = '/mp3/flute_A4_1_forte_normal.mp3';
const SAMPLE_RATE_1 = 48000;
const SAMPLE_RATE_2 = 96000;

$('#start').onclick = start;

async function start() {
  await testImage();
  await testAudio();
}

async function testImage() {
  showTempGradient(utils.blackbodyRGB, 'blackbody');
  
  let tc = t => t ** 4.0;
  showTempGradient(t => [tc(t / 0.45), tc(t / 0.62), tc(t)], 'bb-sim');

  showTempGradient(utils.fireballRGB, 'fireball');
  showTempGradient(t => [t * 4, t * 2, t], '421');
}

function showTempGradient(temp, title) {
  let w = 1024, h = 128;
  let canvas = document.createElement('canvas');
  canvas.title = title;
  canvas.width = w;
  canvas.height = h;

  let ctx = canvas.getContext('2d');
  let img = ctx.getImageData(0, 0, w, h);
  let img32 = new Uint32Array(img.data.buffer);

  for (let x = 0; x < w; x++) {
    let [r, g, b] = temp(x / w);
    let rgb32 = 0xFF000000;
    rgb32 += Math.round(clamp(r) * 0xFF) << 0;
    rgb32 += Math.round(clamp(g) * 0xFF) << 8;
    rgb32 += Math.round(clamp(b) * 0xFF) << 16;

    for (let y = 0; y < h; y++) {
      let p = y * w + x;
      let c = rgb32;

      if (Math.abs(h - r * h - y + 0.5) < 1)
        c = 0xFF0000FF;
      if (Math.abs(h - g * h - y + 0.5) < 1)
        c = 0xFF00FF00;
      if (Math.abs(h - b * h - y + 0.5) < 1)
        c = 0xFFFF0000;

      img32[p] = c;
    }
  }

  ctx.putImageData(img, 0, 0);
  $('#temps').append(canvas);
}

async function testAudio() {
  let res = await fetch(AUDIO_URL);
  let blob = await res.blob();
  let signal = await utils.decodeAudioFile(blob, SAMPLE_RATE_1);

  let a = await utils.decodeAudioFile(blob, SAMPLE_RATE_2);

  for (let q = 1; q <= 12; q++) {
    let b = resampleSignal(signal, a.length, q);
    dcheck(b.length == a.length);
    let avg = rmsqDiff(a, 0);
    let diff = rmsqDiff(a, b);
    console.log('RMSQ', q, (diff / avg).toExponential(2));
  }
}

function rmsqDiff(a, b) {
  let diff = 0.0; // root mean square error
  for (let i = 0; i < a.length; i++)
    diff += utils.sqr(a[i] - (b ? b[i] : 0));
  return Math.sqrt(diff / a.length);
}

