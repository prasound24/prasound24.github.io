// u'' + damping*u' = T

uniform float iSound;

vec4 tex(float x) {
  return texture(iChannel0, vec2(x, 0.5)/iResolution);
}

float tension(float y1, float y2, float dx) {
  vec2 p1 = vec2(0., 1. + y1);
  vec2 p2 = vec2(sin(dx), cos(dx)) * (1. + y2);
  vec2 p12 = p2 - p1;
  float dx0 = 2.*(1. - cos(dx)); // Law of cosines, the segment length at rest
  vec2 T = p12*(1. - abs(dx0)/length(p12)); // Hooke's Law
  return T.y - 1e-3*y1;
}

void mainImage(out vec4 o, in vec2 p) {
  vec4 cc = tex(p.x);
  vec4 ll = tex(p.x - 1.);
  vec4 rr = tex(p.x + 1.);

  float dx = 1./iResolution.x;
  float dt = dx;
  float damping = 0.02;
  float dd_dt = damping/2.*dt;
  float T = 1e3;

  float sum = -2.*cc.r + cc.g - dd_dt*cc.r;
  sum -= dt*dt*T*tension(cc.r, rr.r, +dx);
  sum -= dt*dt*T*tension(cc.r, ll.r, -dx);
  o.r = -sum/(1. + dd_dt);
  
  if (p.x < 1.)
    o.r = iSound;
  o.r = clamp(o.r, -0.99, 0.99);
  o.g = cc.r;
}
