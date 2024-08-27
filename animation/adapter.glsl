in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform vec2 iResolution; // canvas size in pixels
uniform vec2 iChannelResolution0;
uniform vec2 iChannelResolution1;
uniform int iFrame;
uniform float iTime; // seconds
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;

//${USER_SHADER}

void main() {
  mainImage(v_FragColor, vTex * iResolution);
}
