// http://www.easyrgb.com/en/math.php
const float eps = 216./24389.; // 0.008856
const float kap = 24389./27.; // 7.787 * 116.
const vec3  d65_2deg = vec3(0.95047,1.00000,1.08883);

float compand(float f){
  return f > 0.04045 ? pow(((f+0.055)/1.055),2.4) : f/12.92;
}
float invcompand(float t){
  return t > 0.0031308 ? 1.055*pow(t,1./2.4)-0.055 : 12.92*t;
}
float fn3(float t) {
  return t > eps ? pow(t,1./3.) : (kap*t+16.)/116.;
}
float invfn3(float t) {
  const float eps3 = pow(eps, 1./3.);
  return t > eps3 ? t*t*t : (t*116.-16.)/kap;
}

vec3 rgb2xyz(vec3 rgb){
	rgb.r = compand(rgb.r);
	rgb.g = compand(rgb.g);
	rgb.b = compand(rgb.b);
  const mat3 rgb2xyz_mat = 
    mat3(0.4124564, 0.3575761, 0.1804375,
        0.2126729, 0.7151522, 0.0721750,
        0.0193339, 0.1191920, 0.9503041);
  return rgb*rgb2xyz_mat;
}
vec3 xyz2rgb(vec3 xyz){
  const mat3 xyz2rgb_mat =
    mat3( 3.2404542, -1.5371385, -0.4985314,
        -0.9692660,  1.8760108,  0.0415560,
          0.0556434, -0.2040259,  1.0572252);
  xyz *= xyz2rgb_mat;
	float r = invcompand(xyz.x);
	float g = invcompand(xyz.y);
	float b = invcompand(xyz.z);
  return vec3(r,g,b);
}

vec3 xyz2lab(vec3 xyz){
  xyz /= d65_2deg;
  vec3 f = vec3(fn3(xyz.x), fn3(xyz.y), fn3(xyz.z));
  return vec3(116.*f.y-16., 500.*(f.x-f.y), 200.*(f.y-f.z));
}

vec3 lab2xyz(vec3 lab){
  float fy = (lab.x+16.)/116.;
  float fx = lab.y/500. + fy;
  float fz = fy - lab.z/200.;
  vec3 xyz = vec3(invfn3(fx), invfn3(fy), invfn3(fz));
  return xyz*d65_2deg;
}

vec3 rgb2lab(vec3 rgb) {
  return xyz2lab(rgb2xyz(rgb));
}

vec3 lab2rgb(vec3 lab) {
  return xyz2rgb(lab2xyz(lab));
}

vec3 rotateHue(vec3 rgb, float phi) {
  float c = cos(phi), s = sin(phi);
  vec3 lab = rgb2lab(rgb);
  lab.yz *= mat2(c, -s, s, c);
  return lab2rgb(lab);
}

float freqHue(float freq_hz) {
  const float c8_hz = 4434.; // https://en.wikipedia.org/wiki/Piano_key_frequencies
  return freq_hz > 0. ? fract(log2(freq_hz / c8_hz)) : -1.;
}

vec3 fire_rgb(float t) {
  float q = max(0., t*1.88); // t=0..1 -> q=0..1.88 -> rgb=black..white
  return clamp(vec3(q, q*q*.4, q*q*q*.15), 0., 1.);
}

void mainImage(out vec4 o, in vec2 p) {
  float temp = texture(iChannel0, p/iResolution).r;
  o.rgb = fire_rgb(temp * iBrightness);
  o.a = 1.; // smoothstep(0., 0.005, temp);

  float freq = texture(iChannel1, p/iResolution).r;
  if (freq > 0.) {
    float hue = freqHue(freq);
    if (hue > 0.)
      o.rgb = rotateHue(o.rgb, (hue - 0.1) * 2. * PI);
  } 
}