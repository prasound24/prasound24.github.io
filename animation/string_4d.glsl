const float INF = 1e10;

// Simulation consts
const int N = 256;
const float MASS = 25.0;

// Rendering consts
const vec3 RGB_INFLOW = vec3(0.1, 0.2, 1.5);
const vec3 RGB_OUTFLOW = vec3(1.5, 0.5, 0.2);
const vec3 RGB_GLOW = vec3(0.5, 0.2, 1.5);
const float GLOW = 1.5;
const float R0 = 0.01;
const float R1 = 1.0;
const float R2 = 0.02/7.5;

vec4 texFetch(sampler2D ch0, ivec2 p) {
    p = ivec2(mod(vec2(p), vec2(ivec2(N,2))));
    return texelFetch(ch0, p, 0);
}

vec2 c2exp(float phi) {
    return vec2(cos(phi), sin(phi));
}

mat2 rot2(float phi) {
    float c = cos(phi), s = sin(phi);
    return mat2(c, s, -s, c);
}

float sound(int i) {
    if (i < 0 || i >= iSoundLen) return 0.;
    ivec2 s = textureSize(iChannel2, 0);
    int y = i / s.x, x = i % s.x;
    return texelFetch(iChannel2, ivec2(x,y), 0).x;
}

vec4 initPos(ivec2 pp) {
    float phi = 2.*PI*float(pp.x)/float(N);

    float x = sin(phi*1.0);
    float y = cos(phi*1.0);

    float z = 1.0 * sin(phi*5.0) - 0.4;
    float w = 0.03 * cos(phi*5.0);

    vec3 xyz = vec3(vec2(x,y)*cos(z), sin(z));
    vec4 xyzw = vec4(xyz*cos(w), sin(w));

    return normalize(xyzw);
}

void updateString(out vec4 o, in vec2 p) {
    ivec2 pp = ivec2(p - 0.5);
    
    if (pp.x > N-1 || pp.y > 1)
        return;
     
    if (iFrame == 0) {
        o = initPos(pp);
        o = normalize(o);
        return;
    }
    
    // prev <- curr
    if (pp.y == 1) {
        o = texelFetch(iChannel0, ivec2(pp.x,0), 0);
        return;
    }
    
    vec4 cc = texFetch(iChannel0, pp); // length(cc.xyz) = 1
    vec4 cc_prev = texFetch(iChannel0, pp + ivec2(0,1));
    vec4 rr = texFetch(iChannel0, pp + ivec2(1,0));
    vec4 ll = texFetch(iChannel0, pp - ivec2(1,0));
    
    vec4 T = (rr - cc) + (ll - cc); // Hooke's law
    o = cc + (cc - cc_prev) + T/MASS; // F=ma

    vec4 damping = vec4(0);
    o += damping*cc_prev;
    o /= vec4(1) + damping;
    o = normalize(o);
}

float lineSDF(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return length( pa - ba*h );
}

vec2 p2q(vec2 p) {
    vec2 ar = iResolution.xy/iResolution.yy;
    return (p/iResolution.xy*2. - 1.) * ar;
}

vec2 q2p(vec2 q) {
    vec2 ar = iResolution.xy/iResolution.yy;
    return (q/ar*0.5 + 0.5) * iResolution.xy;
}

vec2 pos(int i) {
    vec4 r = texFetch(iChannel0, ivec2(i,0));
    if (iMouse.z > 0.) {
        vec2 m = p2q(iMouse.xy);
        r.yw *= rot2(PI*m.y);
        r.xz *= rot2(PI*m.x);
    }
    // basic perspective projection
    r.xyz /= 1.2 - r.w;
    r.xy /= 1.2 - r.z;
    return r.xy;
}

float sdf(vec2 q) {
    float d = INF;
    vec2 p1 = pos(-1), p2 = pos(-2), p3 = pos(-3);
    
    for (int i = 0; i < N; i++) {
        vec2 p0 = pos(i);
        vec2 m1 = (p1+p2)*0.5 + (p1+p2)*0.125 - (p0+p3)*0.125;
        
        d = min(d, lineSDF(q, p1, m1));
        d = min(d, lineSDF(q, m1, p2));

        p3 = p2; p2 = p1; p1 = p0;
    }
    
    return d;
}

vec4 advectTemp(vec2 q, float scale) {
    return 0.98 * texture(iChannel1, q2p(q*scale)/iResolution.xy);
}

void updateFlow(out vec4 o, vec2 p) {
    vec2 q = p2q(p);
    float d = sdf(q/R1);

    o.rg = exp(-pow(d/R2, 2.0)) * vec2(1);
    o.b = pow(R0/d, GLOW);

    o.r += advectTemp(q, 0.995).r; // outflow
    o.g += advectTemp(q, 1.005).g; // inflow
}

vec3 flameRGB(float t) {
    return vec3(t, t*t, t*t*t);
}

void mainImage(out vec4 o, vec2 p) {
    if (iChannelId == 0) {
      updateString(o, p);
      return;
    }

    if (iChannelId == 1) {
      updateFlow(o, p);
      return;
    }

    o = vec4(0,0,0,1);
    
    vec2 uv = p/iResolution.xy;
    vec3 e = texture(iChannel1, uv).rgb;
    
    o.rgb += RGB_OUTFLOW * e.r;
    o.rgb += RGB_INFLOW * e.g;
    o.rgb += RGB_GLOW * e.b;
    
    //o.rgb = pow(o.rgb, vec3(0.4545));

    vec2 uv2 = uv * (1. - uv.yx);
    o.rgb *= min(1., pow(15.0*uv2.x*uv2.y, 0.25));
}
