function initStr(str, w, h, x, y) {
    let phi = Math.PI * 2 * x / w;

    let px = Math.sin(phi);
    let py = Math.cos(phi);
    let pz = 0;
    let pw = 0;

    let K = 3;

    for (let s = 1; s <= 3; s += 1) {
        let rand = Math.random() - 0.5;
        let d = y == 0 ? 0. : 0.01 * rand;
        pz += 5.0 * rand * Math.exp(-s) * Math.cos(phi * K * s + d);
        pw += 3.0 * rand * Math.exp(-s) * Math.sin(phi * K * s + d);
    }

    px *= Math.cos(pz);
    py *= Math.cos(pz);
    pz = Math.sin(pz);

    let i = (y * w + x) * 4;

    str[i + 0] = px * Math.cos(pw);
    str[i + 1] = py * Math.cos(pw);
    str[i + 2] = pz * Math.cos(pw);
    str[i + 3] = Math.sin(pw);
}

let vec4 = () => new Float32Array(4);
let tex = (str, w, h, x, y) => ((x = y * w + (x + w) % w), str.slice(x * 4, x * 4 + 4));
let dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3];
let mul = (v, f) => (v[0] *= f, v[1] *= f, v[2] *= f, v[3] *= f);
let len = (v) => Math.sqrt(dot(v, v));

function moveStr(str, w, h, x, y) {
    let xl = (x - 1 + w) % w;
    let xr = (x + 1 + w) % w;
    let xll = (x - 2 + w) % w;
    let xrr = (x + 2 + w) % w;

    let c = tex(str, w, h, x, y);
    let l = tex(str, w, h, x - 1, y);
    let r = tex(str, w, h, x + 1, y);
    let ll = tex(str, w, h, x - 2, y);
    let rr = tex(str, w, h, x + 2, y);
    let d = tex(str, w, h, x, y - 1);

    mul(l, 1.0 / dot(l, c));
    mul(r, 1.0 / dot(r, c));
    mul(d, 1.0 / dot(d, c));
    mul(ll, 1.0 / dot(ll, c));
    mul(rr, 1.0 / dot(rr, c));

    let ds = vec4();

    for (let i = 0; i < 4; i++)
        ds[i] = c[i] - d[i];

    for (let i = 0; i < 4; i++)
        ds[i] += 0.5 * (l[i] + r[i] - c[i] * 2);

    for (let i = 0; i < 4; i++)
        ds[i] -= 0.1 * (ll[i] + rr[i] - (l[i] + r[i]) * 4 + c[i] * 6);

    for (let i = 0; i < 4; i++)
        c[i] += ds[i];

    mul(c, 1.0 / len(c));
    str.set(c, (y * w + x) * 4);
}

function genMesh(str, xyzw, rgba, w, h, x, y) {
    let i = y * w + x;
    let t = 1 - y / h;
    let s = t + t * t * 2; // Math.exp((t - 1)*5);
    let c = 30 * (0.5 - Math.abs(0.5 - t)); // *Math.exp(-t*3.0);

    xyzw[i * 4 + 0] = str[i * 4 + 0] * s;
    xyzw[i * 4 + 1] = str[i * 4 + 1] * s;
    xyzw[i * 4 + 2] = str[i * 4 + 2] * s;
    xyzw[i * 4 + 3] = s / h * 2; // size

    rgba[i * 4 + 0] = c * 0.2;
    rgba[i * 4 + 1] = c * 0.5;
    rgba[i * 4 + 2] = c * 1.0;
    rgba[i * 4 + 3] = 0.2; // opacity
}

export function createMesh(w, h) {
    let str = new Float32Array(w * h * 4);

    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            initStr(str, w, h, x, y);

    for (let y = 2; y < h; y++)
        for (let x = 0; x < w; x++)
            moveStr(str, w, h, x, y);

    let xyzw = new Float32Array(w * h * 4);
    let rgba = new Float32Array(w * h * 4);

    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            genMesh(str, xyzw, rgba, w, h, x, y);

    return { xyzw, rgba };
}
