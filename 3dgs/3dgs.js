const urlparams = new URLSearchParams(location.search);
const isEmbedded = urlparams.get('iframe') == '1';

import * as THREE from "three";
import Stats from 'three/addons/libs/stats.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh, PackedSplats, dyno } from "@sparkjsdev/spark";

import { $, mix, clamp, check, fract, selectAudioFile, decodeAudioFile2, DEBUG } from '../lib/utils.js'
import { exportPLY } from "../lib/ply.js";

if (!isEmbedded) {
    $('h1').style.display = '';
    $('.wave_spanner').style.display = '';
}

document.body.classList.toggle('debug', DEBUG);

const imgSize = (urlparams.get('i') || '0x0').split('x').map(x => +x);
const wsize = (i) => imgSize[i] || (i == 0 ? window.innerWidth : window.innerHeight);

const stats = { numSplats: 0 };
const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, wsize(0) / wsize(1), 0.001, 1000);
camera.position.set(1, 1, 1);
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(wsize(0), wsize(1), false);

const spark = new SparkRenderer({ renderer, maxStdDev: 3.5 });
scene.add(spark);
//scene.add(camera);
//camera.add(spark);

import { basicSetup } from "/lib/codemirror/codemirror.js";
import { EditorView } from "/lib/codemirror/@codemirror_view.js";
import * as langGLSL from "/lib/codemirror/codemirror-lang-glsl.js";

const editor = new EditorView({
    doc: dyno.unindent(`
        void mainObjectModifier(inout Gsplat gs, float time) {
            // gs.rgba, gs.center, gs.scales, gs.index
        }`),
    parent: $('#codemirror'),
    extensions: [basicSetup, langGLSL.glsl()],
});

const animateT = dyno.dynoFloat(0);
const objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
        const d = new dyno.Dyno({
            inTypes: { gsplat: dyno.Gsplat, time: "float" },
            outTypes: { gsplat: dyno.Gsplat },
            globals: () => [
                dyno.unindent(editor.state.doc.toString())
            ],
            statements: ({ inputs, outputs }) => dyno.unindentLines(`
                ${outputs.gsplat} = ${inputs.gsplat};
                mainObjectModifier(${outputs.gsplat}, ${inputs.time});
            `),
        });
        gsplat = d.apply({ gsplat, time: animateT }).gsplat;
        return { gsplat };
    },
);

const composer = new EffectComposer(renderer);
const shaderPass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
    },
    vertexShader: `
        out vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
    fragmentShader: `
        uniform float amount;
        uniform sampler2D tDiffuse;
        in vec2 vUv;

        float vignette() {
            vec2 uv = vUv;
            uv.xy *= 1. - uv.yx;
            float v = uv.x * uv.y * 15.0;
            return pow(v, 0.125);
        }

        void main() {
          vec4 o = texture(tDiffuse, vUv);
          o = tanh(o*o)*vignette();
          o.a = 1.0;
          gl_FragColor = o;
        }`,
});
composer.addPass(new RenderPass(scene, camera));
composer.addPass(shaderPass);

const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 0, 0);
orbit.minDistance = 0;
orbit.maxDistance = 10;

const statsUI = new Stats();
statsUI.domElement.id = 'fps';
if (!isEmbedded)
    document.body.appendChild(statsUI.domElement);

let audio = { channels: [] };
$('#audio').onclick = initAudioMesh;

const [CW, CH, SM = 1] = (urlparams.get('n') || '640x450x4').split('x').map(x => +x);
const sid = parseFloat('0.' + (urlparams.get('sid') || '')) || Math.random();
const worker = new Worker('./worker.js', { type: 'module' });

let gsm0 = await generateSplats('string');
addInterpolatedMeshes(gsm0);

//const fog = await generateSplatsFn((pos, col) => {
//    let r = Math.random() ** 0.5 * 2;
//    let a = Math.random() * Math.PI * 2;
//    let b = Math.random() * Math.PI / 2;
//
//    pos[0] = r * Math.cos(a) * Math.cos(b);
//    pos[2] = r * Math.sin(a) * Math.cos(b);
//    pos[1] = r * Math.sin(b);
//    pos[3] = 0.2;
//
//    col[0] = 0.02;
//    col[1] = 0.02;
//    col[2] = 0.02;
//    col[3] = 0.01;
//}, 1000, 1);
//appendMesh(fog);

function addInterpolatedMeshes(gsm0) {
    enumerateMeshes(gsm0, (gsm) => {
        for (let chunk of splitMeshIntoChunks(gsm)) {
            let mesh = appendMesh(chunk);
            //mesh.recolor = new THREE.Color(2, 2, 2);
            //mesh.opacity = 0.5; // 1 / SM;
        }
    });
}

function splitMeshIntoChunks(gsm, chunk = CW * 512) {
    let chunks = [];
    let n = gsm.rgba.length / 4;

    for (let i = 0; i < n; i += chunk) {
        let xyzw = gsm.xyzw.slice(i * 4, (i + chunk) * 4);
        let rgba = gsm.rgba.slice(i * 4, (i + chunk) * 4);
        chunks.push({ xyzw, rgba });
    }

    return chunks;
}

function enumerateMeshes(gsm0, callback) {
    const gsm = {};

    gsm.xyzw = gsm0.xyzw.slice();
    gsm.rgba = gsm0.rgba.slice();

    for (let i = 0; i < SM; i++) {
        interpolateY(gsm.xyzw, gsm0.xyzw, CW, CH, (i + 0.5) / SM);
        interpolateY(gsm.rgba, gsm0.rgba, CW, CH, (i + 0.5) / SM);
        callback(gsm, i);
    }
}

function appendMesh(gsm) {
    const packedSplats = new PackedSplats({
        packedArray: packSplats(gsm),
        //fileBytes: await exportPLY(CW, CH, xyzw, rgba).bytes(),
    });
    const mesh = new SplatMesh({ packedSplats });
    mesh.soundform = true;
    mesh.objectModifier = objectModifier;
    //mesh.quaternion.set(1, 0, 0, 0);
    //mesh.position.set(0, 0, 0);
    scene.add(mesh);
    mesh.updateGenerator();
    stats.numSplats += gsm.rgba.length / 4;
    return mesh;
}

function clearScene() {
    scene.children.map(m => scene.remove(m));
    scene.add(spark);
    stats.numSplats = 0;
}

//let sph = await generateSplats('sphere');
//let sphMesh = await appendMesh(sph.xyzw, sph.rgba);
//sphMesh.scale.set(2, 2, 2);

//let fog = generateSplatsFn((pos, col, i, n) => {
//    pos[3] = 0.33;
//}, 1);
//appendMesh(fog.xyzw, fog.rgba);

//window.scene = scene;
//window.downloadMesh = downloadMesh;

console.log('Total:', (stats.numSplats / 1e6).toFixed(1), 'M splats');

function resizeCanvas() {
    const w = wsize(0), h = wsize(1);

    if (w != canvas.width || h != canvas.height) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
}

window.addEventListener('resize', () => {
    setTimeout(resizeCanvas, 50);
});

renderer.setAnimationLoop((time) => {
    if (isEmbedded)
        scene.rotation.y = time / 1000 * 0.1;

    animateT.value = time / 1000;
    scene.children.map(m => m.soundform && m.updateVersion());
    resizeCanvas();
    orbit.update();
    statsUI.update();
    //renderer.render(scene, camera);
    composer.render();
});

editor.dom.addEventListener('focusout', (e) => {
    console.log('Updating SplatMesh GLSL...');
    scene.children.map(m => m.soundform && m.updateGenerator());
});

function interpolateY(res, src, w, h, a = 0) {
    check(res.length == w * h * 4);
    check(src.length == w * h * 4);
    check(a >= 0 && a <= 1);

    for (let y = 0; y < h; y++) {
        let t = (y + a) / h * (h - 1);
        let s = fract(t);
        check(t >= 0 && t <= h - 1);

        for (let x = 0; x < w; x++) {
            let i4 = 4 * (x + w * Math.floor(t));
            let j4 = 4 * (x + w * Math.ceil(t));
            let r4 = 4 * (x + w * y);

            for (let k = 0; k < 4; k++)
                res[r4 + k] = mix(src[i4 + k], src[j4 + k], s);
        }
    }
}

async function downloadMesh() {
    let size = xyzw.length, gsm2 = {};

    gsm2.xyzw = new Float32Array(size * SM);
    gsm2.rgba = new Float32Array(size * SM);

    enumerateMeshes(gsm0, (gsm, i) => {
        gsm2.xyzw.set(gsm.xyzw, i * size);
        gsm2.rgba.set(gsm.rgba, i * size);
        console.log('Generated mesh', i + 1, 'out of', SM);
    });

    console.log('Creating a .ply file...');
    const ply = exportPLY(gsm2.xyzw.length / 4, 1, gsm2.xyzw, gsm2.rgba);
    console.log('.ply file size:', (ply.size / 1e6).toFixed(1), 'MB');
    check(ply.size > 0);

    let file = new File([ply], 'soundform.ply');
    console.log(URL.createObjectURL(file));
}

async function generateSplats(name = 'sphere', cw = CW, ch = CH) {
    return new Promise((resolve, reject) => {
        let ts = Date.now();
        worker.postMessage({ type: 'mesh', name, cw, ch, args: { sid, audio } });
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

function generateSplatsFn(fn, w = CW, h = CH) {
    let xyzw = new Float32Array(w * h * 4);
    let rgba = new Float32Array(w * h * 4);

    let pos = new Float32Array(4);
    let col = new Float32Array(4);

    for (let i = 0; i < w * h; i++) {
        pos.fill(0);
        col.fill(1);
        fn(pos, col, i / w | 0, i % w, w, h);
        xyzw.set(pos, i * 4);
        rgba.set(col, i * 4);
    }

    return { xyzw, rgba };
}

// https://sparkjs.dev/docs/packed-splats
function packSplats({ xyzw, rgba }) {
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

async function initAudioMesh() {
    let blob = await selectAudioFile();
    if (!blob) return;
    audio.channels = await decodeAudioFile2(blob);
    console.log('Opened ' + blob.name + ':',
        audio.channels.map(ch => ch.length).join(','), 'samples');
    clearScene();
    gsm0 = await generateSplats('audio');
    let chunks = splitMeshIntoChunks(gsm0);
    console.debug('Mesh split into', chunks.length, 'chunks');
    chunks.map(gsm => appendMesh(gsm));
}
