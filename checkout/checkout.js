import * as utils from '../lib/utils.js';

const { $, DB } = utils;
const DB_PATH_IMAGE = 'user_samples/_last/image';
const IMG_BASE = '/img/xl/';

let img = $('.preview img');
let link = $('.preview a');
let args = new URLSearchParams(location.search);
let url = '', filename = '';

if (args.get('src')) {
  filename = args.get('src');
  url = IMG_BASE + filename + '.jpg';
} else {
  let file = await DB.get(DB_PATH_IMAGE);
  if (file) {
    url = URL.createObjectURL(file);
    filename = file.name;
  }
}

if (url) {
  link.href = url;
  link.download = filename + '.jpg';
  img.src = url;
  img.onload = () => {
    link.innerHTML = img.naturalWidth + '&times;' + img.naturalHeight;
  };
}
