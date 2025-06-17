import * as THREE from "three";
import { SplatMesh, PackedSplats, transcodeSpz } from "@sparkjsdev/spark";
import { OrbitControls } from "/lib/OrbitControls.js";

import { $, mix, check } from '../lib/utils.js'
import { exportPLY } from "../lib/ply.js";

const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 3);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight, false);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0);
orbit.minDistance = 0.1;
orbit.maxDistance = 10;

const worker = new Worker('./worker.js', { type: 'module' });
const [CW, CH, SM] = [640, 360, 4];
const { xyzw, rgba } = await generateSplats();

//const params = new URLSearchParams(location.search);
//const url = params.get('s') || 'mesh/1m.spz';

//const blob = exportPLY(CW, CH * NMUL, xyzw, rgba);
//const fileBytes = await blob.bytes();

const tmp_xyzw = xyzw.slice();
const tmp_rgba = rgba.slice();

for (let i = 0; i < SM; i++) {
    interpolateY(tmp_xyzw, xyzw, CW, CH, i / SM);
    interpolateY(tmp_rgba, rgba, CW, CH, i / SM);
    const packedArray = packSplats(tmp_xyzw, tmp_rgba);
    const packedSplats = new PackedSplats({ packedArray });
    const mesh = new SplatMesh({ packedSplats });
    mesh.quaternion.set(1, 0, 0, 0);
    mesh.position.set(0, 0, 0);
    mesh.recolor = new THREE.Color(4, 2, 1);
    mesh.opacity = 0.5;
    scene.add(mesh);
    console.log('Added mesh', i + 1, 'out of', SM);
}

console.log('Total:', (CW * CH * SM / 1e6).toFixed(1), 'M splats');

window.scene = scene;
window.THREE = THREE;

function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (width != canvas.width || height != canvas.height) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
}

window.addEventListener('resize', () => {
    setTimeout(resizeCanvas, 50);
});

renderer.setAnimationLoop((time) => {
    resizeCanvas();
    orbit.update();
    renderer.render(scene, camera);
});

function interpolateY(res, src, w, h, a = 0) {
    check(res.length == w * h * 4);
    check(src.length == w * h * 4);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let i = x + w * y;
            let j = x + w * Math.min(y + 1, h - 1);

            for (let k = 0; k < 4; k++)
                res[i * 4 + k] = mix(src[i * 4 + k], src[j * 4 + k], a);
        }
    }
}

async function downloadSpz() {
    const blob = exportPLY(CW, CH * NMUL, xyzw, rgba);
    const fileBytes = await blob.bytes();

    check(fileBytes.length > 0);

    let transcode = await transcodeSpz({
        inputs: [{ fileBytes, pathOrUrl: 'mesh.ply' }],
        maxSh: 3,
        fractionalBits: 12,
        opacityThreshold: 0
    });

    let spz = new Blob([transcode.fileBytes],
        { type: "application/octet-stream" });
    let url = URL.createObjectURL(spz);
    let a = document.createElement('a');
    a.download = 'mesh.spz';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

async function generateSplats(cw = CW, ch = CH) {
    return new Promise((resolve, reject) => {
        let ts = Date.now();
        worker.postMessage({ type: 'mesh', cw, ch });
        worker.onmessage = (e) => {
            let { xyzw, rgba } = e.data;
            xyzw = new Float32Array(xyzw);
            rgba = new Float32Array(rgba);
            check(xyzw.length == cw * ch * 4);
            check(rgba.length == cw * ch * 4);
            console.debug('generateSplats:', Date.now() - ts, 'ms',
                (rgba.length / 4e6).toFixed(1), 'M splats');
            resolve({ xyzw, rgba });
        };
    });
}

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

    return new Uint32Array(data.buffer);
}

function float16bits(float32bits) {
    let b = float32bits + 0x00001000;
    let e = (b & 0x7F800000) >> 23;
    let m = b & 0x007FFFFF;
    return (b & 0x80000000) >> 16 | (e > 143) * 0x7FFF |
        (e > 112) * ((((e - 112) << 10) & 0x7C00) | m >> 13) |
        ((e < 113) & (e > 101)) * ((((0x007FF000 + m) >> (125 - e)) + 1) >> 1);
}
