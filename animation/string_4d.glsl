const float INF = 1e10;

// Simulation consts
const int N = 256;
const float MASS = 25.0;

// Rendering consts
const vec3 RGB_INFLOW = 0.5*vec3(1.5, 0.5, 0.2);
const vec3 RGB_OUTFLOW = 0.5*vec3(0.5, 0.2, 1.5);
const vec3 RGB_GLOW = 0.1*vec3(0.5, 0.2, 1.5);
const float GLOW = 1.5;
const float R0 = 0.02;
const float R1 = 1.0;

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

vec4 initWave(ivec2 pp, int N) {
    float phi = 2.*PI*float(pp.x)/float(N);
    vec2 xy = c2exp(phi+PI/2.);

    float z = 1.0 * cos(phi * 5.0) - 0.4;
    float w = 0.1 * sin(phi * 5.0);
    
    //if (pp.y > 0) xy = c2exp(phi + 0.015); // spin

    vec3 xyz = vec3(xy*cos(z), sin(z));
    vec4 xyzw = vec4(xyz*cos(w), sin(w));
    return normalize(xyzw);
}

void updateString(out vec4 o, in vec2 p) {
    ivec2 pp = ivec2(p - 0.5);
    
    if (pp.x > N-1 || pp.y > 1)
        return;
     
    if (iFrame == 0) {
        o = initWave(pp,N);
        return;
    }
    
    // prev <- curr
    if (pp.y == 1) {
        o = texelFetch(iChannel0, ivec2(pp.x,0), 0);
        return;
    }
    
    vec4 cc = texFetch(iChannel0, pp); // length(cc) = 1
    vec4 cc_prev = texFetch(iChannel0, pp + ivec2(0,1));
    vec4 rr = texFetch(iChannel0, pp + ivec2(1,0));
    vec4 ll = texFetch(iChannel0, pp - ivec2(1,0));
    
    vec4 T = rr + ll - 2.*cc; // Hooke's law
    
    //if (iTime < 30.) {
    //    vec4 dT = vec4(0,1,cos(float(iFrame)/60.),sin(float(iFrame)/60.)) - cc;
    //    if (pp.x == 0) T += 0.1 * dT * length(dT); // external force
    //}
    
    float damping = 0.0;
    o = normalize(cc + (cc - cc_prev) + damping*cc_prev + T/MASS); // F=ma
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
    return r.xy / length(r.zw - vec2(0.0, 2.0));
}

float sdf(vec2 q) {
    float d = INF, e = 0.;
    vec2 p1 = pos(-1), p2 = pos(-2), p3 = pos(-3);
    
    for (int i = 0; i < N; i++) {
        vec2 p0 = pos(i);

        // basic interpolation
        vec2 m1 = (p1+p2)*0.5 + (p1+p2)*0.125 - (p0+p3)*0.125;
        d = min(d, lineSDF(q, p1, m1));
        d = min(d, lineSDF(q, m1, p2));
        
        p3 = p2;
        p2 = p1;
        p1 = p0;
    }
    
    return d;
}

vec4 scaledImg(vec2 q, float fade, float scale) {
    return fade*texture(iChannel1, q2p(q*scale)/iResolution.xy);
}

void updateFlow(out vec4 o, vec2 p) {
    vec2 q = p2q(p);
    float d = sdf(q/R1);
    float e = exp(-pow(7.5*d/R0, 2.0));
    float g  = pow(R0/d, GLOW);

    o.rgb = vec3(e, e, g);

    float dt = 0.02;
    o.r += scaledImg(q, exp(-dt*1.0), exp(-dt*0.3)).r; // outflow
    o.g += scaledImg(q, exp(-dt*1.0), exp(+dt*0.3)).g; // inflow
}

vec3 flameRGB(float t) {
    return vec3(t, t*t, t*t*t);
}

void mainImage(out vec4 o, in vec2 p) {
    if (iChannelId == 0) {
      updateString(o, p);
      return;
    }

    if (iChannelId == 1) {
      updateFlow(o, p);
      return;
    }

    o = vec4(0,0,0,1);
    
    vec3 e = texture(iChannel1, p/iResolution.xy).rgb;
    
    o.rgb += RGB_OUTFLOW * flameRGB(e.r);
    o.rgb += RGB_INFLOW * flameRGB(e.g);
    o.rgb += RGB_GLOW * e.b;
    
    o.rgb = pow(o.rgb, vec3(0.4545));
    
}
