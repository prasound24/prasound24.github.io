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

    let cosz = Math.cos(pz);
    px *= cosz;
    py *= cosz;
    pz = Math.sin(pz);

    let i = y * w + x;
    let cosw = Math.cos(pw);
    xyzw[i * 4 + 0] = px * cosw;
    xyzw[i * 4 + 1] = pz * cosw;
    xyzw[i * 4 + 2] = py * cosw;
    xyzw[i * 4 + 3] = Math.sin(pw);
}

let tex = (str, w, h, x, y) => { let i = (y * w + (x + w) % w) * 4; return str.slice(i, i + 4); }
let dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3];
let mul = (v, f) => { v[0] *= f; v[1] *= f; v[2] *= f; v[3] *= f; }
let len = (v) => Math.sqrt(dot(v, v));

function moveStr(xyzw, w, h, x, y) {
    let c = tex(xyzw, w, h, x, y);
    let l = tex(xyzw, w, h, x - 1, y);
    let r = tex(xyzw, w, h, x + 1, y);
    let ll = tex(xyzw, w, h, x - 2, y);
    let rr = tex(xyzw, w, h, x + 2, y);
    let d = tex(xyzw, w, h, x, y - 1);

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

function genMesh(xyzw, rgba, CW, CH, x, y) {
    let i = y * CW + x;
    let t = y / CH;
    let s = t * t * 3; // Math.exp((t - 1)*5);
    let c = 10 * (0.5 - Math.abs(0.5 - t)); // *Math.exp(-t*3.0);

    // s = 1; // DEBUG

    xyzw[i * 4 + 0] *= s;
    xyzw[i * 4 + 1] *= s;
    xyzw[i * 4 + 2] *= s;
    xyzw[i * 4 + 3] = s / CH; // size

    rgba[i * 4 + 0] = c * 1.0;
    rgba[i * 4 + 1] = c * 0.5;
    rgba[i * 4 + 2] = c * 0.2;
    rgba[i * 4 + 3] = 0.5; // opacity
}

export function createMesh(w, h) {
    let xyzw = new Float32Array(w * h * 4);
    let rgba = new Float32Array(w * h * 4);

    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            initStr(xyzw, w, h, x, y);

    for (let y = 2; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let c = moveStr(xyzw, w, h, x, y - 1);
            xyzw.set(c, (y * w + x) * 4);
        }
    }

    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            genMesh(xyzw, rgba, w, h, x, y);

    return { xyzw, rgba };
}
