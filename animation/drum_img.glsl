#define TEX_DRUM iChannel0
#define TEX_MINMAX iChannel1

vec3 fire_rgb(float t) {
  float q = max(0., t*1.88); // t=0..1 -> q=0..1.88 -> rgb=black..white
  return clamp(vec3(q, q*q*.4, q*q*q*.15), 0., 1.);
}

void mainImage(out vec4 o, in vec2 p) {
  vec4 c = texture(TEX_MINMAX, p / iResolution);
  o.rgb += fire_rgb(abs(c.w) * 1e2);
  if (c.x == -1e3) o.rgb = vec3(0,0,1);
  if (c.x == +1e3) o.rgb = vec3(0,1,0);
  
  if (length(p/iResolution -  0.5) > 0.45)
    o = vec4(0);
}