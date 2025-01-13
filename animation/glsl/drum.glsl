#define TEX_DRUM iChannel0
#define TEX_NOISE iChannel2
#define DAMPING 0.001

#define DT 0.7
#define DX 1.0

uniform float iSound;

// u_tt = u_xx - d*u_t
vec4 drum(vec2 p) {
  vec2 dx = vec2(1, 0) / iResolution;
  vec2 dy = vec2(0, 1) / iResolution;
  
  vec4 c = texture(TEX_DRUM, p); // c.x = u[t], c.y = u[t-1]
  vec4 n = texture(TEX_DRUM, p + dy);
  vec4 s = texture(TEX_DRUM, p - dy);
  vec4 w = texture(TEX_DRUM, p + dx);
  vec4 e = texture(TEX_DRUM, p - dx);

  vec4 laplacian = n + w + s + e - 4. * c;
  float r1 = 1. - DT*DAMPING*0.5;
  float r2 = 1. + DT*DAMPING*0.5;
  float u = (c.x*2. - c.y*r1 + laplacian.x*(DT*DT/DX*DX)) / r2;

  float noise = 0.005*texture(TEX_NOISE, p).x;
  if (length(p - 0.5) + noise > 0.45)
    u = iSound;

  c.w = clamp(u, -1e3, +1e3);
  return c.wxyz;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = drum(fragCoord / iResolution);
}
