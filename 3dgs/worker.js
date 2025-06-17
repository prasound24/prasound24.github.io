import { createMesh } from './mesh/string.js';

self.onmessage = (e) => {
    let { type, txid, cw, ch } = e.data;
    if (type != 'mesh')
        throw new Error('Invalid command: ' + type);
    let { xyzw, rgba } = createMesh(cw, ch);
    postMessage({ txid, xyzw, rgba },
        [xyzw.buffer, rgba.buffer]);
};
