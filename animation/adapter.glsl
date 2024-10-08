in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform vec2 iResolution; // the output frame buffer size in pixels
uniform int iFrame;
uniform float iTime; // seconds
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

const float PI = radians(180.);

//#include ${USER_SHADER}

void main() {
  mainImage(v_FragColor, vTex * iResolution);
}
