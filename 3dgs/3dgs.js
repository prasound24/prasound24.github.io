import * as THREE from "three";
import { SplatMesh } from "@sparkjsdev/spark";
import { $ } from '/lib/utils.js'

const canvas = $('canvas#webgl');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(canvas.width, canvas.height);
canvas.style = '';

const splatURL = "scene1m.spz";
const butterfly = new SplatMesh({ url: splatURL });
butterfly.quaternion.set(1, 0, 0, 0);
butterfly.position.set(0, 0, -3);
scene.add(butterfly);

renderer.setAnimationLoop(function animate(time) {
    renderer.render(scene, camera);
    butterfly.rotation.y += 0.01;
    if (butterfly.rotation.y > 6.28)
        renderer.setAnimationLoop(null); // stop
});
