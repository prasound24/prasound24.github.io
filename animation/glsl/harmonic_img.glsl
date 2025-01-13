#define TEX_IMAGE iChannel3

vec3 fire_rgb(float t) {
  float q = max(0., t*1.88); // t=0..1 -> q=0..1.88 -> rgb=black..white
  return clamp(vec3(q, q*q*.4, q*q*q*.15), 0., 1.);
}

void mainImage(out vec4 o, in vec2 p) {
  vec4 c = texture(TEX_IMAGE, p / iResolution);
  float phi = iTime;
  float temp = c.r * cos(phi) + c.b * sin(phi);
  o.rgb += fire_rgb(abs(temp));
}