#define TEX_IMAGE iChannel3
#define TEX_NOISE iChannel1

vec2 sphere2(vec3 origin, vec3 dir, vec3 center, float radius) {
  vec3 rc = center - origin;
  float b = dot(dir, rc); // dist to the closest point (B) to the center (C)
  float d2 = (radius * radius) - (dot(rc, rc) - b * b); // dist^2 from B to the sphere along dir
  if(d2 <= 0.)
    return vec2(0.); // no intersection
  float d = sqrt(d2);
  return vec2(b - d, b + d);
}

// https://en.wikipedia.org/wiki/Spherical_coordinate_system
vec2 spherical_uv(vec3 p) {
  float r = length(p);
  float theta = acos(p.z / r); // 0..PI
  float phi = atan(p.y, p.x); // -PI..PI
  return vec2(theta, phi);
}

vec3 spherical_tex(vec3 pos) {
  vec2 sp = spherical_uv(pos);
  sp.y += -iTime * 0.10;
  vec2 tex = 0.5 + 0.5 * vec2(cos(sp.y), sin(sp.y)) * sp.x / PI;
  return texture(TEX_IMAGE, tex).rgb; // * (1.0 + 0.1 * texture(TEX_NOISE, tex).r);
}

mat3 camera_mat3(in vec3 ro, in vec3 ta, float cr) {
  vec3 cw = normalize(ta - ro);
  vec3 cp = vec3(sin(cr), cos(cr), 0.0);
  vec3 cu = normalize(cross(cw, cp));
  vec3 cv = normalize(cross(cu, cw));
  return mat3(cu, cv, cw);
}

vec3 raytrace(vec2 fragCoord) {
  vec2 uv = (-1.0 + 2.0 * fragCoord.xy / iResolution.xy) *
    vec2(iResolution.x / iResolution.y, 1.0);
  vec3 origin = vec3(0.0, -1.1, -1.2);
  vec3 lookat = vec3(0);
  mat3 cam = camera_mat3(origin, lookat, 0.0);
  vec3 dir = cam * normalize(vec3(uv, 1.0));

  vec3 center = vec3(0);
  float radius = 1.0;

  vec2 dist12 = sphere2(origin, dir, center, radius);
  float dist = min(dist12.x, dist12.y);
  if(dist <= 0.0)
    return vec3(0);

  vec3 hit = origin + dir * dist;
  vec3 norm = normalize(center - hit);
  vec3 color = spherical_tex(hit); // * background(iTime, reflect(dir, norm));

  // find the 2nd intersection
  float dist2 = max(dist12.x, dist12.y);
  vec3 color2 = spherical_tex(origin + dir * dist2);
  float lum1 = dot(color, color);
  float lum2 = dot(color2, color2);
  return mix(color, color2, lum2 / (lum1 + lum2));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor.rgb = raytrace(fragCoord);
}
