#define CH_STRING iChannel0
#define CH_GROUPS iChannel1
#define CH_FLOW iChannel2

const float INF = 1e6;

// Simulation consts
const int N = 256;
const int GS = int(sqrt(float(N))); // group size
const int NG = (N + GS - 1) / GS; // number of groups
const float MASS = 25.0;
const float ZOOM = 1.0;
const int NBOX = 32;

// Rendering consts
const vec3 RGB_OUTFLOW = 0.3 * vec3(0.1, 0.4, 1.5);
const vec3 RGB_INFLOW = vec3(1.5, 0.4, 0.1);
const vec3 RGB_GLOW = vec3(0.5, 0.2, 1.5);
const float R0 = 0.005;
const float R2 = 0.0025;

vec2 iexp(float phi) {
    return vec2(cos(phi), sin(phi));
}

mat2 rot2(float phi) {
    float c = cos(phi), s = sin(phi);
    return mat2(c, s, -s, c);
}

float sound(int i) {
    if(i < 0 || i >= iSoundLen)
        return 0.;
    ivec2 s = textureSize(iChannelSound, 0);
    int y = i / s.x, x = i % s.x;
    return texelFetch(iChannelSound, ivec2(x, y), 0).x;
}

vec4 initPos(ivec2 pp) {
    float phi = 2. * PI * (0.5 + float(pp.x)) / float(N);

    float x = sin(phi * 1.0);
    float y = cos(phi * 1.0);

    float z = 1.0 * sin(phi * 3.0) - 0.3;
    float w = 0.3 * cos(phi * 3.0);

    vec3 xyz = vec3(vec2(x, y) * cos(z), sin(z));
    vec4 xyzw = vec4(xyz * cos(w), sin(w));

    return normalize(xyzw);
}

vec4 texString(ivec2 p) {
    //p = ivec2(mod(vec2(p), vec2(ivec2(N, 2))));
    p.x = int(mod(float(p.x), float(N)));
    return texelFetch(CH_STRING, p, 0);
}

void updateString(out vec4 o, in vec2 p) {
    ivec2 pp = ivec2(p);

    if(pp.x >= N)
        discard;

    if(iFrame == 0) {
        o = initPos(pp);
        o = normalize(o);
        return;
    }

    const ivec2 dx = ivec2(1, 0);
    const ivec2 dt = ivec2(0, 1);

    if(pp.y > 0) {
        o = texString(pp - dt); // u[t - 1] <- u[t]
        return;
    }

    // https://web.media.mit.edu/~crtaylor/calculator.html
    //const float fdx[3] = float[](1., -2., 1.);
    //const float fdt[3] = float[](1., -2., 1.);
    //const float fdx[5] = float[](-1. / 12., 16. / 12., -30. / 12., 16. / 12., -1. / 12.);
    //const float fdt[5] = float[](11. / 12., -20. / 12., 6. / 12., 4. / 12., -1. / 12.);
    //vec4 sum = vec4(0);
    //for(int i = 1; i < fdt.length(); i++) sum += fdt[i] * texString(pp + dt * (i - 1));
    //vec4 T = vec4(0);
    //for(int i = 0; i < fdx.length(); i++) T += fdx[i] * texString(pp + dx * (i - fdx.length() / 2)); // Hooke's law

    // All four are in one plane tangent to the unit sphere at c.
    vec4 c = texString(pp); // length(cc) = 1
    vec4 l = texString(pp - dx), ll = l / dot(l, c);
    vec4 r = texString(pp + dx), rr = r / dot(r, c);
    vec4 d = texString(pp + dt), dd = d / dot(d, c);

    vec4 ds = ((ll - c) + (rr - c)) / MASS - (dd - c);
    //vec4 ds = (-sum + T / MASS) / fdt[0] - cc;
    // ds -= c * dot(c, ds); // make it tangent to the unit sphere
    o = normalize(c + ds); // F=ma
}

vec2 p2q(vec2 p) {
    vec2 r = iResolution.xy;
    vec2 a = r.x > r.y ? r.yy : r.xx;
    return (p * 2. - r) / a;
}

vec2 q2p(vec2 q) {
    vec2 r = iResolution.xy;
    vec2 a = r.x > r.y ? r.yy : r.xx;
    return 0.5 * (q * a + r);
}

vec2 pos(int i) {
    vec4 r = texString(ivec2(i, 0));
    if(iMouse.z > 0.) {
        vec2 m = p2q(iMouse.xy);
        //r.yw *= rot2(PI * m.y);
        r.xz *= rot2(PI * m.x);
    }
    // basic perspective projection
    r.xyz /= 1.25 - r.w;
    r.xy /= 1.25 - r.z;
    return r.xy * ZOOM;
}

vec3 dist2flow(float d) {
    float flow = exp(-pow(d / R2, 2.));
    float glow = pow(R0 / d, 1.5) * exp(-pow(0.2 * d / R0, 2.));
    return vec3(flow, flow, glow);
}

float estMaxDist() {
    float d1 = 0.0001, d2 = 0.1;

    for(int i = 0; i < 10; i++) {
        float d = mix(d1, d2, 0.5);
        vec3 e = dist2flow(d);
        if(max(e.y, e.z) > 1e-6)
            d1 = d;
        else
            d2 = d;
    }

    return d2;
}

bool boxIntersect0(vec4 a, vec4 b) {
    vec4 ab = vec4(min(a.xy, b.xy), max(a.zw, b.zw));
    vec2 d = (ab.zw - ab.xy) - (a.zw - a.xy) - (b.zw - b.xy);
    return max(d.x, d.y) < 0.;
}

bool boxIntersect(vec4 a, int i) {
    vec4 b = texelFetch(CH_GROUPS, ivec2(i, 0), 0);
    return boxIntersect0(a, b);
}

ivec4 findImpactRange(vec4 box) {
    float dmax = estMaxDist(); // as good as INF
    box.xy -= dmax;
    box.zw += dmax;

    if(!boxIntersect(box, 0))
        return ivec4(0);

    ivec4 rr = ivec4(N, 0, N, 0);

    for(int j = 1; j <= NG; j++) {
        if(!boxIntersect(box, j))
            continue;

        int imin = j * GS + 1;
        int imax = j * GS + GS;
        vec2 l = pos(imin - 1), r;

        for(int i = imin; i <= imax + 2; i++) {
            vec2 r = pos(i);
            vec4 lr = vec4(min(l.xy, r.xy), max(l.xy, r.xy));
            if (boxIntersect0(box, lr)) {
                if (i < N/2)
                    rr.x = min(rr.x, i), rr.y = max(rr.y, i+1);
                else 
                    rr.z = min(rr.z, i), rr.w = max(rr.w, i+1);
            }
            l = r;
        }
    }

    return rr;
}

void updateGroups(out vec4 o, vec2 p) {
    if(p.y < 1.0) {
        if (int(p.x) > NG)
            discard;

        o.xy = +vec2(INF); // box min
        o.zw = -vec2(INF); // box max

        if(int(p.x) == 0) {
            for(int i = 1; i <= NG; i++) {
                vec4 b = texelFetch(CH_GROUPS, ivec2(i, 0), 0);
                o.xy = min(o.xy, b.xy);
                o.zw = max(o.zw, b.zw);
            }
        } else {
            for(int i = 1; i <= GS + 1; i++) {
                vec2 a = pos(int(p.x) * GS + i);
                o.xy = min(o.xy, a);
                o.zw = max(o.zw, a);
            }
        }
        return;
    }

    if(p.y > 1.0 && iPass == 2) {
        vec2 b1 = (p - vec2(0, 1)) * float(NBOX);
        vec2 b2 = (p + vec2(1, 0)) * float(NBOX);
        if(b1.x > iResolution.x || b1.y > iResolution.y)
            discard;
        vec4 box = vec4(p2q(b1), p2q(b2));
        o = vec4(findImpactRange(box));
        return;
    }
}

float sdLine(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

vec2 midpoint(vec2 ll, vec2 l, vec2 r, vec2 rr) {
    return (l + r) * 0.5 + (l - ll) * 0.125 + (r - rr) * 0.125;
}

float sdBox0(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdBox(vec2 p, vec2 a, vec2 b) {
    return sdBox0(p - (a + b) * 0.5, abs(a - b) * 0.5);
}

float sdGroup(vec2 q, int i) {
    vec4 ab = texelFetch(CH_GROUPS, ivec2(i, 0), 0);
    return max(sdBox(q, ab.xy, ab.zw), 0.);
}

void sdf0(vec2 q, int imin, int imax, inout float d, inout int lookups) {
    if (imax <= imin)
        return;

    lookups += 3;
    vec2 ll = pos(imin - 1), l = pos(imin), r = pos(imin + 1);

    for(int i = imin; i <= imax; i++) {
        lookups++;
        vec2 rr = pos(i + 2);
        vec2 m = midpoint(ll, l, r, rr);
        d = min(d, sdLine(q, l, m));
        d = min(d, sdLine(q, r, m));
        ll = l, l = r, r = rr;
    }
} 

vec4 sdf(vec2 q) {
    int lookups = 0;
    float d = estMaxDist(); // as good as INF

    /* lookups++;
    ivec4 ir = ivec4(texelFetch(CH_GROUPS, ivec2(q2p(q))/NBOX + ivec2(0,1), 0));
    if (max(ir.y - ir.x, 0) + max(ir.w - ir.z, 0) < 1)
        return vec4(0,0,0,lookups);

    sdf0(q, ir.x, ir.y - 1, d, lookups);
    sdf0(q, ir.z, ir.w - 1, d, lookups); */

    lookups++;
    if(sdGroup(q, 0) > d)
        return vec4(0, 0, 0, lookups);

    for(int j = 1; j <= NG; j++) {
        lookups++;
        if(sdGroup(q, j) > d)
            continue;

        int imin = j * GS + 1;
        int imax = j * GS + GS;
        sdf0(q, imin, imax, d, lookups);
    }

    return vec4(dist2flow(d), float(lookups));
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);

}

vec2 fbm22(vec2 p, int n) {
    vec2 sum = vec2(0);
    for(int i = 0; i < n; i++) {
        float s = float(2 << i);
        sum += hash22(p * s) / s;
    }
    return sum;
}

vec2 xy2ra(vec2 p) {
    return vec2(length(p), atan(p.y, p.x));
}

vec4 texFlow(vec2 p) {
    return p.y > 0.0 && p.y < 1.0 - 1.0 / iResolution.y ? texture(CH_FLOW, p) : vec4(0);
}

void updateFlow(out vec4 o, vec2 p) {
    vec2 uv = p / iResolution;
    vec2 ra = uv.yx * vec2(2.5, 2. * PI);
    vec2 q = ra.x * iexp(ra.y);
    o = sdf(q);

    vec2 zoom = vec2(1, 0.995);
    o.r += 0.98 * texFlow(uv / zoom).r; // inflow
    o.g += 0.98 * texFlow(uv * zoom).g; // + 0.005*texFlow(uv*zoom).r; // outflow
}

vec3 flameRGB(float t) {
    return vec3(t, t * t, t * t * t);
}

void updateImg(out vec4 o, vec2 p) {
    o = vec4(0, 0, 0, 1);

    vec2 q = p2q(p);
    vec2 ra = xy2ra(q) / vec2(2.5, 2. * PI);
    vec4 e = texFlow(ra.yx);

    o.rgb += RGB_OUTFLOW * flameRGB(e.g);
    o.rgb += RGB_INFLOW * flameRGB(e.r);
    o.rgb += RGB_GLOW * flameRGB(e.b);
    //o.rgb += RGB_GLOW * flameRGB(e.a/32.);

    o.rgb = pow(o.rgb, vec3(1.0 / 2.2));

    vec2 uv = p / iResolution.xy;
    vec2 uv2 = uv * (1. - uv.yx);
    o.rgb *= min(1., pow(15.0 * uv2.x * uv2.y, 0.25));
}

void mainImage(out vec4 o, vec2 p) {
    if(iChannelId == 0) {
        updateString(o, p);
        return;
    }

    if(iChannelId == 1) {
        updateGroups(o, p);
        return;
    }

    if(iChannelId == 2) {
        updateFlow(o, p);
        return;
    }

    if(iChannelId == -1) {
        //o = 0.5 + 0.5*texString(ivec2(p));
        updateImg(o, p);
        return;
    }

    discard;
}
