import * as utils from '../lib/utils.js';
import * as base from '../create/base.js';

const { $, $$, DB } = utils;
const DB_PATH_IMAGE = 'user_samples/_last/image';
const IMG_BASE = '/img/xl/';

let args = new URLSearchParams(location.search);

initImg();

async function initImg() {
  let url, file, filename;
  let src = args.get('src');

  if (src.startsWith('db:')) {
    file = await base.loadAudioImage(src);
  } else if (src) {
    filename = src;
    url = IMG_BASE + filename + '.jpg';
  } else {
    file = await DB.get(DB_PATH_IMAGE);
  }

  if (file) {
    url = URL.createObjectURL(file);
    filename = file.name;
  }

  if (!url) {
    console.warn('src=' + src);
    return;
  }

  console.log('Loading:', url);
  let tmp = new Image;
  await new Promise((resolve, reject) => {
    tmp.onload = () => resolve();
    tmp.onerror = () => reject(new Error('img.onerror'));
    tmp.src = url;
  });

  let img = $('.preview img');
  img.src = URL.createObjectURL(await createLandscapeVersion(tmp, [240, 135]));

  for (let p of $$('.preview p')) {
    let h = +p.id.replace('p', '');
    let w = Math.round(h * 16 / 9);
    if (!h || !w) continue;

    let blob = await createLandscapeVersion(tmp, [w, h]);
    let link = p.querySelector('a');
    let span = p.querySelector('span');
    link.innerHTML = w + '<b>&times;' + h + 'p</b>';
    link.href = URL.createObjectURL(blob);
    link.download = filename + '_' + h + 'p.png';
    span.textContent = (blob.size / 1e6).toFixed(1);
  }
}

function createLandscapeVersion(img, [w2, h2]) {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  let c2 = document.createElement('canvas');
  c2.width = w2;
  c2.height = h2;
  let ctx = c2.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w2, h2);
  ctx.drawImage(img, 0, 0, w, h, (w2 - h2) / 2, 0, w * h2 / h, h2);
  return new Promise(resolve =>
    c2.toBlob(resolve, 'image/png', 1.00));
}
