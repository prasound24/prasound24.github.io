import * as utils from '../utils.js';
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

  img_main.onclick = async () => {
    if (is_playing)
      return;
    try {
      is_playing = true;
      let blob = await base.loadAudioSignal(args.get('src'));
      let sr = conf?.sampleRate || base.gconf.sampleRate;
      let signal = await utils.decodeAudioFile(blob, sr);
      await utils.playSound(signal, sr);
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
