in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform vec2 iResolution; // canvas size in pixels
uniform float iTime; // milliseconds
uniform sampler2D iChannel0;

//${USER_SHADER}

void main() {
  vec4 fragColor = vec4(0.0);
  mainImage(fragColor, vTex * iResolution);
  float d = length(fragColor.rgb);
  v_FragColor = min(d, 1.0) * texture(iChannel0, vTex);
}
