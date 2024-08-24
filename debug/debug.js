import * as utils from '../utils.js';

const { $, dcheck, lanczos } = utils;

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

  for (let kw = 1; kw <= 9; kw++) {
    let b = resampleSignal(signal, a.length, { kw });
    dcheck(b.length == a.length);
    let avg = rmsqDiff(a, 0);
    let diff = rmsqDiff(a, b);
    console.log('RMSQ', kw, (diff / avg).toExponential(2));
  }
}

function rmsqDiff(a, b) {
  let diff = 0.0; // root mean square error
  for (let i = 0; i < a.length; i++)
    diff += utils.sqr(a[i] - (b ? b[i] : 0));
  return Math.sqrt(diff / a.length);
}

// https://en.wikipedia.org/wiki/Lanczos_resampling
function resampleSignal(input, output, { kw = 1 }) {
  if (typeof output == 'number')
    output = new Float32Array(Math.floor(output));

  let n = input.length, m = output.length;

  if (n == m) {
    output.set(input, 0);
    return output;
  }

  for (let j = 0; j < m; j++) {
    let t = j / m * n;
    let i = Math.round(t);
    if (i == t) {
      output[j] = input[i];
      continue;
    }

    let sum = 0.0;
    for (let k = -kw; k <= kw; k++)
      if (i + k >= 0 && i + k < n)
        sum += input[i + k] * lanczos(k + i - t, kw);
    output[j] = sum;
  }

  return output;
}

