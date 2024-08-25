import * as utils from '../utils.js';

const { $, $$, DB } = utils;
const DB_PATH_AUDIO = 'user_samples/_last/audio';
const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const IMG_BASE = '/img/xl/';

let img_main = $('.preview img');
let img_inline = $('img.inline');
let args = new URLSearchParams(location.search);
let url = '', filename = '';

if (args.get('src')) {
  filename = args.get('src');
  url = IMG_BASE + filename + '.jpg';
  for (let a of $$('#hires_buttons a.button'))
    a.href += '?src=' + filename;
  for (let a of $$('#gif_buttons a.button'))
    a.href += '?src=' + filename;
} else {
  let file = await DB.get(DB_PATH_IMAGE);
  if (file) {
    url = URL.createObjectURL(file);
    filename = file.name;
    let conf = await DB.get(DB_PATH_CONFIG);
    if (conf.hue > 0) {
      for (let img of [img_main, img_inline])
        img.style.filter = 'hue-rotate(' + conf.hue + 'deg)';
    }
  }
}

document.querySelector('#sound_info').textContent = filename;

if (url) {
  img_main.src = url;
  img_inline.src = url;
}
