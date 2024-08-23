in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform vec2 iResolution; // canvas size in pixels
uniform float iTime; // milliseconds
uniform sampler2D iChannel0;

//${USER_SHADER}

void main() {
  mainImage(v_FragColor, vTex * iResolution);
}
