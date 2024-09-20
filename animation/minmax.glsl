#define TEX_DRUM iChannel0
#define TEX_MINMAX iChannel1
#define INTERVAL 2000

uniform float iSound;

vec4 minmax(vec2 p) {
  vec4 m = texture(TEX_MINMAX, p);
  float u = texture(TEX_DRUM, p).x - iSound;
  if (iFrame % INTERVAL == 0)
    return vec4(u, u, 0., 0.);
  m.x = min(m.x, u);
  m.y = max(m.y, u);
  m.z += 1.;
  m.w = (m.y - m.x) / m.z;
  return m;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = minmax(fragCoord / iResolution);
}
