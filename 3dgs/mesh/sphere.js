const PHI = (Math.sqrt(5) - 1) / 2;

export function createMesh(CW, CH) {
    let n = CW * CH;
    let xyzw = new Float32Array(n * 4);
    let rgba = new Float32Array(n * 4);

    for (let i = 0; i < n; i++) {
        let z = i / (n - 1) * 2 - 1;
        let r = Math.sqrt(1 - z * z);
        let t = i * PHI * Math.PI * 2;

        xyzw[i * 4 + 0] = Math.cos(t) * r;
        xyzw[i * 4 + 1] = Math.sin(t) * r;
        xyzw[i * 4 + 2] = z;
        xyzw[i * 4 + 3] = 1 / Math.hypot(CW, CH); // scale

        rgba[i * 4 + 0] = i / n;
        rgba[i * 4 + 1] = 0.5;
        rgba[i * 4 + 2] = 1.0 - i / n;
        rgba[i * 4 + 3] = 1.0; // opacity
    }

    return { xyzw, rgba };
}
