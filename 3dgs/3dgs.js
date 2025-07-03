const uargs = new URLSearchParams(location.search);
const isEmbedded = uargs.get('iframe') == '1';
const [CW, CH] = (uargs.get('n') || '200x200').split('x').map(x => +x);
const SM = +uargs.get('sm') || 5;
const sid = parseFloat('0.' + (uargs.get('sid') || '')) || Math.random();
const sphRadius = +uargs.get('r') || 1.0;
const camDist = +uargs.get('cam') || 1.5;
const colRGB = (uargs.get('c') || '0.15,0.27,0.33').split(',').map(x => +x || Math.random());
const imgSize = (uargs.get('i') || '0x0').split('x').map(x => +x);
const imgBrightness = +uargs.get('b') || 1.0;
const signature = uargs.get('l') || 'prasound.com';

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

document.body.classList.toggle('debug', DEBUG && !isEmbedded);

const img = {
    get width() { return imgSize[0] || window.innerWidth; },
    get height() { return imgSize[1] || window.innerHeight; },
};

console.debug('Color palette:', colRGB.map(x => x.toFixed(2)).join(','));

const stats = { numSplats: 0 };
const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, img.width / img.height, 0.001, 1000);
camera.position.set(camDist, camDist, camDist);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(img.width, img.height, false);

const spark = new SparkRenderer({ renderer });
//spark.maxStdDev = 4;
scene.add(spark);

window.scene = scene;
window.spark = spark;

const editor = {
    view: null,
    text: () => dyno.unindent(editor.view ?
        editor.view.state.doc.toString() : $('#splat-glsl').textContent),
};

const animateTime = dyno.dynoFloat(0);
const objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
        const d = new dyno.Dyno({
            inTypes: { gsplat: dyno.Gsplat, time: "float" },
            outTypes: { gsplat: dyno.Gsplat },
            globals: () => [
                'float time = 0.;',
                dyno.unindent(editor.text())
            ],
            statements: ({ inputs, outputs }) => dyno.unindentLines(`
                time = ${inputs.time};
                ${outputs.gsplat} = ${inputs.gsplat};
                mainSplatModifier(${outputs.gsplat});
            `),
        });
        gsplat = d.apply({ gsplat, time: animateTime }).gsplat;
        return { gsplat };
    },
);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const controls = new OrbitControls(camera, canvas);
controls.minDistance = 0;
controls.maxDistance = 10;

const statsUI = new Stats();
statsUI.domElement.classList.add('debug');
statsUI.domElement.id = 'fps';
statsUI.domElement.style = isEmbedded ? 'none' : '';
document.body.appendChild(statsUI.domElement);

statsUI.domElement.addEventListener('click', (e) => {
    controls.enabled = !controls.enabled;
    console.log('controls.enabled:', controls.enabled);
});

let audio = { channels: [] };
$('#audio').onclick = initAudioMesh;

const worker = new Worker('./worker.js', { type: 'module' });
let gsm0 = await generateSplats('string');
addInterpolatedMeshes(gsm0);
console.log('Mesh size:', CW + 'x' + CH + 'x' + SM);

async function addFog() {
    const fog = await generateSplatsFn((pos, col) => {
        let r = Math.random() ** 0.5 * 2;
        let a = Math.random() * Math.PI * 2;
        let b = Math.random() * Math.PI - Math.PI / 2;

        pos[0] = r * Math.cos(a) * Math.cos(b);
        pos[2] = r * Math.sin(a) * Math.cos(b);
        pos[1] = r * Math.sin(b);
        pos[3] = 0.3;

        col[0] = 0.01;
        col[1] = 0.01;
        col[2] = 0.01;
        col[3] = 0.01;
    }, 1500, 1);

    appendMesh(fog);
}

function addInterpolatedMeshes(gsm0) {
    enumerateMeshes(gsm0, (gsm) => {
        for (let chunk of splitMeshIntoChunks(gsm)) {
            let mesh = appendMesh(chunk);
            //mesh.quaternion.set(0,0,0,0);
            mesh.recolor = new THREE.Color(imgBrightness, imgBrightness, imgBrightness);
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

    gsm.xyzw = new Float32Array(CW * CH * 4);
    gsm.rgba = new Float32Array(CW * CH * 4);

    for (let i = 0; i < SM; i++) {
        interpolateY(gsm.xyzw, gsm0.xyzw, CW, CH, (i + 0.5) / SM);
        interpolateY(gsm.rgba, gsm0.rgba, CW, CH, (i + 0.5) / SM);
        callback(gsm, i);
    }

    let SMx = SM * 0;
    gsm.xyzw = new Float32Array(CW * 4);
    gsm.rgba = new Float32Array(CW * 4);

    for (let i = 0; i < SMx; i++) {
        interpolateX(gsm.xyzw, gsm0.xyzw, [0, CW], [CH - 1, CH], (i + 0.5) / SMx);
        interpolateX(gsm.rgba, gsm0.rgba, [0, CW], [CH - 1, CH], (i + 0.5) / SMx);
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
$('#download').onclick = () => downloadMesh();

console.log('Scene size:', (stats.numSplats / 1e6).toFixed(1), 'M splats');

const tonemappingPass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
    },
    vertexShader: $('#vert-glsl').textContent,
    fragmentShader: $('#tonemapping-glsl').textContent,
});
const sunraysPass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        iTime: { value: 0 },
    },
    vertexShader: $('#vert-glsl').textContent,
    fragmentShader: $('#sunrays-glsl').textContent,
});
const vignettePass = new ShaderPass({
    uniforms: {
        tDiffuse: { value: null },
        tSignature: { value: new THREE.DataTexture(null, 1, 1) },
        tImageLogo: { value: new THREE.DataTexture(null, 1, 1) },
    },
    vertexShader: $('#vert-glsl').textContent,
    fragmentShader: $('#vignette-glsl').textContent,
});

//composer.addPass(tonemappingPass);
//composer.addPass(sunraysPass);
composer.addPass(vignettePass);

function resizeCanvas() {
    const w = img.width, h = img.height;

    if (w != canvas.width || h != canvas.height) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
}

renderer.setAnimationLoop((time) => {
    if (!controls.enabled)
        return;
    if (isEmbedded)
        scene.rotation.y = -time / 1000 * 0.1;

    animateTime.value = time / 1000;
    scene.children.map(m => m.soundform && m.updateVersion());
    resizeCanvas();
    controls.update();
    statsUI.update();
    //renderer.render(scene, camera);
    //sunraysPass.uniforms.iTime.value = time / 1000;
    composer.render();
});

window.addEventListener('resize', () => {
    setTimeout(resizeCanvas, 50);
});

initImageLogoTexture();
initSignatureTexture();
initSceneBackground();
initCodeMirror();

async function initCodeMirror() {
    const { basicSetup } = await import("/lib/codemirror/codemirror.js");
    const { EditorView } = await import("/lib/codemirror/@codemirror_view.js");
    const { glsl } = await import("/lib/codemirror/codemirror-lang-glsl.js");
    const { oneDark } = await import("/lib/codemirror/codemirror-theme-one-dark.js");

    editor.view = new EditorView({
        doc: editor.text(),
        parent: $('#codemirror'),
        extensions: [basicSetup, glsl(), oneDark],
    });

    editor.view.dom.addEventListener('focusin', (e) => {
        controls.enabled = false;
    });

    editor.view.dom.addEventListener('focusout', (e) => {
        console.log('Updating SplatMesh GLSL...');
        scene.children.map(m => m.soundform && m.updateGenerator());
        controls.enabled = true;
    });
}

function interpolateX(res, src, [xmin, xmax], [ymin, ymax], a = 0) {
    let w = xmax - xmin, h = ymax - ymin;
    check(res.length == w * h * 4);
    check(src.length >= xmax * ymax * 4);
    check(a >= 0 && a <= 1);

    for (let y = ymin; y < ymax; y++) {
        for (let x = xmin; x < xmax; x++) {
            let r4 = 4 * (w * (y - ymin) + (x - xmin));
            let i4 = 4 * (w * y + x);
            let j4 = 4 * (w * y + (x + 1) % w);

            for (let k = 0; k < 4; k++)
                res[r4 + k] = mix(src[i4 + k], src[j4 + k], a);
        }
    }
}

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
    let size = gsm0.xyzw.length, gsm2 = {};

    gsm2.xyzw = new Float32Array(stats.numSplats * 4);
    gsm2.rgba = new Float32Array(stats.numSplats * 4);

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
    let a = document.createElement('a');
    let url = URL.createObjectURL(file);
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

async function generateSplats(name = 'sphere', cw = CW, ch = CH) {
    return new Promise((resolve, reject) => {
        let ts = Date.now();
        worker.postMessage({ type: 'mesh', name, cw, ch, args: { sid, audio, r: sphRadius, rgb: colRGB } });
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

    if (sbig > 5000)
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

async function initSceneBackground() {
    let loader = new THREE.TextureLoader();
    let texture = await loader.load('/img/nature2.jpg');
    scene.background = texture;
}

async function initSignatureTexture(text = signature, em = 25) {
    const font = new FontFace("DancingScript", "url(/create/DancingScript-Regular.ttf)");
    document.fonts.add(font);
    await font.load();
    //await document.fonts.ready;

    let canvas = document.createElement('canvas');
    let ctx2d = canvas.getContext('2d');
    let ch = em; // tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent;
    let cw = em * 20; // tm.width;
    canvas.height = ch;
    canvas.width = cw;
    ctx2d.font = em + 'px DancingScript';
    ctx2d.textBaseline = 'middle';
    let tm = ctx2d.measureText(text);
    //console.debug(tm);
    canvas.width = tm.width + em;

    //ctx2d.fillStyle = '#000';
    //ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.font = em + 'px DancingScript';
    ctx2d.fillStyle = '#fff';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(text, em / 2, ch / 2);

    //document.body.append(canvas);
    vignettePass.uniforms.tSignature.value = new THREE.CanvasTexture(canvas);
}

async function initImageLogoTexture() {
    let loader = new THREE.TextureLoader();
    vignettePass.uniforms.tImageLogo.value = await loader.load('/img/favicon.png');
}
