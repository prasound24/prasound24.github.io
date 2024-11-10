uniform float iSound;

vec3 fire_rgb(float t) {
  float q = max(0., t*1.88); // t=0..1 -> q=0..1.88 -> rgb=black..white
  return clamp(vec3(q, q*q*.4, q*q*q*.15), 0., 1.);
}

vec2 lookup(float phi) {
  float x = phi / PI * 0.5;
  float y = texture(iChannel0, vec2(x, 0.5)).r;
  float l = texture(iChannel0, vec2(x - 1./1024., 0.5)).r;
  float r = texture(iChannel0, vec2(x + 1./1024., 0.5)).r;
  return vec2(y, (r-l)/2.); // - iSound;
}

void mainImage(out vec4 o, in vec2 p) {
  vec2 q = p / iResolution * 2. - 1.;

  float r = length(q);
  float a = atan(q.x, -q.y);

  vec2 c1 = lookup(a);
  float d1 = abs(r - 0.5 - c1.x/2.);
  
  c1.y /= r;
  d1 /= sqrt(1. + c1.y*c1.y); // https://iquilezles.org/articles/distance

  o.rgb += fire_rgb(1. - d1/0.01);

  //o.rgb += 0.9 * texture(iChannel1, p / iResolution).rgb;
}
