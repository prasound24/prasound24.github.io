#define CH_STRING iChannel0
#define CH_GROUPS iChannel1
#define CH_FLOW iChannel2

const float INF = 1e6;

// Simulation consts
const int N = IMG_W; // must be less than iChannel0 width
const int GS = int(sqrt(float(N))); // group size
const int NG = (N + GS - 1) / GS; // number of groups
const float ZOOM = 2.0;
const int NBOX = 32;

// Rendering consts
#define RGB_INFLOW vec3(1.0, 0.5, 0.2)
#define RGB_OUTFLOW vec3(0.5, 0.2, 1.0)
#define RGB_GLOW vec3(0.6, 0.4, 1.0)
#define RGB_BBOX vec3(0.1, 0.4, 0.2)
#define RGLOW 0.001
#define RFLOW 0.001
#define DECAY 0.997
#define INK_STYLE false

vec2 iexp(float phi) {
    return vec2(cos(phi), sin(phi));
}

mat2 rot2(float phi) {
    float c = cos(phi), s = sin(phi);
    return mat2(c, s, -s, c);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 initPos(ivec2 pp) {
    float phi = 2. * PI * (0.5 + float(pp.x)) / float(N);
    //phi += float(pp.y) * 0.005;

    float x = sin(phi);
    float y = cos(phi);

    float K = 3.0;
    float z = 0.0;
    float w = 0.0;

    for (float s = 1.; s <= 3.; s += 1.) {
        vec2 rand = hash22(vec2(s + iTime)) - 0.5;
        float d = pp.y == 0 ? 0. :
            0.01 * hash22(vec2(s, iTime + float(pp.y))).x;
        z += 5.0 * rand.x * exp2(-s) * cos(phi * K * s + d);
        w += 3.0 * rand.y * exp2(-s) * sin(phi * K * s + d);
    }

    vec3 xyz = vec3(vec2(x, y) * cos(z), sin(z));
    vec4 r = vec4(xyz * cos(w), sin(w));

    return normalize(r.xzyw);
}

vec4 texString(ivec2 p) {
    p = ivec2(mod(vec2(p), vec2(ivec2(N, IMG_H))));
    //p.x = int(mod(float(p.x), float(N)));
    return texelFetch(CH_STRING, p, 0);
}

vec4 moveString(vec2 p) {
    const ivec2 dx = ivec2(1, 0);
    const ivec2 dt = ivec2(0, 1);

    ivec2 pp = ivec2(p);

    // All four are in one plane tangent to the unit sphere at c.
    vec4 c = texString(pp); // length(cc) = 1
    vec4 l = texString(pp - dx);
    vec4 r = texString(pp + dx);
    vec4 ll = texString(pp - dx * 2);
    vec4 rr = texString(pp + dx * 2);
    vec4 d = texString(pp + dt);

    l /= dot(l, c);
    r /= dot(r, c);
    d /= dot(d, c);
    ll /= dot(ll, c);
    rr /= dot(rr, c);

    vec4 ds = c - d;
    // https://web.media.mit.edu/~crtaylor/calculator.html
    ds += 0.5 * (l + r - c * 2.);
    ds -= 0.1 * (ll + rr - (l + r) * 4. + c * 6.);
    return normalize(c + ds); // /float(IMG_H);
}

void updateString(out vec4 o, in vec2 p) {
    if (int(p.x) >= N)
        discard;

    if (iFrame == 0) {
        o = initPos(ivec2(p));
        o = normalize(o); // /float(IMG_H);
        return;
    }

    o = int(p.y) == 0 ? moveString(p) :
        texString(ivec2(p) - ivec2(0,1));
}

vec2 xy2uv(vec2 p) {
    vec2 r = iResolution.xy;
    vec2 a = r.x > r.y ? r.yy : r.xx;
    return (p * 2. - r) / a;
}

vec2 uv2xy(vec2 q) {
    vec2 r = iResolution.xy;
    vec2 a = r.x > r.y ? r.yy : r.xx;
    return 0.5 * (q * a + r);
}

vec2 _pos(int i, int j) {
    vec4 r = texString(ivec2(i, j));
    // basic perspective projection
    r.xyz /= 1.5 + r.w;
    r.xy /= 1.5 + r.z;
    return r.xy * ZOOM;
}

vec2 pos(int i) {
    return _pos(i, 0);
}

vec3 dist2flow(float d) {
    float flow = exp(-pow(d / RFLOW, 2.));
    float glow = exp(-pow(d / RGLOW, 2.));
    return vec3(flow, flow, glow);
}

float estMaxDist() {
    float d1 = 0.0001, d2 = 0.1;

    for (int i = 0; i < 10; i++) {
        float d = mix(d1, d2, 0.5);
        vec3 e = dist2flow(d);
        e = pow(e, vec3(0.2));
        if (max(e.y, e.z) > 1e-6)
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

    if (!boxIntersect(box, 0))
        return ivec4(0);

    ivec4 rr = ivec4(N, 0, N, 0);

    for (int j = 1; j <= NG; j++) {
        if (!boxIntersect(box, j))
            continue;

        int imin = j * GS + 1;
        int imax = j * GS + GS;
        vec2 l = pos(imin - 1), r;

        for (int i = imin; i <= imax + 2; i++) {
            vec2 r = pos(i);
            vec4 lr = vec4(min(l.xy, r.xy), max(l.xy, r.xy));
            if (boxIntersect0(box, lr)) {
                if (i < N / 2)
                    rr.x = min(rr.x, i), rr.y = max(rr.y, i + 1);
                else
                    rr.z = min(rr.z, i), rr.w = max(rr.w, i + 1);
            }
            l = r;
        }
    }

    return rr;
}

mat4x2 bezierCP(vec2 ll, vec2 l, vec2 r, vec2 rr) {
    return mat4x2(l, l + (r - ll) / 6., r + (l - rr) / 6., r);
}

vec2 min4(mat4x2 m) {
    return min(min(m[0], m[1]), min(m[2], m[3]));
}

vec2 max4(mat4x2 m) {
    return -min4(-m);
}

void updateGroups(out vec4 o, vec2 p) {
    if (p.y < 1.0) {
        if (int(p.x) > NG)
            discard;

        o.xy = +vec2(INF); // box min
        o.zw = -vec2(INF); // box max

        if (int(p.x) == 0) {
            // CH_GROUPS[0,0] = bbox for the entire curve
            for (int i = 1; i <= NG; i++) {
                vec4 b = texelFetch(CH_GROUPS, ivec2(i, 0), 0);
                o.xy = min(o.xy, b.xy);
                o.zw = max(o.zw, b.zw);
            }
        } else {
            // CH_GROUPS[i,0] = bbox for the segment [i*GS+1..i*GS+GS]
            vec2 ll, l, r, rr;
            for (int i = 1; i <= GS; i++) {
                rr = pos(int(p.x) * GS + i);
                ll = _pos(int(p.x) * GS + i, 1);
                o.xy = min(o.xy, min(ll, rr));
                o.zw = max(o.zw, max(ll, rr));
                // cubic bezier is bounded by its control polygon
                //mat4x2 cp = bezierCP(ll, l, r, rr);
                //o.xy = min(o.xy, min4(cp));
                //o.zw = max(o.zw, max4(cp));
                //ll = l, l = r, r = rr;
            }
        }
        return;
    }

    if (p.y > 1.0 && iPass == 2) {
        vec2 b1 = (p - vec2(0, 1)) * float(NBOX);
        vec2 b2 = (p + vec2(1, 0)) * float(NBOX);
        if (b1.x > iResolution.x || b1.y > iResolution.y)
            discard;
        vec4 box = vec4(xy2uv(b1), xy2uv(b2));
        o = vec4(findImpactRange(box));
        return;
    }
}

float sdLine(vec2 p, vec2 a, vec2 b) {
    p -= a, b -= a;
    float t = clamp(dot(p, b) / dot(b, b), 0., 1.);
    float d = length(p - b * t);
    return d;
}

vec2 midpoint(vec2 ll, vec2 l, vec2 r, vec2 rr) {
    return (l + r) * 0.5 + (l - ll) * 0.125 + (r - rr) * 0.125;
}

float sdBox0(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdBox(vec2 p, vec2 a, vec2 b) {
    return sdBox0(p - (a + b) * 0.5, abs(a - b) * 0.5);
}

float sdGroup(vec2 q, int i) {
    vec4 ab = texelFetch(CH_GROUPS, ivec2(i, 0), 0);
    return max(sdBox(q, ab.xy, ab.zw), 0.);
}

void sdf0(vec2 q, int imin, int imax, inout vec3 d3, inout int lookups) {
    if (imax <= imin)
        return;

    lookups += 3;
    vec2 ll = pos(imin - 1), l = pos(imin), r = pos(imin + 1);

    for (int i = imin; i <= imax; i++) {
        lookups++;
        vec2 rr = _pos(i, 0);
        vec2 pp = _pos(i, 1);
        float d = sdLine(q, rr, pp);
        if (i % 12 == 0)
            d *= 0.8;
        d3 = max(d3, dist2flow(d));
    }
}

vec4 sdf(vec2 q) {
    int lookups = 0;
    float d0 = estMaxDist(); // as good as INF
    vec3 d3;

    lookups++;
    if (sdGroup(q, 0) > d0)
        return vec4(0, 0, 0, lookups);

    for (int j = 1; j <= NG; j++) {
        lookups++;
        if (sdGroup(q, j) > d0)
            continue;

        int imin = j * GS + 1;
        int imax = j * GS + GS;
        sdf0(q, imin, imax, d3, lookups);
    }

    return vec4(d3, float(lookups));
}

void updateFlow(out vec4 o, vec2 p) {
    vec2 r = iResolution;
    vec2 uv = xy2uv(p);
    o = sdf(uv);

    float s = DECAY;
    o.x += s * s * texture(CH_FLOW, uv2xy(uv / s) / r).x; // inflow
    o.y += s * s * texture(CH_FLOW, uv2xy(uv * s) / r).y; // outflow
}

void addVignette(inout vec4 o, vec2 p) {
    vec2 uv = p / iResolution.xy;
    uv.xy *= 1. - uv.yx;
    float v = uv.x * uv.y * 15.0;
    o.a *= pow(v, 0.125);
}

void addLogo(inout vec4 o, vec2 p) {
    vec2 ls = vec2(textureSize(iLogo, 0));
    vec2 bl = vec2(iResolution.x, 0) + vec2(-ls.x - ls.y, ls.y);
    vec2 p2 = p - bl;
    p2.y = ls.y - 1. - p2.y;
    if (p2.x <= ls.x && p2.y <= ls.y && p2.x >= 0. && p2.y >= 0.) {
        vec4 tex = texelFetch(iLogo, ivec2(p2), 0);
        o.rgb = mix(o.rgb, tex.rgb, tex.a * 0.8);
    }
}

void updateImg(out vec4 o, vec2 p) {
    o = vec4(0, 0, 0, 1);

    vec4 e = texelFetch(CH_FLOW, ivec2(p), 0);
    vec3 a = INK_STYLE ? vec3(1) : vec3(0);
    vec3 b = INK_STYLE ? vec3(-1) : vec3(1);
    o.rgb += e.y * (a + b * RGB_OUTFLOW);
    o.rgb += e.x * (a + b * RGB_INFLOW);
    o.rgb += e.z * (a + b * RGB_GLOW);
    //o.rgb += RGB_BBOX * flameRGB(e.a/32.);

    //if (!INK_STYLE) o = sqrt(o);
    addLogo(o, p);
    addVignette(o, p);
    o.rgb *= o.a;
    o.a = 1.;
    if (INK_STYLE)
        o = exp(-o);
}

void mainImage(out vec4 o, vec2 p) {
    if (iChannelId == 0) {
        updateString(o, p);
        return;
    }

    if (iChannelId == 1) {
        updateGroups(o, p);
        return;
    }

    if (iChannelId == 2) {
        updateFlow(o, p);
        return;
    }

    if (iChannelId == -1) {
        //o = 0.5 + 0.5*texString(ivec2(p));
        updateImg(o, p);
        return;
    }

    discard;
}
