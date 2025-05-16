const float INF = 1e6;
const float SQ3 = sqrt(3.0);
const int NN = 8; // max intersections per pixel, 3..64
const int MM = 1024; // max lookups in the quad tree
const int DQN = 32; // deque (stack) size
const int QTN = 16; // quad-tree spans at most 4096x4096 points
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
ivec4[QTN] qtInit(ivec2 iResolution) {
    ivec2 r = iResolution;
    ivec4[QTN] qt;
    
    for (int d = QTN-1; d >= 0; d--)
        qt[d].zw = r = (r+1)/2;
        
    ivec2 box = ivec2(0);
    
    for (int i = 0; i < QTN; i++) {
        qt[i].xy = box*(i%2 == 0 ? ivec2(1,0) : ivec2(0,1));
        box = max(box, qt[i].xy + qt[i].zw);
    }
    
    return qt;
}

ivec2 qtLookup(ivec2 p, int d, ivec4[QTN] qt) {
    ivec4 r = qt[d];
    p = min(p, r.zw-1);
    return r.xy + p;
}

ivec2 qtReverse(ivec2 p, int d, ivec4[QTN] qt) {
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

/// Buffer A

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
    //o.xyz += 0.05*(texture(iChannel0, uv).rgb - 0.5);
    
    o.w = R0;
    //o.w *= 1.0 - pow(abs(o.z), 20.0);
    //o.w *= int(p.x)%40 < 1 || int(p.y)%80 < 1 ? 1.5 : 1.0;
}

void mainImage01(out vec4 o, in vec2 p) {
  o = texelFetch(iChannel1, ivec2(p), 0);
  o.xyz /= 1.25 - o.w; // basic perspective projection from 4d to 3d
  //o.xy /= 1.25 - o.z;
  o.w = R0; // sphere radius

  float t = p.y; // time
  o *= pow(0.997, t);
  o.z *= pow(1.003, t*0.5);
  o.z += 0.4;
  //o.z = pow(p.y/iResolution.y, 2.0);
  o *= 0.5; // make it fit in BBOX

  //o.xy *= 1.0 + 0.1*cos(p.y/iResolution.y*PI*6.0 + iTime);
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

mat2x4 bboxInit(ivec2 pp, ivec2 nn) {
    vec4 a = vec4(1), b = vec4(-1);
    
    for (int i = 0; i < 4; i++) {
        ivec2 pp2 = pp*2 + NB4[i];
        vec4 r = texelFetch(iChannel0, pp2, 0);
        //r.w = dot(r.xyz, vec3(1))/3.0; // -1..1
        a = min(a, r - r.w);
        b = max(b, r + r.w);
    }
    
    return mat2x4(a,b);
}

mat2x4 bboxJoin(ivec2 pp, int d, ivec4[QTN] qt) {
    vec4 a = vec4(1), b = vec4(-1);
    
    for (int i = 0; i < 4; i++) {
         ivec2 pp2 = pp*2 + NB4[i];
         pp2 = qtLookup(pp2, d+1, qt);
         vec4 r = texelFetch(iChannel2, pp2, 0);
         mat2x4 bb = unpackBBox(r);
         a = min(a, bb[0]);
         b = max(b, bb[1]);
    }
    
    return mat2x4(a,b);
}

void mainImage2( out vec4 o, in vec2 p ) {
    ivec2 nn = textureSize(iChannel0, 0);
    ivec2 pp = ivec2(p);
    ivec4[QTN] qt = qtInit(ivec2(iResolution));
    int d = QTN - 1 - iFrame % QTN;
    ivec2 qq = qtReverse(pp, d, qt);
    
    o = texelFetch(iChannel2, pp, 0);
    if (qq.x < 0) return;
    
    mat2x4 bb = d < QTN-1 ?
        bboxJoin(qq, d, qt) :
        bboxInit(qq, nn);
    
    // correct the loss of precision:
    // https://docs.gl/el3/packUnorm
    float eps = 1./65536.;
    bb[0] -= eps;
    bb[1] += eps;
    o = packBBox(bb);
}

/// Image ////////////////////////////////////////////////////////
//
// iChannel0 = Buffer A
// iChannel2 = Buffer C

bool raySphere(vec3 ro, vec3 rd, vec3 ce, float ra, out vec2 tt) {
    vec3 oc = ro - ce;
    float b = dot( oc, rd );
    vec3 qc = oc - b*rd;
    float h = ra*ra - dot( qc, qc );
    float h2 = sqrt(max(h, 0.));
    tt = vec2(-b-h2, -b+h2);
    tt = max(tt, 0.);
    return tt.y > tt.x;
}

bool rayBox(vec3 ro, vec3 rd, vec3 aa, vec3 bb, out vec2 tt) {
    vec3 ird = 1./rd;
    vec3 tbot = ird*(aa - ro);
    vec3 ttop = ird*(bb - ro);
    vec3 tmin = min(ttop, tbot);
    vec3 tmax = max(ttop, tbot);
    vec2 tx = max(tmin.xx, tmin.yz);
    vec2 ty = min(tmax.xx, tmax.yz);
    tt.x = max(tx.x, tx.y);
    tt.y = min(ty.x, ty.y);
    tt = max(tt, 0.);
    return tt.y > tt.x;
}

bool rayCube(vec3 ro, vec3 rd, vec3 cc, float r, out vec2 tt) {
    return r > 0.0 && rayBox(ro, rd, cc-r, cc+r, tt);
}

bool rayBBox(sampler2D iChannel2, vec3 ro, vec3 rd, ivec2 pp, float r0, out vec2 tt) {
    mat2x4 bbox = unpackBBox(texelFetch(iChannel2, pp, 0));
    vec4 a = bbox[0], b = bbox[1];
    vec2 tt2;
    return all(lessThan(a,b))
        && rayBox(ro, rd, a.xyz - r0, b.xyz + r0, tt);
}

// Finds spheres relevant to this pixel.
int findPoints(sampler2D iChannel0, sampler2D iChannel2,
    mat3 wm, vec3 ro, vec3 rd, out vec4[NN] pts) {
    
    mat3 iwm = inverse(wm);
    vec3 iro = iwm*ro, ird = iwm*rd;
    int len = 0, lookups = 0;
    ivec2 nn = textureSize(iChannel2, 0);
    vec2 tt;
    float tmax = INF;
    
    ivec4[QTN] qt = qtInit(nn);
    ivec3[DQN] deque; // deque size has a huge perf impact, but why?
    int head = 0, tail = 0;
    deque[0] = ivec3(0);
    
    vec2 tr = vec2(0,INF); // vec2(fract(iTime), fract(iTime)+0.02); // min..max
    
    for (int i = 0; i < MM; i++) {
        if (head > tail) break;
        
        for (int i = tail-head+1; i > 0; i--) {
            // DFS-style search allows a compact deque
            ivec3 ppd = deque[tail--];
            ivec2 pp = ppd.xy;
            int d = ppd.z;

            if (lookups++ > MM)
                return len;
            ivec2 qq = qtLookup(pp, d, qt); 
            if (!rayBBox(iChannel2, iro, ird, qq, 0., tt))
                continue;
            if (len == NN && tt.x > tmax)
                continue;
            if (tt.x > tr.y || tt.y < tr.x)
                continue;

            for (int j = 0; j < 4; j++) {
                ivec2 pp2 = pp*2 + NB4[j];

                if (d < QTN-1) {
                    if (tail+1 == DQN) {
                        if (head == 0)
                            return len;
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
                
                if (lookups++ > MM)
                    return len;
                if (pp2.x >= nn.x || pp2.y >= nn.y)
                    continue;
                    
                vec4 r = texelFetch(iChannel0, pp2, 0);
                if (r.w < 1e-6) continue; // transparent
                
                //if (!rayCube(iro, ird, r.xyz, R0, tt)) // fast
                if (!raySphere(ro, rd, wm*r.xyz, r.w, tt)) // accurate
                    continue;
                    
                if (tt.x > tr.y || tt.y < tr.x)
                    continue;
                    
                if (len < NN) {
                    pts[len++] = vec4(tt, 0, r.w);
                    tmax = max(tmax, tt.x);
                    continue;
                }
                
                // If there isn't enough room, try to evict someone.
                int m = 0;
                if (tt.x > tmax) return len;
                while (m < NN && pts[m].x < tt.x) m++;
                if (m == NN) return len;
                pts[m] = vec4(tt, 0, r.w);
            }
        }
    }
    
    return len;
}

vec3 flameRGB(float temp, vec3 L) {
    float T = 1400. + 1300.*temp; // temperature in kelvins
    vec3 W = pow(L, vec3(5))*(exp(1.43e5/T/L) - 1.);
    return 1. - exp(-5e8/W);
}

vec4 raymarch(sampler2D iChannel0, sampler2D iChannel2,
    mat3 wm, vec3 ro, vec3 rd) {
    
    mat3 iwm = inverse(wm);
    vec2 tt;
    if (!rayBBox(iChannel2, iwm*ro, iwm*rd, ivec2(0), 0., tt))
        return vec4(0);
        
    ro += rd*tt.x;
    vec2 tt0 = tt - tt.x;
       
    vec4[NN] pts;
    int len = findPoints(iChannel0, iChannel2, wm, ro, rd, pts);
    if (len < 0) return vec4(-1);
    if (len == 0) return vec4(0);
    
    vec2[NN*2] tts;
    
    for (int i = 0; i < len; i++) {
        vec4 r = pts[i];
        tts[i*2+0] = vec2(r.x, +DENS); // entry
        tts[i*2+1] = vec2(r.y, -DENS); // exit
    }
    
    // sort entry/exit points: closest first
    for (int i = 0; i < len*2; i++) {
        for (int j = i+1; j < len*2; j++) {
            if (tts[i].x <= tts[j].x)
                continue;
            vec2 tmp = tts[i];
            tts[i] = tts[j];
            tts[j] = tmp;
        }
    }
    
    vec4 sum = vec4(0);
    float dens = tts[0].y; // aggregate density of overlapping spheres
    
    for (int i = 1; i < len*2; i++) {
        float dist = tts[i].x - tts[i-1].x;

        if (dist > 0.) {
            // Each sphere is assumed to have a const density.
            vec4 col = vec4(1,0,0,dens);
            
            if (dist > 0. && col.w > 0.) {
                col.w = 1.0 - exp2(-dist*col.w);
                col.rgb *= col.w;
                sum += col*(1.0 - sum.w);
            }
            
            if (sum.w > 0.995) break;
        }
        
        dens += tts[i].y;
    }
    
    return sum;
}

void mainImage3(out vec4 o, in vec2 p) {
    o = vec4(0,0,0,1);
    vec2 r = iResolution.xy;
    vec2 rand = hash22(p + iTime); // 0..1
    vec2 uv = (p + rand - 0.5)/r; // 0..1
    
    vec4 campos = vec4(0); // texelFetch(iChannel1, ivec2(0,0), 0);
    vec4 camrot = vec4(0); // texelFetch(iChannel1, ivec2(1,0), 0);
    vec3 ro = vec3(0,0,CAMERA) + campos.xyz;
    vec3 rd = normalize(vec3((uv - 0.5)*r/r.yy, SCREEN - CAMERA));
    //rd.zy = rot2(-camrot.x*PI*2.0)*rd.zy;
    //rd.xz = rot2(-camrot.y*PI*2.0)*rd.xz;
    ro.z += 6.0;
    
    mat3 wm = getWorldMatrix(iMouse.xy, r);
    vec4 rr = raymarch(iChannel0, iChannel2, wm, ro, rd);
    
    if (rr.w < 0.)
        o.rgb = ERROR_RGB;
    if (rr.w > 0.)
        o.rgb = flameRGB(rr.x, GRAAL_RGB);
    
    vec4 sum = texture(iChannel3, p/r);
    if (iMouse.z > 0.) sum.a = 0.;
    o = mix(sum, o, 1./(1. + sum.a)); // average a few randomized frames 
    o.a = min(sum.a + 1., 50.); // the number of frames rendered
    //o.a = 0.; // debug
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
