import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// === Chromatic Aberration Shader (GLSL minimal) ===
const ChromaticAberrationShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "amount": { value: 0.0045 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 offset = vec2(amount, 0.0);
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `
};

// === Gravity Lens Shader ===
const GravityLensShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "lensCenter": { value: new THREE.Vector2(0.5, 0.5) },
    "strength": { value: 0.33 },
    "radius": { value: 0.22 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 lensCenter;
    uniform float strength;
    uniform float radius;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 toCenter = uv - lensCenter;
      float dist = length(toCenter);
      if (dist < radius) {
        float distortion = strength * (radius - dist) / radius;
        uv = lensCenter + normalize(toCenter) * dist * (1.0 - distortion);
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `
};

// === SCÈNE, CAMERA, RENDERER ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.set(30, 20, 50);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === LUMIÈRE ===
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const pointLight = new THREE.PointLight(0x88ffff, 1.1, 100);
pointLight.position.set(0, 6, 9);
scene.add(pointLight);

// === BOULE DE DATA BLEUE ===
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 50, 50),
  new THREE.MeshStandardMaterial({
    color: 0x44ffff,
    emissive: 0x001122,
    metalness: 0.5,
    roughness: 0.1,
    transparent: true,
    opacity: 0.4,
  })
);
sphere.position.set(0, 0, 500)
scene.add(sphere);

// === VORTEX TROU NOIR ===
const vortexPos = new THREE.Vector3(0, 0, -18);
const vortexCore = new THREE.Mesh(
  new THREE.SphereGeometry(3, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x07070a })
);
vortexCore.position.copy(vortexPos);
scene.add(vortexCore);

// === PARTICULES DISPERSÉES ===
const PARTICLE_COUNT = 1500;
const RANGE = 1500;
const positions = new Float32Array(PARTICLE_COUNT * 3);
const velocities = [];
const sizes = new Float32Array(PARTICLE_COUNT);
const alphas = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  positions[i * 3] = (Math.random() - 0.5) * RANGE;
  positions[i * 3 + 1] = (Math.random() - 0.5) * RANGE * 0.5;
  positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE - 10;
  velocities.push(new THREE.Vector3());
  sizes[i] = 0.7 + Math.random() * 0.9;
  alphas[i] = 0.12 + Math.random() * 0.13;
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

const sprite = new THREE.TextureLoader().load(
  'https://threejs.org/examples/textures/sprites/circle.png'
);
const material = new THREE.PointsMaterial({
  size: 0.5,
  map: sprite,
  color: 0x222244,
  transparent: true,
  alphaTest: 0.03,
  depthWrite: false
});
const particles = new THREE.Points(geometry, material);
scene.add(particles);

// === CAMERA LAG ===
let camTarget = new THREE.Vector3();
let camLag = 0.13;

// === MOUVEMENTS BOULE DE DATA ===
let velocity = { x: 0, z: 0 };
let target = { x: 0, z: 0 };
const accel = 0.07;
const friction = 0.987;
const maxSpeed = 0.54;

document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft") target.x = -maxSpeed;
  if (e.code === "ArrowRight") target.x = maxSpeed;
  if (e.code === "ArrowUp") target.z = -maxSpeed;
  if (e.code === "ArrowDown") target.z = maxSpeed;
});
document.addEventListener("keyup", (e) => {
  if (["ArrowLeft", "ArrowRight"].includes(e.code)) target.x = 0;
  if (["ArrowUp", "ArrowDown"].includes(e.code)) target.z = 0;
});

// === POST-PROCESSING COMPOSER & PASSES ===
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lensPass = new ShaderPass(GravityLensShader);
composer.addPass(lensPass);

const chromaPass = new ShaderPass(ChromaticAberrationShader);
composer.addPass(chromaPass);

// === ANIMATION PRINCIPALE ===
function animate(time) {
  // Boule bleue : pulsation et mouvement
  const scale = 1 + 0.09 * Math.sin(time * 0.002);
  sphere.scale.set(scale, scale, scale);
  sphere.rotation.y += 0.004;

  // Mouvement manuel avec les flèches
  velocity.x += (target.x - velocity.x) * accel;
  velocity.z += (target.z - velocity.z) * accel;
  velocity.x *= friction;
  velocity.z *= friction;
  sphere.position.x += velocity.x;
  sphere.position.z += velocity.z;

  // === ATTRACTION GRAVITATIONNELLE DE LA SPHÈRE ===
  const toVortex = vortexCore.position.clone().sub(sphere.position);
  const dist = toVortex.length();

  let gravitationalForce = Math.max(0.008, Math.min(0.035, 0.006 + 0.09 / (dist * dist)));
  if (dist < 30) gravitationalForce *= 1.3;
  const gravityDirection = toVortex.normalize();
  sphere.position.addScaledVector(gravityDirection, gravitationalForce);

  if (dist < 25) {
    sphere.material.opacity = 0.77;
    sphere.material.emissive.setHSL(Math.random(), 0.7, 0.49);
  } else {
    sphere.material.opacity = 0.40;
    sphere.material.emissive.setHex(0x001122);
  }

  if (dist < 4) {
    sphere.position.set(
      (Math.random() - 0.5) * 80,
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 80 + 40
    );
  }

  // Particules : aspiration dynamique vers vortex
  const posAttr = geometry.getAttribute('position');
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    let x = posAttr.getX(i);
    let y = posAttr.getY(i);
    let z = posAttr.getZ(i);

    const p = new THREE.Vector3(x, y, z);
    const toVortex = vortexPos.clone().sub(p);
    const d = toVortex.length();
    let attract = Math.max(0.015, Math.min(0.07, 0.011 + 0.18 / (d * d)));
    if (d < 23) attract *= 1.6;
    velocities[i].add(toVortex.normalize().multiplyScalar(attract));
    velocities[i].multiplyScalar(0.97);
    p.add(velocities[i]);
    if (d < 3.5) {
      p.x = (Math.random() - 0.5) * RANGE;
      p.y = (Math.random() - 0.5) * RANGE * 0.5;
      p.z = (Math.random() - 0.5) * RANGE - 10;
      velocities[i].set(0, 0, 0);
    }
    posAttr.setXYZ(i, p.x, p.y, p.z);
    sizes[i] = 0.8 + Math.min(3.5, Math.max(0, 8 - d)) * 0.13;
    alphas[i] = 0.11 + Math.max(0, 0.28 - d * 0.009);
  }
  posAttr.needsUpdate = true;
  geometry.attributes.size.needsUpdate = true;
  geometry.attributes.alpha.needsUpdate = true;

  // Camera lag et suivi boule
  camTarget.copy(sphere.position).add(new THREE.Vector3(0, 2, 5));
  camera.position.lerp(camTarget, camLag);
  camera.lookAt(sphere.position);

  // === POST-PROCESS: update lens center & dynamic intensity ===
  const screenVortex = vortexCore.position.clone().project(camera);
  lensPass.uniforms.lensCenter.value.set(
    (screenVortex.x + 1) / 2,
    (1 - (screenVortex.y + 1) / 2)
  );
  lensPass.uniforms.strength.value = Math.max(0.14, 0.53 - dist * 0.035);
  lensPass.uniforms.radius.value = 0.18 + Math.max(0, 0.31 - dist * 0.014);

  // Chromatic aberration dynamique selon distance (effet fort que très proche)
  chromaPass.uniforms.amount.value = dist < 10 ? 0.002 : 0.0006;

  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// === RESPONSIVE ===
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
