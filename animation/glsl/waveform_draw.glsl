const vec3[] RGB1 = vec3[4](
  vec3(0.5, 0.5, 0.5),
  vec3(0.5, 0.5, 0.5),
  vec3(1.0, 1.0, 1.0),
  vec3(0.0, 0.1, 0.2));

vec3 sine_rgb(float t, vec3[4] w) {
  return w[0] + w[1] * cos(2. * PI * (w[2] * t + w[3]));
}

vec3 fire_rgb(float t) {
  float q = max(0., t * 1.88); // t=0..1 -> q=0..1.88 -> rgb=black..white
  return clamp(vec3(q, q * q * .4, q * q * q * .15), 0., 1.);
}

float soundFetch(float i) {
  if (i < 0. || i >= float(iSoundLen)) return 0.;
  ivec2 res = textureSize(iChannel2, 0);
  int y = int(i) / res.x;
  int x = int(i) % res.x;
  return texelFetch(iChannel2, ivec2(x,y), 0).r;
}

float soundImg(vec2 pp, ivec2 size) {
  vec2 r = pp * vec2(size);
  float s1 = soundFetch(floor(r.y)*float(size.x) + r.x);
  float s2 = soundFetch(ceil(r.y)*float(size.x) + r.x);
  return mix(s1, s2, fract(r.y));
}

void rectImg(out vec4 o, vec2 pp, ivec2 size) {
  float wh = float(size.x)/float(size.y);

  if (wh > 1.0) pp.y = (pp.y - (0.5-0.5/wh)) * wh;
  if (wh < 1.0) pp.x = (pp.x - (0.5-0.5*wh)) / wh;

  if (min(pp.x, pp.y) < 0. || max(pp.x, pp.y) >= 1.)
    return;

  float sig = soundImg(pp, size);

  o.rgb = sine_rgb(sig/iSoundMax*0.5+0.5, RGB1);
}

void diskImg(out vec4 o, vec2 pp, ivec2 size) {
  vec2 q = pp*2. - 1.;
  float r = length(q);
  if (r > 1.) return;
  float a = atan(q.x, -q.y)/PI*0.5 + 0.5;
  float sig = soundImg(vec2(a,r), size);
  o.rgb += sine_rgb(sig/iSoundMax*0.5+0.5, RGB1);
}

void mainImage(out vec4 o, in vec2 p) {
  ivec2 size;
  size.x = 1000 + iFrame % 10000;
  size.y = iSoundLen / size.x + 1;

  vec2 pp = (p - 0.5)/iResolution;

  diskImg(o, pp, size);
}
