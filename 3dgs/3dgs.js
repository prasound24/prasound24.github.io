import * as THREE from "three";
import { SplatMesh, PackedSplats } from "@sparkjsdev/spark";
import { OrbitControls } from "/lib/OrbitControls.js";

import { $ } from '/lib/utils.js'
import { createMesh } from './mesh/sphere.js';
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

let { xyzw, rgba } = createMesh(1280, 720);
//let packedSplats = packSplats(xyzw, rgba);
let blob = exportPLY(1280, 720, xyzw, rgba);
let fileBytes = await blob.bytes();

//const params = new URLSearchParams(location.search);
//const url = params.get('s') || 'mesh/1m.spz';
const mesh = new SplatMesh({ fileBytes });
mesh.quaternion.set(1, 0, 0, 0);
mesh.position.set(0, 0, 0);
scene.add(mesh);

function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (width == canvas.width && height == canvas.height)
        return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

window.addEventListener('resize', () => {
    setTimeout(resizeCanvas, 50);
});

renderer.setAnimationLoop((time) => {
    resizeCanvas();
    orbit.update();
    renderer.render(scene, camera);
});

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

    return new PackedSplats({
        numSplats: n,
        packedArray: new Uint32Array(data.buffer),
    });
}

function float16bits(float32bits) {
    let b = float32bits + 0x00001000;
    let e = (b & 0x7F800000) >> 23;
    let m = b & 0x007FFFFF;
    return (b & 0x80000000) >> 16 | (e > 143) * 0x7FFF |
        (e > 112) * ((((e - 112) << 10) & 0x7C00) | m >> 13) |
        ((e < 113) & (e > 101)) * ((((0x007FF000 + m) >> (125 - e)) + 1) >> 1);
}
