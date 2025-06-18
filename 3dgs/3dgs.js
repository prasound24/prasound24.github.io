import * as THREE from "three";
import { SparkRenderer, SplatMesh, PackedSplats, transcodeSpz } from "@sparkjsdev/spark";
import { OrbitControls } from "/lib/OrbitControls.js";

import { $, mix, clamp, check } from '../lib/utils.js'
import { exportPLY } from "../lib/ply.js";

const stats = { numSplats: 0 };
const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 1000);
camera.position.set(1, 1, 1);
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight, false);

const spark = new SparkRenderer({ renderer });
scene.add(spark);
//scene.add(camera);
//camera.add(spark);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0);
orbit.minDistance = 0;
orbit.maxDistance = 10;

const urlparams = new URLSearchParams(location.search);
const [CW, CH, SM] = (urlparams.get('n') || '640x360x4').split('x').map(x => +x);
const sid = parseFloat('0.' + (urlparams.get('sid') || '')) || Math.random();
const worker = new Worker('./worker.js', { type: 'module' });
const { xyzw, rgba } = await generateSplats('string');

enumerateMeshes((tmp_xyzw, tmp_rgba) => {
    let mesh = appendMesh(tmp_xyzw, tmp_rgba);
    //mesh.recolor = new THREE.Color(3, 3, 3);
    mesh.opacity = 0.5; // 1 / SM;
});

function enumerateMeshes(callback) {
    const tmp_xyzw = xyzw.slice();
    const tmp_rgba = rgba.slice();

    for (let i = 0; i < SM; i++) {
        interpolateY(tmp_xyzw, xyzw, CW, CH, (i + 0.5) / SM);
        interpolateY(tmp_rgba, rgba, CW, CH, (i + 0.5) / SM);
        callback(tmp_xyzw, tmp_rgba, i);
    }
}

function appendMesh(xyzw, rgba) {
    const packedSplats = new PackedSplats({
        packedArray: packSplats(xyzw, rgba),
        //fileBytes: await exportPLY(CW, CH, xyzw, rgba).bytes(),
    });
    const mesh = new SplatMesh({ packedSplats });
    mesh.quaternion.set(1, 0, 0, 0);
    mesh.position.set(0, 0, 0);
    scene.add(mesh);
    stats.numSplats += rgba.length / 4;
    return mesh;
}

//let sph = await generateSplats('sphere');
//let sphMesh = await appendMesh(sph.xyzw, sph.rgba);
//sphMesh.scale.set(2, 2, 2);

//let fog = generateSplatsFn((pos, col, i, n) => {
//    pos[3] = 0.33;
//}, 1);
//appendMesh(fog.xyzw, fog.rgba);

window.scene = scene;
window.THREE = THREE;
window.downloadMesh = downloadMesh;

console.log('Total:', (stats.numSplats / 1e6).toFixed(1), 'M splats');

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
    //scene.rotation.y -= 0.002;
});

function interpolateY(res, src, w, h, a = 0) {
    check(res.length == w * h * 4);
    check(src.length == w * h * 4);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let t = Math.floor(y / (h - 1) * (h - 2));
            let i = x + w * t;
            let j = x + w * (t + 1);

            for (let k = 0; k < 4; k++)
                res[i * 4 + k] = mix(src[i * 4 + k], src[j * 4 + k], a);
        }
    }
}

async function downloadMesh(type = 'ply') {
    let merged_xyzw = new Float32Array(xyzw.length * SM);
    let merged_rgba = new Float32Array(rgba.length * SM);
    enumerateMeshes((x, r, i) => {
        merged_xyzw.set(x, i * x.length);
        merged_rgba.set(r, i * r.length);
        console.log('Generated mesh', i + 1, 'out of', SM);
    });

    console.log('Creating a .ply file...');
    const ply = exportPLY(CW * SM, CH, merged_xyzw, merged_rgba);
    console.log('.ply file size:', (ply.size / 1e6).toFixed(1), 'MB');
    check(ply.size > 0);

    if (type == 'ply') {
        let file = new File([ply], 'soundform.ply');
        console.log(URL.createObjectURL(file));
        return;
    }

    if (type == 'spz') {
        console.log('Creating a .spz file... (slow)');
        let res = await transcodeSpz({
            inputs: [{
                fileBytes: await ply.bytes(),
                pathOrUrl: 'soundform.ply',
            }],
            maxSh: 0,
            fractionalBits: 16,
            opacityThreshold: 0.0001,
        });

        let spz = new Blob([res.fileBytes],
            { type: "application/octet-stream" });
        let file = new File([spz], 'soundform.spz');
        let url = URL.createObjectURL(file);
        console.log(url);
        //let a = document.createElement('a');
        //a.download = 'soundform.spz';
        //a.href = url;
        //a.click();
        //URL.revokeObjectURL(url);
    }
}

async function generateSplats(name = 'sphere', cw = CW, ch = CH) {
    return new Promise((resolve, reject) => {
        let ts = Date.now();
        worker.postMessage({ type: 'mesh', name, cw, ch, args: { sid } });
        worker.onmessage = (e) => {
            let { xyzw, rgba } = e.data;
            xyzw = new Float32Array(xyzw);
            rgba = new Float32Array(rgba);
            check(xyzw.length == cw * ch * 4);
            check(rgba.length == cw * ch * 4);
            console.debug('generateSplats:', Date.now() - ts, 'ms',
                (rgba.length / 4e6).toFixed(1), 'M splats, SID:', sid);
            resolve({ xyzw, rgba });
        };
    });
}

function generateSplatsFn(fn, n = 1) {
    let xyzw = new Float32Array(n * 4);
    let rgba = new Float32Array(n * 4);

    let pos = new Float32Array(4);
    let col = new Float32Array(4);

    for (let i = 0; i < n; i++) {
        pos.fill(0);
        col.fill(1);
        fn(pos, col, i, n);
        xyzw.set(pos, i * 4);
        rgba.set(col, i * 4);
    }

    return { xyzw, rgba };
}

// https://sparkjs.dev/docs/packed-splats
function packSplats(xyzw, rgba) {
    let n = xyzw.length / 4;
    let m = Math.ceil(n / 2048) * 2048;
    let sbig = 0;

    let uint32 = new Int32Array(xyzw.buffer);
    let bytes = new Uint8ClampedArray(m * 16);
    let data = new DataView(bytes.buffer);

    for (let i = 0; i < n; i++) {
        bytes[i * 16 + 0] = rgba[i * 4 + 0] * 255; //  R
        bytes[i * 16 + 1] = rgba[i * 4 + 1] * 255; //  G
        bytes[i * 16 + 2] = rgba[i * 4 + 2] * 255; //  B
        bytes[i * 16 + 3] = rgba[i * 4 + 3] * 255; //  A

        data.setInt16(i * 16 + 4, float16(uint32[i * 4 + 0]), true); // X
        data.setInt16(i * 16 + 6, float16(uint32[i * 4 + 1]), true); // Y
        data.setInt16(i * 16 + 8, float16(uint32[i * 4 + 2]), true); // Z

        let s = xyzw[i * 4 + 3]; // W
        let logs = (Math.log(s) / 9 + 1) / 2 * 255;
        logs = clamp(Math.round(logs), 1, 255);
        if (s <= 0) logs = 0;

        if (s > 0.03) sbig++;

        bytes[i * 16 + 12] = logs; //  X scale
        bytes[i * 16 + 13] = logs; //  Y scale
        bytes[i * 16 + 14] = logs; //  Z scale
    }

    if (sbig > 1000)
        throw new Error('Too many big splats: ' + sbig);

    return new Uint32Array(data.buffer);
}

function float16(float32) {
    let b = float32 + 0x00001000;
    let e = (b & 0x7F800000) >> 23;
    let m = b & 0x007FFFFF;
    return (b & 0x80000000) >> 16 | (e > 143) * 0x7FFF |
        (e > 112) * ((((e - 112) << 10) & 0x7C00) | m >> 13) |
        ((e < 113) & (e > 101)) * ((((0x007FF000 + m) >> (125 - e)) + 1) >> 1);
}
