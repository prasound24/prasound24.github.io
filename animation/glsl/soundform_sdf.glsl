#define CH_3DMESH iChannel0 // (x,y,z) + radius
#define CH_QUADTREE iChannel2 // bbox

const float INF = 1e6, EPS = 1e-6;
const int MAX_LOOKUPS = 10000; // max lookups in the quad tree
const int MAX_HEAPSIZE = 31; // minheap size, must be power of 2 minus 1
const int BVH_DEPTH = 12; // quad-tree spans at most 4096x4096 points
const float R0 = 0.001;
const float CAMERA = -9.0;
const float SCREEN = -1.0; // when BBOX is rotated, it must fit under the screen
const float DENS = 1e3; // density
const float FOG = 0.5; // density
const float BRIGHTNESS = 1.0;
const mat2x4 BBOX = mat2x4(vec4(-1), vec4(+1));
const vec3 ERROR_RGB = vec3(1, 0, 0);
const vec3 GRAAL_RGB = vec3(7.4, 5.6, 4.4); // wavelengths
const vec3 BBOX_RGB = vec3(4.4, 5.6, 7.4); // wavelengths

const ivec2[] NB4 = ivec2[](
    ivec2(0,0), ivec2(0,1), ivec2(1,0), ivec2(1,1));

vec2 hash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xx+p3.yz)*p3.zy);
}

#define eq2(a,b) ((a).x == (b).x && (a).y == (b).y)
#define max_xy(v) max((v).x, (v).y)
#define min_xy(v) min((v).x, (v).y)

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

mat3 rotWorldMatrix(mat3 wm, vec2 m) {
    if (length(m) < 1.0/INF)
        return wm;

    mat2 mx = rot2(m.x);
    mat2 my = rot2(m.y);
    mat3 xy = mat3(0,1,0,1,0,0,0,0,1); // swap xy
    mat3 yz = mat3(1,0,0,0,0,1,0,1,0); // swap yz
    mat3 rx = yz*mat3(mx)*yz;
    mat3 ry = xy*yz*mat3(my)*yz*xy;

    return rx*ry*wm;
}

mat3 getWorldMatrix(vec2 iMouse, vec2 iResolution) {
    vec2 m = iMouse/iResolution - 0.5;
    mat3 wm = mat3(1);
    //wm = rotWorldMatrix(wm, -vec2(0,0)*PI*2.);
    wm = rotWorldMatrix(wm, -m*PI*2.);
    return wm;
}

float pack(vec2 a) {
    return uintBitsToFloat(packSnorm2x16(a));
}

vec2 unpack(float x) {
    return unpackSnorm2x16(floatBitsToUint(x));
}

vec4 packBBox(mat2x4 bb) {
    mat4x2 b = transpose(bb);
    return vec4(pack(b[0]), pack(b[1]), pack(b[2]), pack(b[3]));
}

mat2x4 unpackBBox(vec4 b) {
    mat4x2 bb = mat4x2(unpack(b.x), unpack(b.y), unpack(b.z), unpack(b.w));
    return transpose(bb);
}

/// CH_QUADTREE ////////////////////////////////////////////////////////////

// The mesh is made of tiny spheres.
// The idea is to define a density field
// as a (u,v) -> (x,y,z,w) function.

void mainImage00(out vec4 o, in vec2 p) {
    vec2 uv = p/iResolution.xy;
    float a = uv.y*2.*PI;
    
    o.xy = vec2(cos(a), sin(a));
    o.z = uv.x*2.0 - 1.0;
    
    // o.xyz must stay within BBOX
    o.xy *= 0.7 + 0.2*cos(a*3.0);
    o.xy *= 0.5 + 0.4*sin(o.z*PI);
    
    // BufferC needs ~10 frames to update the bounding boxes.
    // Thus the mesh can evolve, but only very slowly.
    //o.xyz += 0.05*(texture(CH_3DMESH, uv).rgb - 0.5);
    
    o.w = R0;
    //o.w *= 1.0 - pow(abs(o.z), 20.0);
    //o.w *= int(p.x)%40 < 1 || int(p.y)%80 < 1 ? 1.5 : 1.0;
}

void mainImage01(out vec4 o, in vec2 p) {
  o = texelFetch(iChannel1, ivec2(p), 0); // soundform.exr
  o.xyz /= 1.25 - o.w; // basic perspective projection from 4d to 3d
  //o.xy /= 1.25 - o.z;
  o.w = R0; // sphere radius

  float t = p.y; // time
  o *= pow(0.997, t);
  o.z *= pow(1.003, t*0.5);
  o.z += 0.4;
  //o.z = pow(p.y/iResolution.y, 2.0);
  o *= 0.5; // make it fit in BBOX

  //if (p.x > 8.0 || p.y > 8.0) o.w = 0.0; // DEBUG

  //o.xy *= 1.0 + 0.1*cos(p.y/iResolution.y*PI*6.0 + iTime);
}

/// CH_QUADTREE ////////////////////////////////////////////////////////////

// Updates the quad-tree of bounding boxes
// in about log2(width,height) steps. This
// works so long as points that are nearby
// in the CH_3DMESH mesh are also nearby
// in the 3d space.

mat2x4 bboxInit(ivec2 pp, ivec2 nn) {
    vec4 a = vec4(1), b = vec4(-1);
    
    for (int i = 0; i < 4; i++) {
        ivec2 pp2 = pp*2 + NB4[i];
        vec4 r = texelFetch(CH_3DMESH, pp2, 0);
        if (r.w <= 0.) continue;
        //r.w = dot(r.xyz, vec3(1))/3.0; // -1..1
        a = min(a, r - r.w);
        b = max(b, r + r.w);
    }
    
    return mat2x4(a,b);
}

mat2x4 bboxJoin(ivec2 pp, int d, ivec4[BVH_DEPTH] qt) {
    vec4 a = vec4(1), b = vec4(-1);
    
    for (int i = 0; i < 4; i++) {
         ivec2 pp2 = pp*2 + NB4[i];
         pp2 = qtLookup(pp2, d+1, qt);
         vec4 r = texelFetch(CH_QUADTREE, pp2, 0);
         mat2x4 bb = unpackBBox(r);
         vec4 b0 = bb[0], b1 = bb[1], d = b1 - b0;
         if (min(min(d.x, d.y), d.z) <= 0.)
            continue;
         a = min(a, b0);
         b = max(b, b1);
    }
    
    return mat2x4(a,b);
}

void mainImage2( out vec4 o, in vec2 p ) {
    ivec2 nn = textureSize(CH_3DMESH, 0);
    ivec2 pp = ivec2(p);
    ivec4[BVH_DEPTH] qt = qtInit(ivec2(iResolution));
    int d = BVH_DEPTH - 1 - iFrame % BVH_DEPTH;
    ivec2 qq = qtReverse(pp, d, qt);
    
    o = texelFetch(CH_QUADTREE, pp, 0);
    if (qq.x < 0) return;
    
    mat2x4 bb = d < BVH_DEPTH-1 ?
        bboxJoin(qq, d, qt) :
        bboxInit(qq, nn);
    
    // correct the loss of precision:
    // https://docs.gl/el3/packUnorm
    const float eps = 1./65536.;
    bb[0] -= eps;
    bb[1] += eps;
    o = packBBox(bb);
}

/// Image ////////////////////////////////////////////////////////

float sdSphere(vec3 ro, vec3 ce, float r) {
    return max(length(ro - ce) - r, 0.);
}

float dot2(vec3 v) {
    return dot(v, v);
}

float min8(float x1, float x2, float x3, float x4, float x5, float x6, float x7, float x8) {
    return min(min(min(x1,x2),min(x3,x4)),min(min(x5,x6),min(x7,x8)));
} 

vec2 sdBox(vec3 ro, vec3 aa, vec3 bb) {
    vec3 p = ro - (aa + bb)*0.5;
    vec3 b = abs(aa - bb)*0.5;
    vec3 q = abs(p) - b;
    float near = length(max(q,0.)) + min(max(q.x,max(q.y,q.z)),0.);

    vec3 u = aa - ro, v = bb - ro;
    float len2 = min8(
        dot2(vec3(u.x, u.y, u.z)),
        dot2(vec3(u.x, u.y, v.z)),
        dot2(vec3(u.x, v.y, u.z)),
        dot2(vec3(u.x, v.y, v.z)),
        dot2(vec3(v.x, u.y, u.z)),
        dot2(vec3(v.x, u.y, v.z)),
        dot2(vec3(v.x, v.y, u.z)),
        dot2(vec3(v.x, v.y, v.z)));
    float far = sqrt(len2);

    return vec2(max(near, 0.), far);
}

vec2 sdBBox(vec3 ro, ivec2 pp) {
    mat2x4 bbox = unpackBBox(texelFetch(CH_QUADTREE, pp, 0));
    vec4 a = bbox[0], b = bbox[1];
    if (!all(lessThan(a,b)))
        return vec2(INF);
    return sdBox(ro, a.xyz, b.xyz);
}

struct BBoxEntry { float near; float far; ivec2 ij; int depth; };

float sdForm(vec3 iro, float dmin, float dmax, inout int lookups) {
    vec2 topmost = sdBBox(iro, ivec2(0));
    lookups++;

    if (topmost.x >= dmax) return topmost.x; // too far
    if (topmost.y <= dmin) return topmost.y; // too close

    ivec2 nn = textureSize(CH_QUADTREE, 0);
    ivec4[BVH_DEPTH] qt = qtInit(nn); // TODO: qt[0..k] are the same 1x1 topmost bbox
    BBoxEntry[1 + MAX_HEAPSIZE] heap; // min heap for dist.y, heap[1] is the root
    heap[0] = BBoxEntry(INF,INF,ivec2(0),0); // stub
    heap[1] = BBoxEntry(topmost.x, topmost.y, ivec2(0), 0);
    int heapsize = 1;
    
    while (lookups < MAX_LOOKUPS && heapsize > 0 && dmax > dmin) {
        int ii = heapsize; // the nearest bbox
        for (int i = heapsize - 1; i > 0; i--)
            if (heap[i].far < dmax)
                dmax = heap[i].far, ii = i;

        // remove the nearest bbox
        BBoxEntry nearest = heap[ii];
        heap[ii] = heap[heapsize];
        heap[heapsize--] = heap[0];

        for (int j = 0; j < 4; j++) {
            int depth = nearest.depth + 1;
            ivec2 pp = nearest.ij*2 + NB4[j];

            if (depth >= BVH_DEPTH) {
                if (pp.x < nn.x && pp.y < nn.y) {
                    lookups++;
                    vec4 ball = texelFetch(CH_3DMESH, pp, 0);
                    if (ball.w > 0.)
                        dmax = min(dmax, sdSphere(iro, ball.xyz, ball.w));
                }
            } else {
                lookups++;
                ivec2 qq = qtLookup(pp, depth, qt);
                vec2 sd = sdBBox(iro, qq);
                if (sd.x <= dmax) {
                    if (heapsize >= MAX_HEAPSIZE) return -INF;
                    heap[++heapsize] = BBoxEntry(sd.x, sd.y, pp, depth);
                }
            }
        }

        // remove bboxes that are too far
        for (int i = 1; i <= heapsize; i++) {
            if (heap[i].near > dmax) {
                int j = heapsize;
                BBoxEntry tmp = heap[i];
                heap[i] = heap[j];
                heap[j] = tmp;
                heapsize--;
            }
        }
    }

    return dmax;
}

vec3 flameRGB(float temp, vec3 L) {
    float T = 1400. + 1300.*temp; // temperature in kelvins
    vec3 W = pow(L, vec3(5))*(exp(1.43e5/T/L) - 1.);
    return 1. - exp(-5e8/W);
}

vec3 raymarch(mat3 wm, vec3 ro, vec3 rd, inout float t) {
    mat3 iwm = inverse(wm);
    int lookups = 0;
    float dmin = INF, step = 0.0001;

    for (int i = 0; i < 25; i++) {
        float d = sdForm(iwm*(ro + rd*t), step, 0.05, lookups);
        if (lookups >= MAX_LOOKUPS) return vec3(0.5,0,0);
        if (d == INF) return vec3(0,0.5,0);
        if (d == -INF) return vec3(0,0,0.5);
        t += d + step;
        dmin = min(dmin, d);
        if (dmin < step) break;
    }

    return vec3(4,2,1)*smoothstep(step*1.5, 0., dmin);
    //return vec3(4,2,1)*exp(-pow(dmin/step,2.)*0.3);
}

void mainImage3(out vec4 o, in vec2 p) {
    vec2 r = iResolution.xy;
    vec2 rand = hash22(p + iTime); // 0..1
    vec2 uv = (p + rand - 0.5)/r; // 0..1
    
    vec4 campos = vec4(0);
    vec4 camrot = vec4(0);
    vec3 ro = vec3(0,0,CAMERA) + campos.xyz;
    vec3 rd = normalize(vec3((uv - 0.5)*r/r.yy, SCREEN - CAMERA));
    //rd.zy = rot2(-camrot.x*PI*2.0)*rd.zy;
    //rd.xz = rot2(-camrot.y*PI*2.0)*rd.xz;
    ro.z += 6.0;
    
    mat3 wm = getWorldMatrix(iMouse.xy, r);

    //o = texelFetch(iChannel3, ivec2(p), 0);
    //if (iFrame < 4) o = vec4(0);
    o = vec4(0);
    o.rgb = raymarch(wm, ro, rd, o.a);
}

void mainImage(out vec4 o, in vec2 p) {
  o = vec4(0);
  switch (iChannelId) {
    case 0: mainImage01(o, p); return;
    case 2: mainImage2(o, p); return;
    case 3: mainImage3(o, p); return;
    case -1: o = BRIGHTNESS*texture(iChannel3, p/iResolution.xy); o.a = 1.0; return;
  }
}
