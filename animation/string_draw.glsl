uniform float iSound;

vec3 fire_rgb(float t) {
  float q = max(0., t*1.88); // t=0..1 -> q=0..1.88 -> rgb=black..white
  return clamp(vec3(q, q*q*.4, q*q*q*.15), 0., 1.);
}

vec3 sdf(vec2 q) {
  if (length(q) > 1.)
    return vec3(0.);
  float dx = 1./iChannelResolution0.x;
  float a = atan(q.y, q.x)/(2.*PI);
  a = (round(a/dx + 0.5) - 0.5) * dx;
  vec4 tex = texture(iChannel0, vec2(a, 0.5));
  float r = tex.r;
  r = (1. + r) * 0.5;
  float d0 = dx*PI/2.;
  if (abs(length(q) - r) > d0)
    return vec3(0.);
  vec2 c = r * vec2(cos(a*2.*PI), sin(a*2.*PI));
  float d = length(q - c) - d0;
  return vec3(d < 0. ? 1. : 0.);
}

void mainImage(out vec4 o, in vec2 p) {
  vec2 q = p / iResolution * 2. - 1.;
  o.rgb += sdf(q.yx);
}
