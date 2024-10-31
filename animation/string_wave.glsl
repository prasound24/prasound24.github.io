uniform float iSound;

vec4 tex(float x) {
  return texture(iChannel0, vec2(x, 0.5)/iResolution);
}

void mainImage(out vec4 o, in vec2 p) {
  vec4 c = tex(p.x);
  vec4 l = tex(p.x - 1.);
  vec4 r = tex(p.x + 1.);

  // u_tt + damp*u_t - u_xx = 0
  float damping = 0.001;
  float sum = c.g - damping*0.5*c.g - l.r - r.r;
  o.r = -sum/(1. + damping*0.5);
  o.r = clamp(o.r, -1e3, 1e3);
  o.gb = c.rg;

  if (p.x == 0.5)
    o.r = iSound;
}
