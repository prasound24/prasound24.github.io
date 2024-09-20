#define TEX_IMAGE iChannel3
#define TEX_NOISE iChannel1
#define STEPS 256
#define TDISK 0.05
#define DENSITY 0.75

mat2 rot2x2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

mat3 cam3x3(in vec3 ro, in vec3 ta, float cr) {
  vec3 cw = normalize(ta - ro);
  vec3 cp = vec3(sin(cr), cos(cr), 0.0);
  vec3 cu = normalize(cross(cw, cp));
  vec3 cv = normalize(cross(cu, cw));
  return mat3(cu, cv, cw);
}

float cos2(float x) {
  return (1. - step(1., abs(x))) * (cos(x * PI) * 0.5 + 0.5);
}

// pos.xy = -1..1
// pos.z = -TDISK..TDISK
vec4 tex3d(vec3 pos) {
  pos.xy *= rot2x2(iTime * 0.1);
  vec3 c = texture(TEX_IMAGE, pos.xy * 0.5 + 0.5).rgb;
  float w1 = max(c.r, max(c.g, c.b)); // 0..1
  float w2 = min(c.r, min(c.g, c.b)); // 0..1
  float w = mix(w1, w2, 0.5);
  w *= 1.0 + 0.3*texture(TEX_NOISE, pos.xy * 0.5 + 0.5).r;
  if(w < 0.001)
    return vec4(0);
  float a = cos2(pos.z / (w * TDISK)) / (w * TDISK);
  a = clamp(a, 0., 1.);
  return vec4(c, a * DENSITY);
}

float sdCappedCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

vec3 raytrace(vec2 fragCoord) {
  vec2 uv = (-1.0 + 2.0 * fragCoord.xy / iResolution.xy) *
    vec2(iResolution.x / iResolution.y, 1.0);
  vec3 eye = vec3(0., -1.5, -1.0)/1.5;
  vec3 lookat = vec3(0);
  mat3 cam = cam3x3(eye, lookat, 0.0);
  vec3 dir = cam * normalize(vec3(uv, 1.0));
  vec4 sum;
  float t = 0.;

  for(int i = 0; i < STEPS; i++) {
    vec3 pos = eye + dir * t;
    float sdf = sdCappedCylinder(pos, TDISK, 1.);

    if(sdf < 0.) {
      vec4 col = tex3d(pos);
      col.rgb *= col.a;
      sum += col * (1. - sum.a);
      if(sum.a > 0.999)
        break;
      t += max(abs(sdf), 1.) / float(STEPS);
    } else {
      t += max(abs(sdf), 0.001);
    }
  }

  return sum.rgb;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor.rgb = raytrace(fragCoord);
}
