uniform float iSound;

float lookup(float phi) {
  return texture(iChannel0, vec2(phi / PI * 0.5, 0.5)).r;
}

void mainImage(out vec4 o, in vec2 p) {
  vec2 q = p / iResolution * 2. - 1.;

  float r = length(q);
  float a = atan(q.x, q.y);

  float c1 = lookup(a) - iSound;
  float d1 = abs(r - 0.5 - c1);

  if(d1 < 0.001)
    o.rgb += vec3(1.0);

  o.rgb += 0.9 * texture(iChannel1, p / iResolution).rgb;
}
