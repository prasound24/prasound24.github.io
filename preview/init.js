import * as utils from '../utils.js';

const { $, DB } = utils;
const DB_PATH_AUDIO = 'user_samples/_last/audio';
const DB_PATH_IMAGE = 'user_samples/_last/image';

let args = new URLSearchParams(location.search);
let img = document.querySelector('.stage img');
let url = '';

if (args.get('src')) {
  url = '/img/' + args.get('src') + '.jpg';
} else {
  let file = await DB.get(DB_PATH_IMAGE);
  if (file) url = URL.createObjectURL(file);
}

console.log('img.src = ' + url);

if (url) {
  img.src = url;
  let arts = [...document.querySelectorAll('#wall_art img')];
  for (let art of arts)
    if (art.getAttribute('style'))
      art.src = img.src;
}
