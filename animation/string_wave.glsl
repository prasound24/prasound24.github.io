uniform float iSound;

vec4 tex(float x) {
  return texture(iChannel0, vec2(x, 0.5)/iResolution);
}

void mainImage(out vec4 o, in vec2 p) {
  vec4 c = tex(p.x);
  vec4 l = tex(p.x - 1.);
  vec4 r = tex(p.x + 1.);

  // u_tt + damp*u_t - u_xx = 0
  float dt = 1./50e3;
  float dx = dt;
  float damping = 50.;

  float source = exp(-pow((p.x/iResolution.x - 0.5)/0.003, 2.));
  float sum = c.g - c.r*2. - c.g*damping/2.*dt - (l.r + r.r - c.r*2.)*pow(dt/dx, 2.);
  sum += (iSound - sum)*source*0.65;
  o.r = -sum/(1. + damping/2.*dt);
  o.r = clamp(o.r, -1e3, 1e3);
  o.gb = c.rg;
}
