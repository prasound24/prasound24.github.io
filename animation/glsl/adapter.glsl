in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform int iPass;
uniform int iKeyPressed;
uniform vec2 iGamma; // (2.2, 1.0)
uniform int iChannelId; // the output channel, -1 = the canvas
uniform vec2 iResolution; // the output frame buffer size in pixels
uniform int iFrame;
uniform float iTime; // seconds
uniform vec4 iMouse;
uniform sampler2D iKeyboard; // 256x1x1
uniform sampler2D iLogo;
uniform sampler2D iLogoL;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;

const float PI = radians(180.);

const int IMG_W = 0;
const int IMG_H = 0;

//#include ${USER_SHADER}

void main() {
  v_FragColor = vec4(0);
  mainImage(v_FragColor, vTex * iResolution);
}
