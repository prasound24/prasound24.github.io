import * as utils from '../lib/utils.js';
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
  let src = args.get('src');
  let note_class = args.get('c');
  let conf, img_file, img_url, is_playing = false;

  $('.preview a').href += location.search;

  if (note_class) {
    img_main.classList.add(note_class);
    img_inline.classList.add(note_class);
  }

  if (src && !src.startsWith('db:')) {
    img_url = IMG_BASE + src + '.jpg';
  } else {
    img_file = await base.loadAudioImage(src);

    if (img_file) {
      img_url = URL.createObjectURL(img_file);
      conf = await base.loadAudioConfig(src);
      if (conf?.hue > 0) {
        for (let img of [img_main, img_inline])
          img.style.filter = 'hue-rotate(' + conf.hue + 'deg)';
      }
    }
  }

  if (src) {
    for (let a of $$('#hires_buttons a.button'))
      a.href += '?src=' + src;
    for (let a of $$('#gif_buttons a.button'))
      a.href += '?src=' + src;
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
      await utils.playSound(signal, sample_rate, {
        audio,
        onstarted: () => startAudioProgressAnimation(audio),
      });
      audio.ctx = null;
    } finally {
      is_playing = false;
    }
  };

  if (img_file?.name)
    document.querySelector('#sound_info').textContent = img_file.name;

  if (img_url) {
    img_main.src = img_url;
    img_inline.src = img_url;
  }
}

async function initAudioSignal(sample_rate) {
  let blob = await base.loadAudioSignal(args.get('src'));
  return await utils.decodeAudioFile(blob, sample_rate);
}

function startAudioProgressAnimation(audio) {
  let vline = $('#vline');

  function update() {
    if (!audio.ctx) {
      vline.style.display = 'none';
      return;
    }
    let time = (audio.ctx.currentTime - audio.startedTime) / audio.duration;
    vline.style.left = (time * 100).toFixed(2) + '%';
    requestAnimationFrame(update);
  }

  vline.style.display = 'inline-block';
  update();
}

function startWaveformAnimation(sig1, wd, canvas, animation) {
  let sig2 = webfft.harmonic_conjugate(sig1);
  let tmp = new Float32Array(sig1.length);
  let max1 = sig1.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
  let max2 = sig2.reduce((s, x) => Math.max(s, Math.abs(x)), max1);
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
      wd.draw(tmp, [0, 1], max2);

      let img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      frames[id] = ctx.createImageData(canvas.width, canvas.height);
      frames[id].data.set(img.data);
    }

    frameId++;
    animation.id = requestAnimationFrame(drawFrame);
  }

  drawFrame(Date.now());
}
