// https://inria.hal.science/inria-00596050/document

#define T(p) texture(iChannel0,(p)/iResolution)

#define dt 0.1
#define visc 0.5 // viscosity
#define diff 0.1 // diffusion
#define p_min 0.5 // min pressure

// c.xy = velocity, c.z = density/pressure, c.w = ink
void mainImage(out vec4 c, in vec2 p) {
	if(iFrame == 0) {
		c = vec4(0, 0, 1, 0.);
		float ink = 0.7 * length(texture(iChannel1, p/iResolution).rgb); // 0..1
		c.z = p_min + ink; // min pressure = 0.5
		c.w = ink;
		return;
	}

	c = T(p);

	vec4 n = T(p + vec2(0, 1));
	vec4 e = T(p + vec2(1, 0));
	vec4 s = T(p - vec2(0, 1));
	vec4 w = T(p - vec2(1, 0));

	vec4 dx = .5 * (e - w);
	vec4 dy = .5 * (n - s);

	float div = dx.x + dy.y; // velocity field divergence
	vec2 grad = vec2(dx.z, dy.z); // pressure field gradient
	vec4 laplacian = n + e + s + w - 4. * c;

	c.z -= dt * dot(c.xyz, vec3(grad, div)); // transport density
	c.xyw = T(p - dt * c.xy).xyw; // self advection
	c.xyw += dt * vec3(visc, visc, diff) * laplacian.xyw; // viscosity/diffusion
	c.xy -= 0.2 * grad; // nullify divergence with pressure field gradient

	c = clamp(c, vec4(-5, -5, p_min, 0), vec4(5, 5, 3, 5)); // the last resort protection against overflows
}