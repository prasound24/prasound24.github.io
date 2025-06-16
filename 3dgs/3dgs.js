import * as THREE from "three";
import { SplatMesh, PackedSplats } from "@sparkjsdev/spark";
import { OrbitControls } from "/lib/OrbitControls.js";

import { $ } from '/lib/utils.js'

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
const packedArray = await generateSplats();
const packedSplats = new PackedSplats({ packedArray });
//const params = new URLSearchParams(location.search);
//const url = params.get('s') || 'mesh/1m.spz';
const mesh = new SplatMesh({ packedSplats });
mesh.quaternion.set(1, 0, 0, 0);
mesh.position.set(0, 0, 0);
scene.add(mesh);

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

async function generateSplats() {
    return new Promise((resolve, reject) => {
        worker.postMessage({ type: 'mesh' });
        worker.onmessage = (e) => {
            resolve(new Uint32Array(e.data.res));
        };
    });
}
