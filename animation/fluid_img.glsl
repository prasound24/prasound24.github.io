#define PI 3.141592653589793

void mainImage(out vec4 o, in vec2 p) {
  vec4 c = texture(iChannel0, p.xy / iResolution.xy);
  float q = c.w;
  o.rgb = vec3(q, pow(q,2.)*.4, pow(q,3.)*.15);
}