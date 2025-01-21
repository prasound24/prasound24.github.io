in vec2 vTex; // supplied by webgl2.js/VSHADER_DEFAULT

uniform int iPass;
uniform int iChannelId; // the channel being updated, -1 = the canvas
uniform vec2 iResolution; // the output frame buffer size in pixels
uniform int iFrame;
uniform float iTime; // seconds
uniform float iSoundMax;
uniform int iSoundLen;
uniform vec3 iMouse;
uniform sampler2D iLogo;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
uniform sampler2D iChannelImage; // image rgba
uniform sampler2D iChannelSound; // sound r
uniform vec2 iChannelResolution0;
uniform vec2 iChannelResolution1;
uniform vec2 iChannelResolution2;
uniform vec2 iChannelResolution3;

const float PI = radians(180.);

//#include ${USER_SHADER}

void main() {
  v_FragColor = vec4(0,0,0,1);
  mainImage(v_FragColor, vTex * iResolution);
}
