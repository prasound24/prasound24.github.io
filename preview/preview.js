import * as utils from '../utils.js';

const { $, $$, DB } = utils;
const DB_PATH_IMAGE = 'user_samples/_last/image';
const DB_PATH_CONFIG = 'user_samples/_last/config';
const IMG_BASE = '/img/xl/';

init();

async function init() {
  let img_main = $('.preview img');
  let img_inline = $('img.inline');
  let args = new URLSearchParams(location.search);
  let filename = args.get('src');
  let img_url;

  if (filename) {
    img_url = IMG_BASE + filename + '.jpg';

    for (let a of $$('#hires_buttons a.button'))
      a.href += '?src=' + filename;
    for (let a of $$('#gif_buttons a.button'))
      a.href += '?src=' + filename;

    $('#customize').href += '?src=' + filename;
  } else {
    let img_file = await DB.get(DB_PATH_IMAGE);
    if (img_file) {
      img_url = URL.createObjectURL(img_file);
      filename = img_file.name;
      let conf = await DB.get(DB_PATH_CONFIG);
      if (conf.hue > 0) {
        for (let img of [img_main, img_inline])
          img.style.filter = 'hue-rotate(' + conf.hue + 'deg)';
      }
    }
  }

  document.querySelector('#sound_info').textContent = filename;

  if (img_url) {
    img_main.src = img_url;
    img_inline.src = img_url;
  }
}
