import { DB, $, $$ } from '../lib/utils.js';
import * as base from '../create/base.js';

for (let a of $$('.grid > a')) {
  let img = a.querySelector('img');
  if (!a.href && img.src) {
    let filename = img.src.split('/').slice(-1)[0].split('.')[0];
    a.href = '/preview?src=' + filename;
  }
}

initGallery();

async function initGallery() {
  let sids = await DB.keys(base.DB_SAVED_IMAGES_XS);
  let grid = $('.grid#others');
  
  for (let sid of sids) {
    let conf = await DB.get(base.DB_SAVED_CONFIGS + '/' + sid);
    let img_file = await DB.get(base.DB_SAVED_IMAGES_XS + '/' + sid);
    let a = document.createElement('a');
    let img = document.createElement('img');
    img.setAttribute('loading', 'lazy');
    img.style.filter = 'hue-rotate(' + conf?.hue + 'deg)';
    img.src = URL.createObjectURL(img_file);
    a.setAttribute('href', '/preview?src=db:' + sid);
    a.append(img);
    grid.append(a);
  }
}
