// https://inria.hal.science/inria-00596050/document

#define T(p) texture(iChannel0,(p)/iResolution)
#define length2(p) dot(p,p)

#define dt 0.05
#define K 0.25
#define nu 0.0001 // viscosity
#define kappa 0.01 // diffusion

// c.xy = velocity, c.z = density, c.w = ink
void mainImage(out vec4 c, in vec2 p) {
	if (iFrame == 0) {
		c = vec4(0,0,1,0);
		c.w = 0.7 * length2(texture(iChannel1, p/iResolution.yy).rgb);
		return;
	}

	c = T(p);

	vec4 n = T(p + vec2(0, 1));
	vec4 e = T(p + vec2(1, 0));
	vec4 s = T(p - vec2(0, 1));
	vec4 w = T(p - vec2(1, 0));

	vec4 dx = .5 * (e - w);
	vec4 dy = .5 * (n - s);
  
	float udiv = dx.x + dy.y; // velocity field divergence
	vec2 dgrad = vec2(dx.z, dy.z);
	vec4 laplacian = n + e + s + w - 4. * c;

	c.z -= dt * dot(c.xyz, vec3(dgrad, udiv)); // transport density
	c.xyw = T(p - dt * c.xy).xyw; // self advection
	c.xyw += dt * vec3(nu, nu, kappa) * laplacian.xyw; // viscosity/diffusion
	c.xy -= K * dgrad; // nullify divergence with pressure field gradient
	c.w -= dt * 0.0005; // dissipation

  // external sources
	vec2 src = iTime*75.0*vec2(1);
	vec2 ray = 75.0 * vec2(cos(iTime*1.), sin(iTime*2.));
	c.xyw += dt * exp(-length2(p - src) / 125.) * vec3(ray, 1.5+0.5*cos(iTime*30.0));

	c = clamp(c, vec4(-5,-5,0,0), vec4(5));
}