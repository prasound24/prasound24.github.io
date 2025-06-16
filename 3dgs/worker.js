import { createMesh } from './mesh/string.js';

self.onmessage = (e) => {
    let { type, txid } = e.data;
    if (type != 'mesh')
        throw new Error('Invalid command: ' + type);
    let { xyzw, rgba } = createMesh(1920, 1080);
    let splats = packSplats(xyzw, rgba);
    postMessage({ txid, res: splats }, [splats]);
};

// https://sparkjs.dev/docs/packed-splats
function packSplats(xyzw, rgba) {
    let n = rgba.length / 4;
    let data = new Uint8ClampedArray(n * 16);

    for (let i = 0; i < n; i++) {
        data[i * 16 + 0] = rgba[i * 4 + 0] * 255; //  R
        data[i * 16 + 1] = rgba[i * 4 + 1] * 255; //  G
        data[i * 16 + 2] = rgba[i * 4 + 2] * 255; //  B
        data[i * 16 + 3] = rgba[i * 4 + 3] * 255; //  A

        let s = xyzw[i * 4 + 3];
        let logs = s > 0 ? Math.log(s) / 9 * 0.5 + 0.5 : 0;

        if (s < 0 || s > 0.01)
            throw new Error('Invalid splat size: ' + s);

        data[i * 16 + 12] = logs * 255; //  X scale
        data[i * 16 + 13] = logs * 255; //  Y scale
        data[i * 16 + 14] = logs * 255; //  Z scale
    }

    let data16 = new Int16Array(data.buffer);
    let xyzw32 = new Int32Array(xyzw.buffer);

    for (let i = 0; i < n; i++) {
        data16[i * 8 + 2] = float16bits(xyzw32[i * 4 + 0]);
        data16[i * 8 + 3] = float16bits(xyzw32[i * 4 + 1]);
        data16[i * 8 + 4] = float16bits(xyzw32[i * 4 + 2]);
    }

    return data.buffer;
}

function float16bits(float32bits) {
    let b = float32bits + 0x00001000;
    let e = (b & 0x7F800000) >> 23;
    let m = b & 0x007FFFFF;
    return (b & 0x80000000) >> 16 | (e > 143) * 0x7FFF |
        (e > 112) * ((((e - 112) << 10) & 0x7C00) | m >> 13) |
        ((e < 113) & (e > 101)) * ((((0x007FF000 + m) >> (125 - e)) + 1) >> 1);
}
