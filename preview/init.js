import * as utils from '../utils.js';

const { $, DB } = utils;
const DB_PATH_AUDIO = 'user_samples/_last/audio';
const DB_PATH_IMAGE = 'user_samples/_last/image';

let args = new URLSearchParams(location.search);
let url = '', filename = '';

if (args.get('src')) {
  url = '/img/' + args.get('src') + '.jpg';
  filename = args.get('src');
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
