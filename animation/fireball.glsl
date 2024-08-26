float snoise(vec3 uv, float res) {
  const vec3 s = vec3(1e0, 1e2, 1e3);

  uv *= res;

  vec3 uv0 = floor(mod(uv, res)) * s;
  vec3 uv1 = floor(mod(uv + vec3(1.), res)) * s;

  vec3 f = fract(uv);
  f = f * f * (3.0 - 2.0 * f);

  vec4 v = vec4(uv0.x + uv0.y + uv0.z, uv1.x + uv0.y + uv0.z, uv0.x + uv1.y + uv0.z, uv1.x + uv1.y + uv0.z);

  vec4 r = fract(sin(v * 1e-1) * 1e3);
  float r0 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);

  r = fract(sin((v + uv1.z - uv0.z) * 1e-1) * 1e3);
  float r1 = mix(mix(r.x, r.y, f.x), mix(r.z, r.w, f.x), f.y);

  return mix(r0, r1, f.z) * 2. - 1.; // -1..1
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = -.5 + fragCoord.xy / iResolution.xy; // -0.5..0.5
  p.x *= iResolution.x / iResolution.y;
  // fragColor = (length(p) < 0.5 ? 1.0 : 0.0) * vec4(1.0);
  // return;

  vec3 polar = vec3(atan(p.x, p.y) / 6.2832 + .5, length(p) * 0.3, .5);
  // polar.xy = vec2(p.x, (p.y + 0.5) * 0.7); // 0..1
  float temp = 0.0;

  for(int i = 1; i <= 8; i++) {
    float scale = exp2(float(i));
    vec3 diff = vec3(0., -iTime * .05, iTime * .01);
    temp += 1.0/scale * snoise(polar + diff, scale * 16.);
  }

  // temp = -1..1
  // temp = temp + 3.0 - 15.0 * polar.y;

  float img = 0.0;
  if (abs(p.x) < 0.5 && abs(p.y) < 0.5)
    img = texture(iChannel0, p + 0.5).r; // 0..1 
  temp = img + 0.15 * temp;
  temp = max(0.0, temp);
  
  temp *= 1.88;
  vec3 color = vec3(temp, pow(temp, 2.) * 0.4, pow(temp, 3.) * 0.15);
  // vec3 color = vec3(temp * 4.0, temp * 2.0, temp);
  
  fragColor = vec4(color, 1.0);
}
