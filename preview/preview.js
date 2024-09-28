import * as utils from '../utils.js';
import * as webfft from '../lib/webfft.js';
import * as base from '../create/base.js';

const { $, $$, DB } = utils;
const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const IMG_BASE = '/img/xl/';

let args = new URLSearchParams(location.search);

init();

async function init() {
  let img_main = $('.preview img');
  let img_inline = $('img.inline');
  let filename = args.get('src');
  let note_class = args.get('c');
  let conf, img_url, is_playing = false;

  if (note_class) {
    img_main.classList.add(note_class);
    img_inline.classList.add(note_class);
  }

  if (filename) {
    img_url = IMG_BASE + filename + '.jpg';

    for (let a of $$('#hires_buttons a.button'))
      a.href += '?src=' + filename;
    for (let a of $$('#gif_buttons a.button'))
      a.href += '?src=' + filename;
  } else {
    let img_file = await DB.get(DB_PATH_IMAGE);

    if (img_file) {
      img_url = URL.createObjectURL(img_file);
      filename = img_file.name;
      conf = await DB.get(DB_PATH_CONFIG);
      if (conf?.hue > 0) {
        for (let img of [img_main, img_inline])
          img.style.filter = 'hue-rotate(' + conf.hue + 'deg)';
      }
    }
  }

  let sample_rate = conf?.sampleRate || base.gconf.sampleRate;
  let signal, animation = { id: 0 }, audio = { ctx: null };
  let canvas = $('canvas#wave');
  let wd = base.initWaveformDrawer(canvas);

  try {
    signal = await initAudioSignal(sample_rate);
    wd.draw(signal);
  } catch (err) {
    canvas.style.display = 'none';
  }

  canvas.onclick = async () => {
    if (!animation.id)
      startWaveformAnimation(signal, wd, canvas, animation);

    if (is_playing)
      return;

    try {
      is_playing = true;
      await utils.playSound(signal, sample_rate, { audio });
      audio.ctx = null;
      /* if (audio?.ctx) {
        let time = (audio.ctx.currentTime - audio.startedTime) / audio.duration;
        let ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffff';
        ctx.strokeWidth = 1;
        ctx.moveTo(time * canvas.width, 0);
        ctx.lineTo(time * canvas.width, canvas.height);
        ctx.stroke();
      } */
    } finally {
      is_playing = false;
    }
  };

  document.querySelector('#sound_info').textContent = filename;

  if (img_url) {
    img_main.src = img_url;
    img_inline.src = img_url;
  }
}

async function initAudioSignal(sample_rate) {
  let blob = await base.loadAudioSignal(args.get('src'));
  return await utils.decodeAudioFile(blob, sample_rate);
}

function startWaveformAnimation(sig1, wd, canvas, animation) {
  let sig2 = webfft.harmonic_conjugate(sig1);
  let tmp = new Float32Array(sig1.length);
  let amin1 = sig1.reduce((s, x) => Math.min(s, x), +1);
  let amax1 = sig1.reduce((s, x) => Math.max(s, x), -1);
  let amin2 = sig2.reduce((s, x) => Math.min(s, x), +1);
  let amax2 = sig2.reduce((s, x) => Math.max(s, x), -1);
  let amin = Math.min(amin1, amin2), amax = Math.max(amax1, amax2);
  let frameId = 0, frames = Array(256);
  let ctx = canvas.getContext('2d');

  function drawFrame(time) {
    let arg = 0.5 * time / 1000;
    let id = Math.min(arg % 1 * frames.length | 0, frames.length - 1);

    if (frames[id]) {
      ctx.putImageData(frames[id], 0, 0);
    } else {
      let cos = Math.cos(arg * 2 * Math.PI), sin = Math.sin(arg * 2 * Math.PI);
      for (let i = 0; i < tmp.length; i++)
        tmp[i] = sig1[i] * cos + sig2[i] * sin;

      wd.clear();
      wd.draw(tmp, [0, 1], [amin, amax]);

      let img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frames[id] = ctx.createImageData(canvas.width, canvas.height);
      frames[id].data.set(img.data);
    }

    frameId++;
    animation.id = requestAnimationFrame(drawFrame);
  }

  drawFrame(Date.now());
}
