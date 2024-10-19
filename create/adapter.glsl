in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform vec2 iResolution; // the output frame buffer size in pixels
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float iSampleRate;
uniform float iBrightness;

const float PI = radians(180.);

//#include ${USER_SHADER}

void main() {
  mainImage(v_FragColor, vTex * iResolution);
}
