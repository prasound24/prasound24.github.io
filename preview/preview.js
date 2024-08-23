import * as utils from '../utils.js';

const { $, $$, DB } = utils;
const DB_PATH_AUDIO = 'user_samples/_last/audio';
const DB_PATH_IMAGE = 'user_samples/_last/image';
const IMG_BASE = '/img/xl/';

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
  }
}

document.querySelector('#sound_info').textContent = filename;

if (url) {
  $('.preview img').src = url;
  $('img.inline').src = url;
}
