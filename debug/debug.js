import * as utils from '../utils.js';

const { $, dcheck, resampleSignal } = utils;

const AUDIO_URL = '/mp3/flute_A4_1_forte_normal.mp3';
const SAMPLE_RATE_1 = 48000;
const SAMPLE_RATE_2 = 96000;

$('#start').onclick = start;

async function start() {
  await testImage();
  await testAudio();
}

async function testImage() {
  showTempGradient(utils.blackbodyRGB);
  showTempGradient(t => [t * 2, (t * 2) ** 2 * 0.4, (t * 2) ** 3 * 0.15]);
  showTempGradient(t => [t * 4, t * 2, t]);
}

function showTempGradient(temp) {
  let w = 1024;
  let canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 1;

  let ctx = canvas.getContext('2d');
  let img = ctx.getImageData(0, 0, w, 1);

  for (let x = 0; x < w; x++) {
    let [r, g, b] = temp(x / w);
    img.data[4 * x + 0] = 255 * r;
    img.data[4 * x + 1] = 255 * g;
    img.data[4 * x + 2] = 255 * b;
    img.data[4 * x + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  $('#temps').append(canvas);
}

async function testAudio() {
  let res = await fetch(AUDIO_URL);
  let blob = await res.blob();
  let signal = await utils.decodeAudioFile(blob, SAMPLE_RATE_1);

  let a = await utils.decodeAudioFile(blob, SAMPLE_RATE_2);

  for (let q = 1; q <= 24; q++) {
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

