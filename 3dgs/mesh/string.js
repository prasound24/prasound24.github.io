const fract = (x) => x - Math.floor(x);

function hash11(p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

function initStr(xyzw, w, h, x, y, amps, sid = 0) {
    let phi = Math.PI * 2 * x / w;
    let px = Math.cos(phi);
    let py = Math.sin(phi);
    let pz = 0;
    let pw = 0;

    for (let s = 0; s < amps.length; s++) {
        let arg = phi * s;
        pz += amps[s] * Math.cos(arg);
        pw += amps[s] * Math.sin(arg);
    }

    px *= Math.cos(pz);
    py *= Math.cos(pz);
    pz = Math.sin(pz);

    let i = y * w + x;
    xyzw[i * 4 + 0] = px * Math.cos(pw);
    xyzw[i * 4 + 1] = py * Math.cos(pw);
    xyzw[i * 4 + 2] = pz * Math.cos(pw);
    xyzw[i * 4 + 3] = Math.sin(pw);
}

const vec4 = () => new Float32Array(4);
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3];
const mul = (v, f) => { v[0] *= f; v[1] *= f; v[2] *= f; v[3] *= f; }
const len = (v) => Math.sqrt(dot(v, v));

function tex(res, rgba, w, h, x, y) {
    x = (x + w) % w;
    let i = y * w + x;
    res[0] = rgba[i * 4 + 0];
    res[1] = rgba[i * 4 + 1];
    res[2] = rgba[i * 4 + 2];
    res[3] = rgba[i * 4 + 3];
}

function moveStr(tmp, xyzw, w, h, x, y) {
    if (tmp.length == 0)
        for (let i = 0; i < 6; i++)
            tmp[i] = vec4();

    let [c, l, r, ll, rr, d] = tmp;

    tex(c, xyzw, w, h, x, y);
    tex(l, xyzw, w, h, x - 1, y);
    tex(r, xyzw, w, h, x + 1, y);
    tex(ll, xyzw, w, h, x - 2, y);
    tex(rr, xyzw, w, h, x + 2, y);
    tex(d, xyzw, w, h, x, y - 1);

    mul(l, 1.0 / dot(l, c));
    mul(r, 1.0 / dot(r, c));
    mul(d, 1.0 / dot(d, c));
    mul(ll, 1.0 / dot(ll, c));
    mul(rr, 1.0 / dot(rr, c));

    let dx2 = (1 / w) ** 2;
    let dt2 = (1 / h) ** 2;

    for (let i = 0; i < 4; i++) {
        let ds = c[i] - d[i];
        ds += (0.25 * dt2 / dx2) * (l[i] + r[i] - c[i] * 2);
        //ds -= (5e-8 * dt2 / dx2 / dx2) * (ll[i] + rr[i] - (l[i] + r[i]) * 4 + c[i] * 6);
        c[i] += ds;
    }

    mul(c, 1.0 / len(c));
    return c;
}

function genMesh(xyzw, rgba, str4, CW, CH, i, j, dd, radius = 1) {
    let p = j * CW + i;
    let t = j / CH;
    let w = str4[p * 4 + 3];
    let s = (1 - t) / (1.25 + w);
    let x = s * str4[p * 4 + 0];
    let y = s * str4[p * 4 + 1];
    let z = s * str4[p * 4 + 2];
    let r = s * radius;

    xyzw[p * 4 + 0] = x;
    xyzw[p * 4 + 1] = z;
    xyzw[p * 4 + 2] = y;
    xyzw[p * 4 + 3] = r / CW; // size

    rgba[p * 4 + 0] = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (w/2 + dd[0]));
    rgba[p * 4 + 1] = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (w/2 + dd[1]));
    rgba[p * 4 + 2] = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (w/2 + dd[2]));
    rgba[p * 4 + 3] = 1.0; // opacity
}

export function createMesh(w, h, { sid, r, rgb } = {}) {
    let str4 = new Float32Array(w * h * 4);
    let amps = new Float32Array(60);

    for (let s = 0; s < amps.length; s++) {
        amps[s] = hash11(sid / 3.14 ** s) - 0.5;
        if (s > 0) amps[s] /= 0.04 * 2**s;
        if (s % 3) amps[s] = 0;
    }

    console.debug('String amps:', [...amps].map(a => a.toFixed(2)).join(','));

    for (let y = 0; y < 2; y++)
        for (let x = 0; x < w; x++)
            initStr(str4, w, h, x, y, amps, sid);

    let tmp = [];

    for (let y = 2; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let c = moveStr(tmp, str4, w, h, x, y - 1);
            let i = y * w + x;
            str4.set(c, i * 4);
        }
    }

    let xyzw = new Float32Array(w * h * 4);
    let rgba = new Float32Array(w * h * 4);

    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            genMesh(xyzw, rgba, str4, w, h, x, y, rgb, r);

    return { xyzw, rgba };
}
