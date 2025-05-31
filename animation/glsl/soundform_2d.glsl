uniform sampler2D iChannel4;

#define CH_EXR_DATA     iChannel0
#define CH_3D_MESH      iChannel1
#define CH_BVH_TREE     iChannel2
#define CH_CONFIG       iChannel4

#define ID_SCALE        0
#define ID_ROTATION     1
#define ID_POSITION     2
#define ID_BRIGHTNESS   3

const float INF = 1e6;
const int MAX_LOOKUPS = 4096; // max lookups in the quad tree
const int STACK_SIZE = 32; // deque (stack) size
const int BVH_DEPTH = 12; // quad-tree spans at most 4096x4096 points
const float R0 = 0.003;
const float SIGMA = 3.0; // gaussian
const float MOUSE_ZOOM = 0.1;
const float INIT_ZOOM = 1.0;
const bool INK_STYLE = true;
const float BRIGHTNESS = 2e-5/R0/R0; // gaussians
const int MAX_SAMPLES = 1000;

#define KEY_V 86
#define KEY_W 87
#define KEY_A 65
#define KEY_D 68
#define KEY_S 83
#define KEY_Q 81
#define KEY_E 69
#define KEY_R 82
#define KEY_F 70
#define KEY_T 84
#define KEY_G 71

const ivec2[] NB4 = ivec2[](
    ivec2(0,0), ivec2(0,1), ivec2(1,0), ivec2(1,1));

// This rather gross complexity around quad-tree is
// an attempt to store a stack of 7x5 -> 4x3 -> 2x2 -> 1x1
// overlapping mipmaps within the same 7x5 texture.
ivec4[BVH_DEPTH] qtInit(ivec2 iResolution) {
    ivec2 r = iResolution;
    ivec4[BVH_DEPTH] qt;
    
    for (int d = BVH_DEPTH-1; d >= 0; d--)
        qt[d].zw = r = (r+1)/2;
        
    ivec2 box = ivec2(0);
    
    for (int i = 0; i < BVH_DEPTH; i++) {
        qt[i].xy = box*ivec2(1 - i%2, i%2);
        box = max(box, qt[i].xy + qt[i].zw);
    }
    
    return qt;
}

ivec2 qtLookup(ivec2 p, int d, ivec4[BVH_DEPTH] qt) {
    ivec4 r = qt[d];
    p = min(p, r.zw-1);
    return r.xy + p;
}

ivec2 qtReverse(ivec2 p, int d, ivec4[BVH_DEPTH] qt) {
    ivec4 r = qt[d];
    p -= r.xy;
    if (min(p.x, p.y) >= 0 && max(p.x - r.z, p.y - r.w) < 0)
        return p;
    return ivec2(-1);
}

mat2 rot2(float phi) {
    float c = cos(phi), s = sin(phi);
    return mat2(c,s,-s,c);
}

/// CH_3D_MESH ////////////////////////////////////////////////////////////////

void mainImage1(out vec4 o, in vec2 p) {
    vec2 uv = p/vec2(textureSize(CH_3D_MESH, 0));
    o = texture(CH_EXR_DATA, uv); // interpolate the exr data

    o.w = R0; // sphere radius
    o *= pow(0.997, p.y); // time
    o /= 1.25 - o.w; // basic perspective projection

    vec4 rot = texelFetch(CH_CONFIG, ivec2(ID_ROTATION,0), 0);
    o.xy *= rot2(rot.z);
    o.yz *= rot2(rot.x);

    o /= 1.25 - o.z; // basic perspective projection
}

/// Buffer C /////////////////////////////////////////////////////////////////////

// Updates the quad-tree of bounding boxes
// in about log2(width,height) steps. This
// works so long as points that are nearby
// in the CH_3D_MESH mesh are also nearby
// in the 3d space.

vec4 bboxInit(ivec2 pp) {
    vec4 b = vec4(1,1,-1,-1)*INF;
    ivec2 wh = textureSize(CH_3D_MESH, 0);
    
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 2; j++) {
            ivec2 qq = pp*2 + NB4[i] + NB4[j];
            qq.x = qq.x % wh.x;
            vec4 r = texelFetch(CH_3D_MESH, qq, 0);
            //if (r.w <= 0.) continue;
            b.xy = min(b.xy, r.xy - r.w);
            b.zw = max(b.zw, r.xy + r.w);
        }
    }
    
    b.zw = max(b.zw, b.xy);
    return b;
}

vec4 bboxJoin(ivec2 pp, int d, ivec4[BVH_DEPTH] qt) {
    vec4 b = vec4(1,1,-1,-1)*INF;
    
    for (int i = 0; i < 4; i++) {
         ivec2 pp2 = pp*2 + NB4[i];
         pp2 = qtLookup(pp2, d+1, qt);
         vec4 r = texelFetch(CH_BVH_TREE, pp2, 0);
         b.xy = min(b.xy, r.xy);
         b.zw = max(b.zw, r.zw);
    }
    
    b.zw = max(b.zw, b.xy);
    return b;
}

void mainImage2( out vec4 o, in vec2 p ) {
    ivec2 pp = ivec2(p);
    ivec4[BVH_DEPTH] qt = qtInit(ivec2(iResolution));
    int d = BVH_DEPTH - 1 - iPass % BVH_DEPTH;
    ivec2 qq = qtReverse(pp, d, qt);
    
    o = texelFetch(CH_BVH_TREE, pp, 0);
    if (qq.x < 0) return;
    
    o = d < BVH_DEPTH-1 ?
        bboxJoin(qq, d, qt) :
        bboxInit(qq);
}

/// Image ////////////////////////////////////////////////////////

bool sdBox(vec2 p, vec2 a, vec2 b) {
    return p.x > a.x && p.x < b.x && p.y > a.y && p.y < b.y;
    //vec2 d = abs(p - (a + b)*0.5) - abs(a - b)*0.5;
    //return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

bool sdBBox(vec2 uv, ivec2 pp) {
    vec4 bb = texelFetch(CH_BVH_TREE, pp, 0);
    return sdBox(uv, bb.xy, bb.zw);
}

vec2 hash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
}

float dot2(vec2 r) {
    return dot(r, r);
}

vec3 raymarch(vec2 uv) {
    if (!sdBBox(uv, ivec2(0)))
        return vec3(0);

    vec3 rgb = vec3(0);
    vec2 rand = hash22(uv*iResolution.xy + iTime);
    int lookups = 0;
    ivec2 wh = textureSize(CH_3D_MESH, 0);
    ivec4[BVH_DEPTH] qt = qtInit(wh);
    ivec3[STACK_SIZE] deque; // deque size has a huge perf impact, but why?
    int head = 0, tail = 0;
    float fogmin = 1e-6;

    // TODO: The initial 4 bboxes can be precomputed in a separate texture.
    
    while (head <= tail) {
        if (lookups >= MAX_LOOKUPS)
            return vec3(0,1,0);

        for (int i = tail-head+1; i > 0; i--) {
            // DFS-style search allows a compact deque
            ivec3 ppd = deque[tail--];
            ivec2 pp = ppd.xy;
            int depth = ppd.z;

            for (int j = 0; j < 4; j++) {
                ivec2 pp2 = pp*2 + NB4[j];

                if (depth < BVH_DEPTH-1) {
                    if (tail+1 == STACK_SIZE) {
                        if (head == 0)
                            return vec3(1,0,0);
                        for (int k = head; k <= tail; k++)
                            deque[k - head] = deque[k];
                        tail -= head;
                        head = 0;
                    }
                    ivec4 bb = qt[depth+1];
                    if (pp2.x < bb.z && pp2.y < bb.w) {
                        lookups++;
                        if (sdBBox(uv, bb.xy + pp2.xy))
                            deque[++tail] = ivec3(pp2, depth+1);
                    }
                } else if (pp2.x < wh.x && pp2.y < wh.y) {
                    lookups += 2;
                    vec4 s1 = texelFetch(CH_3D_MESH, pp2, 0);
                    vec4 s2 = texelFetch(CH_3D_MESH, pp2 + ivec2(0,1), 0);
                    //vec4 s3 = texelFetch(CH_3D_MESH, (pp2 + ivec2(1,0)) % wh, 0);
                    //vec4 s4 = texelFetch(CH_3D_MESH, (pp2 + ivec2(1,1)) % wh, 0);
                    vec4 s = mix(s1, s2, rand.x);
                    //vec4 s = mix(mix(s1, s2, rand.x), mix(s3, s4, rand.x), rand.y);
                    float r2 = dot2((s.xy - uv)/s.w);

                    if (r2 < 1.0) {
                        float temp = exp(-r2*SIGMA*SIGMA);
                        float hue = 0.5 - 0.5*sin(float(pp2.y)/float(wh.y-1)*PI*2.0);
                        vec3 col = mix(vec3(1.0, 0.8, 0.2), vec3(0.8, 0.2, 1.0), hue);
                        if (INK_STYLE) col = 1.0 - col;
                        float fog = exp(0.2*s.z);
                        fogmin = max(fogmin, fog);
                        rgb += temp*col*fog;
                    }
                }
            }
        }
    }
    
    //return vec3(0.2,0.5,1)*float(lookups)/1e3;
    return rgb/fogmin;
}

void mainImage3(out vec4 o, in vec2 p) {
    vec2 r = iResolution.xy;
    vec2 p2 = p + hash22(p + iTime) - 0.5;
    
    if (iMouse.z > 0.)
        p2 = (p - iMouse.zw)*MOUSE_ZOOM + iMouse.zw;
    
    vec2 uv = p2/r; // 0..1
    uv = (uv - 0.5)*r/r.yy;
    uv *= texelFetch(CH_CONFIG, ivec2(ID_SCALE,0), 0).x;
    uv += texelFetch(CH_CONFIG, ivec2(ID_POSITION,0), 0).xy;
    
    vec4 cfg = texelFetch(CH_CONFIG, ivec2(ID_BRIGHTNESS,0), 0);
    o.rgb = raymarch(uv)*BRIGHTNESS*cfg.x;
    
    vec4 avg = texture(iChannel3, p/r);
    if (length(iMouse.xy - iMouse.zw) > 0. || iKeyPressed > 0)
        avg = vec4(0);
    o = mix(avg, o, 1./(1. + avg.a));
    o.a = min(avg.a + 1., float(MAX_SAMPLES));
}

/// CH_CONFIG /////////////////////////////////////////////////////////////////

bool isKeyPressed(int i) {
    return texelFetch(iKeyboard, ivec2(i,0), 0).x > 0.;
}

void mainImage4(out vec4 o, vec2 p) {
    o = texelFetch(CH_CONFIG, ivec2(p), 0);
    
    if (int(p.x) == ID_SCALE) {
        if (isKeyPressed(KEY_W))
            o.x /= 1.05;
        if (isKeyPressed(KEY_S))
            o.x *= 1.05;
        if (iFrame == 0)
            o.x = INIT_ZOOM;
    }

    if (int(p.x) == ID_ROTATION) {
        if (isKeyPressed(KEY_A))
            o.z -= PI*0.01;
        if (isKeyPressed(KEY_D))
            o.z += PI*0.01;
        if (isKeyPressed(KEY_Q))
            o.x -= PI*0.01;
        if (isKeyPressed(KEY_E))
            o.x += PI*0.01;
        if (iFrame == 0)
            o = vec4(0);
    }

    if (int(p.x) == ID_POSITION) {
        if (isKeyPressed(KEY_R))
            o.y += 0.01;
        if (isKeyPressed(KEY_F))
            o.y -= 0.01;
        if (iFrame == 0)
            o = vec4(0);
    }

    if (int(p.x) == ID_BRIGHTNESS) {
        if (isKeyPressed(KEY_T))
            o.x *= 1.1;
        if (isKeyPressed(KEY_G))
            o.x /= 1.1;
        if (iFrame == 0)
            o = vec4(1);
    }
}

float vignette(vec2 p) {
	vec2 uv = p/iResolution.xy;
    uv.xy *= 1. - uv.yx;
    float v = uv.x*uv.y*15.0;
    return pow(v, 0.125);
}

void setLogo(inout vec4 o, vec2 p, sampler2D iLogo, vec2 pos, mat2 whm) {
    vec2 wh = vec2(textureSize(iLogo, 0));
    p -= pos + wh*whm;
    p.y = wh.y - 1. - p.y; // iLogo is Y-flipped
    if (!sdBox(p, vec2(0), wh)) return;
    vec4 col = texture(iLogo, p/wh);
    o = mix(o, col, col.a);
}

void mainImage(out vec4 o, in vec2 p) {
  vec2 r = iResolution;
  switch (iChannelId) {
    case 1: mainImage1(o, p); return;
    case 2: mainImage2(o, p); return;
    case 3: mainImage3(o, p); return;
    case 4: mainImage4(o, p); return;
    case -1:
        o = texture(iChannel3, p/r);
        setLogo(o, p, iLogo, vec2(r.x, 0), mat2(-1, -1, 0, 1));
        setLogo(o, p, iLogoL, vec2(0), mat2(0, 0, 0, 0.5));
        if (INK_STYLE) o = exp(-o);
        if (!isKeyPressed(KEY_V)) o *= vignette(p);
        o.a = 1.0;
        return;
  }
}
