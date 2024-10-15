import { DB } from './lib/utils.js';
import * as base from './create/base.js';

let $ = x => document.querySelector(x);
let $$ = x => document.querySelectorAll(x);

$('#tabs').onclick = e => {
  let tab = e.target.getAttribute('tab');
  if (!tab) return;

  for (let g of $$('#examples .grid'))
    g.classList.toggle('active', tab == g.id);
  for (let t of $$('#tabs span'))
    t.classList.toggle('active', tab == t.getAttribute('tab'));
};

for (let a of $$('.grid > a')) {
  let img = a.querySelector('img');
  if (!a.href && img.src) {
    let filename = img.src.split('/').slice(-1)[0].split('.')[0];
    let keynote = img.className;
    a.href = 'preview?src=' + filename + '&c=' + keynote;
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

  if (sids.length > 0)
    $('[tab="others"]').style.display = '';
}
