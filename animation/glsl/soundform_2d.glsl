const float INF = 1e6;
const int MAX_LOOKUPS = 4096; // max lookups in the quad tree
const int STACK_SIZE = 32; // deque (stack) size
const int BVH_DEPTH = 16; // quad-tree spans at most 4096x4096 points
const float R0 = 0.003;
const float SEGLEN = R0*0.05;
const float SIGMA = 3.5; // gaussian
const float MOUSE_ZOOM = 0.05;
const float INIT_ZOOM = 0.5;
const float BRIGHTNESS = 1e-5/R0/R0; // gaussians
const int MAX_SAMPLES = 10;

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
        qt[i].xy = box*(i%2 == 0 ? ivec2(1,0) : ivec2(0,1));
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

/// Buffer A

void mainImage0(out vec4 o, in vec2 p) {
    o = texelFetch(iChannel1, ivec2(p), 0);
    o.w = R0; // sphere radius
    o /= 1.25 - o.w; // basic perspective projection
    o /= 1.25 - o.z;
    o *= pow(0.997, p.y); // time
    o.z = p.y/iResolution.y; // o.z is now unused
}

/// Buffer C /////////////////////////////////////////////////////////////////////
//
// iChannel0 = Buffer A
// iChannel2 = Buffer C

// Updates the quad-tree of bounding boxes
// in about log2(width,height) steps. This
// works so long as points that are nearby
// in the iChannel0 mesh are also nearby
// in the 3d space.

vec4 bboxInit(ivec2 pp) {
    vec4 b = vec4(1,1,-1,-1)*INF;
    ivec2 wh = textureSize(iChannel0, 0);
    
    for (int i = 0; i < 4; i++) {
        ivec2 pp2 = pp*2 + NB4[i];
        for (int j = 0; j < 2; j++) {
            vec4 r = texelFetch(iChannel0, min(pp2 + ivec2(0,j), wh-1), 0);
            if (r.w <= 0.) continue;
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
         vec4 r = texelFetch(iChannel2, pp2, 0);
         b.xy = min(b.xy, r.xy);
         b.zw = max(b.zw, r.zw);
    }
    
    b.zw = max(b.zw, b.xy);
    return b;
}

void mainImage2( out vec4 o, in vec2 p ) {
    ivec2 pp = ivec2(p);
    ivec4[BVH_DEPTH] qt = qtInit(ivec2(iResolution));
    int d = BVH_DEPTH - 1 - iFrame % BVH_DEPTH;
    ivec2 qq = qtReverse(pp, d, qt);
    
    o = texelFetch(iChannel2, pp, 0);
    if (qq.x < 0) return;
    
    o = d < BVH_DEPTH-1 ?
        bboxJoin(qq, d, qt) :
        bboxInit(qq);
}

/// Image ////////////////////////////////////////////////////////

float sdBox( in vec2 p, vec2 a, vec2 b ) {
    vec2 d = abs(p - (a + b)*0.5) - abs(a - b)*0.5;
    return length(max(d, 0.)) + min(max(d.x, d.y), 0.);
}

float sdBBox(vec2 uv, ivec2 pp) {
    vec4 bb = texelFetch(iChannel2, pp, 0);
    return sdBox(uv, bb.xy, bb.zw);
}

vec3 raymarch(vec2 uv) {
    vec3 rgb = vec3(0);
    int lookups = 0;
    ivec2 wh = textureSize(iChannel0, 0);
    ivec4[BVH_DEPTH] qt = qtInit(wh);
    ivec3[STACK_SIZE] deque; // deque size has a huge perf impact, but why?
    int head = 0, tail = 0;
    deque[0] = ivec3(0);
    
    while (head <= tail) {
        if (lookups >= MAX_LOOKUPS)
            return vec3(0,1,0);

        for (int i = tail-head+1; i > 0; i--) {
            // DFS-style search allows a compact deque
            ivec3 ppd = deque[tail--];
            ivec2 pp = ppd.xy;
            int d = ppd.z;

            lookups++;
            ivec2 qq = qtLookup(pp, d, qt); 
            if (sdBBox(uv, qq) >= 0.)
                continue;

            for (int j = 0; j < 4; j++) {
                ivec2 pp2 = pp*2 + NB4[j];

                if (d < BVH_DEPTH-1) {
                    if (tail+1 == STACK_SIZE) {
                        if (head == 0)
                            return vec3(1,0,0);
                        for (int k = head; k <= tail; k++)
                            deque[k - head] = deque[k];
                        tail -= head;
                        head = 0;
                    }

                    ivec4 r = qt[d+1];
                    if (pp2.x < r.z && pp2.y < r.w)
                        deque[++tail] = ivec3(pp2, d+1);
                    continue;
                }
                
                if (pp2.x >= wh.x || pp2.y >= wh.y)
                    continue;

                lookups += 2;
                vec4 s1 = texelFetch(iChannel0, pp2, 0);
                vec4 s2 = texelFetch(iChannel0, min(pp2 + ivec2(0,1), wh-1), 0);
                int n = int(ceil(length(s1.xy - s2.xy)/SEGLEN));

                for (int i = 0; i < n; i++) {
                    vec4 s = mix(s1, s2, float(i)/float(n));
                    float r = length(s.xy - uv);
                    if (r > s.w) continue;
                    float ds = r/s.w*SIGMA;
                    float temp = exp(-ds*ds)/float(n);
                    rgb += temp*mix(vec3(1,0.5,0.2), vec3(0.5,0.2,1), 
                        0.5+0.5*sin(1.5*s.z*PI*2.0));
                }
            }
        }
    }
    
    return rgb;
}

vec2 hash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
}

void mainImage3(out vec4 o, in vec2 p) {
    vec2 r = iResolution.xy;
    vec2 p2 = p + hash22(p + iTime) - 0.5;
    
    if (iMouse.z > 0.)
        p2 = (p - iMouse.xy)*MOUSE_ZOOM + iMouse.xy;
    
    vec2 uv = p2/r; // 0..1
    uv = (uv - 0.5)*r/r.yy;
    uv *= INIT_ZOOM; // DEBUG
    
    o.rgb = raymarch(uv);
    o *= BRIGHTNESS;
    o.a = 1.0;
    
    vec4 avg = texture(iChannel3, p/r);
    if (iMouse.z > 0.) avg.a = 0.;
    o = mix(avg, o, 1./(1. + avg.a)); // average a few randomized frames 
    o.a = min(avg.a + 1., float(MAX_SAMPLES)); // the number of frames rendered
}

void mainImage(out vec4 o, in vec2 p) {
  o = vec4(0);
  switch (iChannelId) {
    case 0: mainImage0(o, p); return;
    case 2: mainImage2(o, p); return;
    case 3: mainImage3(o, p); return;
    case -1: o = texelFetch(iChannel3, ivec2(p), 0); return;
  }
}
