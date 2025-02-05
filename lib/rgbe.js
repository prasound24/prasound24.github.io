// Image files with .hdr or .pic extension.
// https://en.wikipedia.org/wiki/RGBE_image_format
// https://www.paulbourke.net/dataformats/pic
// https://www.graphics.cornell.edu/%7Ebjw/rgbe/rgbe.c
export function createRGBE(width, height, rgba_data) {
  if (rgba_data.length != height * width * 4)
    throw new Error('Wrong size of RGBA data');

  let header = [
    '#?RADIANCE', // #?RGBE also works
    'GAMMA=0.4545',
    'PRIMARIES=0.64 0.33 0.3 0.6 0.15 0.06 0.3127 0.3290', // Adobe RGB
    'FORMAT=32-bit_rle_rgbe',
    '',
    '+Y ' + height + ' +X ' + width,
    '',
  ].join('\n');

  let data = new Uint8Array(header.length + rgba_data.length);
  let rgbe = new Uint8ClampedArray(data.buffer, header.length);

  for (let i = 0; i < header.length; i++)
    data[i] = header.charCodeAt(i);

  for (let i = 0; i < rgbe.length; i += 4) {
    let r = rgba_data[i + 0];
    let g = rgba_data[i + 1];
    let b = rgba_data[i + 2];
    let max = Math.max(r, g, b);
    if (max <= 0) continue; // rgbe=0
    let exp = Math.log2(max);
    let iexp = Math.ceil(exp);
    let scale = Math.pow(2, exp - iexp);

    rgbe[i + 0] = r / max * 256 * scale;
    rgbe[i + 1] = g / max * 256 * scale;
    rgbe[i + 2] = b / max * 256 * scale;
    rgbe[i + 3] = iexp + 128;
  }

  return new Blob([data.buffer], { type: 'image/vnd.radiance' });
}
