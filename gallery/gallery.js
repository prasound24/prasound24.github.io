import * as utils from '../utils.js';
import * as base from '../create/base.js';

const { $, dcheck } = utils;
const { gconf } = base;

const XS_IMG_SIZE = 256;

init();

async function init() {
  await showTempSounds();
}

async function showTempSounds() {
  let time = Date.now();
  let sound_ids = await base.getTempSoundIds();

  $('#info').textContent = 'Displaying ' + sound_ids.length + ' sounds';
  if (sound_ids.length == 0) {
    $('#info').textContent = 'No sounds to display';
    return 0;
  }

  let grid = $('.grid');
  let sample = grid.firstElementChild;
  let sounds = new Map; // sid -> {a, audio, image, config}

  for (let a of grid.querySelectorAll('div'))
    if (a !== sample)
      a.remove();

  for (let sid of sound_ids) {
    let a = sample.cloneNode(true);
    a.setAttribute('sid', sid);
    grid.append(a);
    sounds.set(sid, { a });
  }

  console.log('Reading audio files from DB:', sounds.size);
  let reads = sound_ids.map(async (sid) => {
    let s = sounds.get(sid);
    s.audio = await base.loadTempSound(sid); // File
    s.image = await base.loadTempSoundImage(sid);
    s.config = await base.loadTempSoundConfig(sid);
  });
  await Promise.all(reads);

  console.log('Updating the sound images');
  for (let [sid, s] of sounds.entries()) {
    let { a, audio, image, config } = s;

    try {
      if (!image) {
        console.log('Rendering', XS_IMG_SIZE + 'x' + XS_IMG_SIZE, 'sound image:', audio.name);
        config = config || adjustConfigToImgSize(gconf, XS_IMG_SIZE);
        let signal = await utils.decodeAudioFile(audio, config.sampleRate);
        signal = base.padAudioWithSilence(signal);
        let [ll, rr] = base.findSilenceMarks(signal, config.silenceThreshold, config.numSteps);
        signal = signal.subarray(ll, -1);
        let canvas = document.createElement('canvas');
        await base.drawStringOscillations(signal, canvas, config);
        await base.drawDiskImage(canvas, config);
        image = await new Promise(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', 0.85));
        await base.saveTempSoundImage(sid, image);
      }

      let title = (audio.name || '').replace(/_/g, ' ').replace(/\..+$/, '');
      let parts = title.split(' ');
      a.querySelector('.a').textContent = parts.slice(0, 2).join(' ');
      a.querySelector('.b').textContent = parts.slice(2).join(' ');
      
      let keynote = parts[1].replace(/\d$/, '');
      if (!/^[A-G]s?$/.test(keynote))
        keynote = '';

      let img = a.querySelector('img');
      img.src = URL.createObjectURL(image);
      img.classList.add(keynote);
      let sr = config?.sampleRate || 48000;
      a.querySelector('.a').onclick = () => base.playTempSound(sid, sr);
      a.querySelector('a').href = '/create?src=db:' + sid + '&c=' + keynote;
      a.className = image ? '' : 'ready';
    } catch (err) {
      a.className = 'error';
      console.error('Failed to process ' + sid + ':', err);
    }
  }

  console.log('Sounds displayed in', Date.now() - time, 'ms');
  return sound_ids.length;
}

function adjustConfigToImgSize(conf, img_size) {
  conf = utils.clone(conf);
  let scale = img_size / conf.imageSize;
  scale = 2 ** Math.ceil(Math.log2(scale));
  dcheck(scale > 0);
  conf.imageSize *= scale;
  conf.numSteps *= scale;
  // conf.stringLen *= scale;
  // conf.sampleRate *= scale;
  return conf;
}
