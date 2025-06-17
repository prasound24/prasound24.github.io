//const RAND = Math.random() - 0.5;
const RAND = -0.32154151497492545;
console.debug('RAND:', RAND);

const fract = (x) => x - Math.floor(x);

function initStr(xyzw, w, h, x, y) {
    let num = 3;
    let phi = Math.PI * 2 * x / w;

    let px = Math.cos(phi);
    let py = Math.sin(phi);
    let pz = 0;
    let pw = 0;

    for (let s = 1; s <= 3; s += 1) {
        let rnd = fract(Math.sin(RAND * s * Math.PI * 2)) - 0.5;
        let arg = phi * num * s;
        arg += 0.01 * rnd;
        let amp = 10 * rnd * Math.exp(-s);
        pz += amp * Math.cos(arg);
        pw += amp * Math.sin(arg);
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

    for (let i = 0; i < 4; i++) {
        let ds = c[i] - d[i];
        ds += 0.5 * (l[i] + r[i] - c[i] * 2);
        ds -= 0.1 * (ll[i] + rr[i] - (l[i] + r[i]) * 4 + c[i] * 6);
        c[i] += ds;
    }

    mul(c, 1.0 / len(c));
    return c;
}

function genMesh(xyzw, rgba, str4, CW, CH, x, y) {
    let i = y * CW + x;
    let t = y / CH;
    let s = t * t;
    let c = 10 * (0.5 - Math.abs(0.5 - t));
    let w = 1 / (1.5 + str4[i * 4 + 3]);

    xyzw[i * 4 + 0] = s * w * str4[i * 4 + 0];
    xyzw[i * 4 + 2] = s * w * str4[i * 4 + 1];
    xyzw[i * 4 + 1] = s * w * str4[i * 4 + 2];
    xyzw[i * 4 + 3] = t / Math.hypot(CW, CH); // size

    rgba[i * 4 + 0] = c;
    rgba[i * 4 + 1] = c;
    rgba[i * 4 + 2] = c;
    rgba[i * 4 + 3] = 1; // opacity
}

export function createMesh(w, h) {
    let str4 = new Float32Array(w * h * 4);

    for (let y = 0; y < 2; y++)
        for (let x = 0; x < w; x++)
            initStr(str4, w, h, x, y);

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
            genMesh(xyzw, rgba, str4, w, h, x, y);

    return { xyzw, rgba };
}
