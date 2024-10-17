// https://www.easyrgb.com/en/math.php

const x0 = 95.047;
const y0 = 100;
const z0 = 108.883;

export function rgb2xyz([r, g, b]) {
  let f = (t) => t > 0.04045 ?
    Math.pow((t + 0.055) / 1.055, 2.4) :
    t / 12.92;

  let rr = f(r) * 100;
  let gg = f(g) * 100;
  let bb = f(b) * 100;

  let x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  let y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  let z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;

  return [x, y, z];
}

export function xyz2rgb([x, y, z]) {
  let r = x * +3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * +1.8758 + z * +0.0415;
  let b = x * +0.0557 + y * -0.2040 + z * +1.0570;

  let f = (t) => t > 0.0031308 ?
    1.055 * Math.pow(t, 1 / 2.4) - 0.055 :
    12.92 * t;

  return [f(r / 100), f(g / 100), f(b / 100)];
}

export function xyz2lab([x, y, z]) {
  let f = (a) => a > 0.008856 ? Math.cbrt(a) :
    7.787 * a + 16 / 116;

  let xx = f(x / x0);
  let yy = f(y / y0);
  let zz = f(z / z0);

  let l = 116 * yy - 16;
  let a = 500 * (xx - yy);
  let b = 200 * (yy - zz);

  return [l, a, b];
}

export function lab2xyz([l, a, b]) {
  let yy = (l + 16) / 116;
  let xx = a / 500 + yy;
  let zz = yy - b / 200;

  let f = (t) => t > 0.2069 ?
    t * t * t : (t - 16 / 116) / 7.787;

  let x = f(xx) * x0;
  let y = f(yy) * y0;
  let z = f(zz) * z0;

  return [x, y, z];
}

export function rgb2lab(rgb) {
  return xyz2lab(rgb2xyz(rgb));
}

export function lab2rgb(lab) {
  return xyz2rgb(lab2xyz(lab));
}

export function hue_rotate(rgb, phi) {
  let [l, a, b] = rgb2lab(rgb);
  let cos = Math.cos(phi), sin = Math.sin(phi);
  [a, b] = [a * cos - b * sin, a * sin + b * cos];
  return lab2rgb([l, a, b]);
}
