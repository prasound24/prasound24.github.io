import * as utils from '../lib/utils.js';
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

  if (sound_ids.length == 0)
    return 0;

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

    let pitch = -1;

    try {
      let conf2 = adjustConfigToImgSize(gconf, XS_IMG_SIZE);

      if (!image || JSON.stringify(conf2) != JSON.stringify(config)) {
        console.log('Rendering', XS_IMG_SIZE + 'x' + XS_IMG_SIZE, 'sound image:', audio.name);
        a.classList.add('current');
        config = conf2;
        let signal = await utils.decodeAudioFile(audio, config.sampleRate);
        signal = base.padAudioWithSilence(signal);
        let [ll, rr] = base.findSilenceMarks(signal, config.silenceThreshold, config.numSteps);
        signal = signal.subarray(ll, -1);
        let canvas = document.createElement('canvas');
        await base.drawStringOscillations(signal, canvas, config);
        await base.drawDiskImage(canvas, config);
        image = await new Promise(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', 1.00));
        await base.saveTempSoundImage(sid, image);
        await base.saveTempSoundConfig(sid, config);
        //pitch = utils.meanPitch(utils.meanFreq(signal, config.sampleRate)); // 0..1
      }

      let keynote = '';

      try {
        let title = (audio.name || '').replace(/_/g, ' ').replace(/\..+$/, '');
        let parts = title.split(' ');
        a.querySelector('.a').textContent = parts.slice(0, 2).join(' ');
        a.querySelector('.b').textContent = parts.slice(2).join(' ');

        //keynote = parts[1].replace(/\d$/, '');
        //if (!/^[A-G]s?$/.test(keynote))
        //  keynote = '';
      } catch (err) {
        keynote = '';
        console.debug('Cannot parse audio name "' + audio.name + '":', err.message);
      }

      let img = a.querySelector('img');
      img.src = URL.createObjectURL(image);
      if (keynote)
        img.classList.add(keynote);
      else if (pitch >= 0)
        img.style.filter = 'hue-rotate(' + Math.round(pitch * 360) + 'deg)';

      let sr = config?.sampleRate || 48000;
      a.querySelector('.a').onclick = () => base.playTempSound(sid, sr);
      let href = '/create?src=db:' + sid;
      if (keynote) href += '&c=' + keynote;
      href += location.search.replace('?', '&');
      a.querySelector('a').href = href;
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
  base.initConfFromURL(conf);
  // conf.stringLen *= scale;
  // conf.sampleRate *= scale;
  return conf;
}
