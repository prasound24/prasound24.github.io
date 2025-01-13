// https://inria.hal.science/inria-00596050/document

// iChannel0: xy = fluid velocity, z = density/pressure, w = ink
// iChannel1: x = fireball noise
// iChannel2: rgba = image data

#define TEX_FLUID iChannel0
#define TEX_NOISE iChannel1
#define TEX_IMAGE iChannel3

#define T(s,p) texture((s), (p)/iResolution)
#define T0(p) texture(TEX_FLUID,(p)/iResolution)

#define dt 0.1
#define visc 0.5 // viscosity
#define diff 0.3 // diffusion
#define p_min 0.5 // min pressure
#define p_max 3.0

const float RSQRT3 = 1. / sqrt(3.);

vec2 grad(sampler2D img, vec2 p) {
	float n = T(img, p + vec2(0, 1)).r;
	float s = T(img, p - vec2(0, 1)).r;
	float e = T(img, p + vec2(1, 0)).r;
	float w = T(img, p - vec2(1, 0)).r;
	float dx = .5 * (e - w);
	float dy = .5 * (n - s);
	return vec2(dx, dy);
}

void mainImage(out vec4 c, in vec2 p) {
	if(iFrame == 0) {
		c = vec4(0, 0, p_min, 0); // initial state = equal pressure everywhere
		return;
	}

	c = T0(p);

	vec4 n = T0(p + vec2(0, 1));
	vec4 e = T0(p + vec2(1, 0));
	vec4 s = T0(p - vec2(0, 1));
	vec4 w = T0(p - vec2(1, 0));

	vec4 dx = .5 * (e - w);
	vec4 dy = .5 * (n - s);

	float uvdiv = dx.x + dy.y; // velocity field divergence
	vec2 pgrad = vec2(dx.z, dy.z); // pressure field gradient
	vec4 laplacian = n + e + s + w - 4. * c;

	c.z -= dt * dot(c.xyz, vec3(pgrad, uvdiv)); // transport density
	c.xyw = T0(p - dt * c.xy).xyw; // self advection
	c.xyw += dt * vec3(visc, visc, diff) * laplacian.xyw; // viscosity/diffusion
	c.xy -= 0.2 * pgrad; // nullify divergence with pressure field gradient

	vec2 ext; // external forces: https://en.wikipedia.org/wiki/Potential_flow
	vec2 fire = grad(TEX_NOISE, p);
	ext += grad(TEX_IMAGE, p - 0.5*fire*iResolution) * 1.0; // image
	ext += fire * 0.1;
	c.xy += dt * ext;

	// c.w += dt * field(p) * 0.001; // ink source

	c = clamp(c, vec4(-5, -5, p_min, 0), vec4(5, 5, p_max, 5)); // the last defense against overflows
}