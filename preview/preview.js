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

  $('canvas#wave').onclick = async () => {
    if (is_playing)
      return;
    try {
      is_playing = true;
      let signal = await initAudioSignal(sample_rate);
      await utils.playSound(signal, sample_rate);
    } finally {
      is_playing = false;
    }
  };

  document.querySelector('#sound_info').textContent = filename;

  if (img_url) {
    img_main.src = img_url;
    img_inline.src = img_url;
  }

  try {
    let canvas = $('canvas#wave');
    let ctx = canvas.getContext('2d');
    let wd = base.initWaveformDrawer(canvas);
    let sig = await initAudioSignal();
    wd.draw(sig);

    let hsig = webfft.harmonic_conjugate(sig);
    let tmp = sig.slice();
    let amin = sig.reduce((s, x) => Math.min(s, x), +1);
    let amax = sig.reduce((s, x) => Math.max(s, x), -1);
    let frames = [], numFrames = 256, frameId = 0, prevTime = 0;

    drawFrame();

    function drawFrame(time) {
      if (time > prevTime + 1000 / 30) {
        prevTime = time;
        if (frameId < numFrames) {
          let phi = frameId / numFrames * 2 * Math.PI;
          let cos = Math.cos(phi), sin = Math.sin(phi);
          for (let i = 0; i < tmp.length; i++)
            tmp[i] = sig[i] * cos + hsig[i] * sin;
          wd.clear();
          let img = wd.draw(tmp, [0, 1], [amin, amax]);
          let frame = ctx.createImageData(img.width, img.height);
          frame.data.set(img.data);
          frames[frameId] = frame;
        } else {
          let frame = frames[frameId % numFrames];
          ctx.putImageData(frame, 0, 0);
        }
        frameId++;
      }
      
      requestAnimationFrame(drawFrame);
    }
  } catch (err) {
    $('canvas#wave').style.display = 'none';
    throw err;
  }
}

async function initAudioSignal(sample_rate) {
  let blob = await base.loadAudioSignal(args.get('src'));
  return await utils.decodeAudioFile(blob, sample_rate);
}
