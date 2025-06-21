import { StringOscillator } from "../../create/oscillator.js";
import { dcheck } from "../../lib/utils.js";

export function createMesh(w, h, { audio }) {
    let ch0 = audio.channels[0], n = ch0.length;
    let osc = new StringOscillator(w);
    let gsm = {};

    osc.damping = 0.001;

    gsm.xyzw = new Float32Array(w * h * 4);
    gsm.rgba = new Float32Array(w * h * 4);
    gsm.rgba.fill(1.0);

    for (let y = 0; y < Math.min(h, n); y++) {
        osc.update(ch0[y]);

        for (let x = 0; x < w; x++) {
            let amp = osc.wave[x] - ch0[y];
            dcheck(Math.abs(amp) <= 5.0);
            amp *= 5.0;

            let t = y / n;
            let a = x / w * Math.PI * 2;
            let b = t * Math.PI - Math.PI / 2;
            let i = (y * w + x) * 4;
            gsm.xyzw[i + 0] = t * amp * Math.cos(a) * Math.cos(b);
            gsm.xyzw[i + 2] = t * amp * Math.sin(a) * Math.cos(b);
            gsm.xyzw[i + 1] = t * amp * Math.sin(b);
            gsm.xyzw[i + 3] = t * amp * 0.5/w;

            let d = [0.55, 0.34, 0.22]; // red-blue
            gsm.rgba[i + 0] = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (t + d[0]));
            gsm.rgba[i + 1] = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (t + d[1]));
            gsm.rgba[i + 2] = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (t + d[2]));
            gsm.rgba[i + 3] = 0.5;
        }
    }

    return gsm;
}
