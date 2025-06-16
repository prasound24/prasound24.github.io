import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { OrbitControls } from "/lib/OrbitControls.js";

import { $ } from '/lib/utils.js'

const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, canvas.width / canvas.height, 0.1, 1000);
camera.position.set(0, 0, 1);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(canvas.width, canvas.height, false);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0);
orbit.minDistance = 0.1;
orbit.maxDistance = 10;

const params = new URLSearchParams(location.search);
const url = params.get('s') || '1m.spz';
const mesh = new SplatMesh({ url });
mesh.quaternion.set(1, 0, 0, 0);
mesh.position.set(0, 0, -3);
scene.add(mesh);

function resizeCanvas() {
    const width = canvas.width;
    const height = canvas.height;
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
