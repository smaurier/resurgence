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
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
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
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
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

// === Vignette Shader ===
const VignetteShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "offset": { value: 1.1 },
    "darkness": { value: 1.5 },
    "opacity": { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    uniform float opacity;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = distance(vUv, vec2(0.5,0.5));
      float vignette = smoothstep(offset, 0.8, dist);
      color.rgb = mix(color.rgb, color.rgb * (1.0 - darkness * vignette * opacity), opacity);
      gl_FragColor = color;
    }
  `
};

let hasCollided = false;

// === AUDIO IN UTERO ===
const audio = new Audio('/assets/inutero.mp3');
audio.loop = true;

// Web AudioContext (pour mix immersif et fade doux)
let ctx, source, gainNode, filterNode;
let audioStarted = false;
let targetGain = 1.0, currentGain = 1.0, fading = false;

// Audio init
function startAudio() {
  if (audioStarted) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  source = ctx.createMediaElementSource(audio);
  gainNode = ctx.createGain();
  filterNode = ctx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 10000;

  source.connect(filterNode).connect(gainNode).connect(ctx.destination);
  gainNode.gain.value = 0.7; // volume de base, tu peux augmenter/diminuer
  currentGain = 0.7;
  targetGain = 0.7;

  audio.play();
  audioStarted = true;
}

// Intensité immersive, lissage doux (utilisé dans animate)
function setAudioIntensity(intensity) {
  if (!audioStarted) return;
  // Clamp intensity entre 0 et 1.2 max pour booster un peu si besoin
  intensity = Math.max(0, Math.min(1.2, intensity));
  targetGain = 0.13 + 0.95 * intensity; // ajuste ce que tu veux (min/max)

  // Effet compression sonore, effet "enfermement" in utero
  filterNode.frequency.value = 800 + 8000 * (1 - intensity);

  // On ne set plus directement le gain, on fait un lissage progressif
}

// Fade out lissé sur plusieurs frames
function fadeOutAudio(duration = 1900) {
  if (!audioStarted || fading) return;
  fading = true;
  const start = currentGain;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    currentGain = start * (1 - t);
    gainNode.gain.value = currentGain;
    if (t < 1) requestAnimationFrame(step);
    else {
      audio.pause();
      audioStarted = false;
      fading = false;
      gainNode.gain.value = 0;
      currentGain = 0;
    }
  }
  requestAnimationFrame(step);
}

// On démarre l’audio à la première touche
window.addEventListener('keydown', startAudio, { once: true });

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
sphere.position.set(0, 0, 1000);
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

// === BOULE VITESSE & INPUT ===
let sphereVelocity = new THREE.Vector3(0, 0, 0);
const playerAccel = 0.13;
const friction = 0.992;
const maxSpeed = 1.35;

let moveTarget = { x: 0, z: 0 };

document.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft") moveTarget.x = -1;
  if (e.code === "ArrowRight") moveTarget.x = 1;
  if (e.code === "ArrowUp") moveTarget.z = -1;
  if (e.code === "ArrowDown") moveTarget.z = 1;
});
document.addEventListener("keyup", (e) => {
  if (["ArrowLeft", "ArrowRight"].includes(e.code)) moveTarget.x = 0;
  if (["ArrowUp", "ArrowDown"].includes(e.code)) moveTarget.z = 0;
});

// === POST-PROCESSING ===
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lensPass = new ShaderPass(GravityLensShader);
composer.addPass(lensPass);
const chromaPass = new ShaderPass(ChromaticAberrationShader);
composer.addPass(chromaPass);
const vignettePass = new ShaderPass(VignetteShader);
composer.addPass(vignettePass);

// === ANIMATION PRINCIPALE ===
function animate(time) {
  // Visuel boule : pulsation
  const scale = 1 + 0.09 * Math.sin(time * 0.002);
  sphere.scale.set(scale, scale, scale);
  sphere.rotation.y += 0.004;

  // --- Gravité newtonienne pure + bruit ---
  const toVortex = vortexCore.position.clone().sub(sphere.position);
  const dist = toVortex.length();
  const dirToVortex = toVortex.normalize();

  // --- AUDIO : Intensité du son suivant la proximité
  let intensity = 2 - Math.min(1, dist / 160);
  setAudioIntensity(intensity);

  // === Lissage volume audio chaque frame ===
  if (audioStarted && !fading) {
    // interpolation très douce pour éviter tout saut sonore, même en cas de lag
    currentGain += (targetGain - currentGain) * 0.04;
    gainNode.gain.value = currentGain;
  }

  // -- Paramètre Newton "pur" --
  let K = 5 + 1800 * Math.min(1, (dist - 10) / 400);
  let gravStrength = K / (dist * dist);

  // --- Bruit directionnel (petite incertitude) ---
  const noiseAmplitude = 0.005 * Math.max(0.1, 1 - dist / 100);
  const angle = Math.sin(time * 0.0017) * Math.PI * 2 + Math.cos(time * 0.00113);
  const noise = new THREE.Vector3(
    Math.sin(angle + 0.6) * noiseAmplitude,
    Math.sin(angle - 0.3) * noiseAmplitude * 0.55,
    Math.cos(angle + 0.3) * noiseAmplitude
  );

  sphereVelocity.addScaledVector(dirToVortex, gravStrength);
  sphereVelocity.add(noise);

  // Contrôle joueur (accélération X/Z, inertie)
  const moveVec = new THREE.Vector3(moveTarget.x, 0, moveTarget.z).normalize().multiplyScalar(playerAccel);
  if (moveTarget.x !== 0 || moveTarget.z !== 0) {
    sphereVelocity.add(moveVec);
  }

  // Clamp vitesse
  if (sphereVelocity.length() > maxSpeed) sphereVelocity.setLength(maxSpeed);

  // Friction
  sphereVelocity.multiplyScalar(friction);

  // Update position
  sphere.position.add(sphereVelocity);

  // Engloutissement ?
  if (!hasCollided && dist < 1) {
    hasCollided = true;
    fadeOutAudio();
    console.log("Boule engloutie !");
    // TODO : Transition visuelle/fondu
  }

  // --- PARTICULES ---
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

    const t = time * 0.001;
    const phase = i * 0.07;
    sizes[i] = 0.8 + Math.min(3.5, Math.max(0, 8 - d)) * 0.13 + 0.20 * Math.sin(t + phase);
    alphas[i] = 0.11 + Math.max(0, 0.28 - d * 0.009) + 0.10 + 0.08 * Math.sin(phase * 3) * Math.sin(t * 0.9 + phase);
  }
  posAttr.needsUpdate = true;
  geometry.attributes.size.needsUpdate = true;
  geometry.attributes.alpha.needsUpdate = true;

  // Camera lag et suivi boule
  camTarget.copy(sphere.position).add(new THREE.Vector3(0, 2, 5));
  camera.position.lerp(camTarget, camLag);
  camera.lookAt(sphere.position);

  // --- POST-PROCESS ---
  const screenVortex = vortexCore.position.clone().project(camera);
  lensPass.uniforms.lensCenter.value.set(
    (screenVortex.x + 1) / 2,
    (1 - (screenVortex.y + 1) / 2)
  );
  lensPass.uniforms.strength.value = Math.max(0.14, 0.53 - dist * 0.035);
  lensPass.uniforms.radius.value = 0.18 + Math.max(0, 0.31 - dist * 0.014);
  chromaPass.uniforms.amount.value = dist < 10 ? 0.005 : 0.0006;

  let maxDist = 7, minDist = 0;
  let vignetteStrength = 1 - Math.min(1, Math.max(0, (dist - minDist) / (maxDist - minDist)));
  vignettePass.uniforms.opacity.value = vignetteStrength * 0.92;

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
