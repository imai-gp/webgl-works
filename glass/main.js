import * as THREE from 'three';

// ── GLSL シェーダー（インライン） ─────────────────────────────

const vertexShader = /* glsl */`
uniform float uTime;
uniform float uNoiseStrength;
uniform float uNoiseFreq;

varying vec3 vNormal;    // view space（refract()用）
varying vec3 vViewPos;   // view space position（incident ray用）

// Simplex 3D noise
vec3 mod289_3(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_4(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289_4(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289_3(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vec3 pos = position;

  float noise = snoise(pos * uNoiseFreq + uTime * 0.25);
  noise += 0.5 * snoise(pos * uNoiseFreq * 2.0 + uTime * 0.4);
  noise *= 0.667;

  float disp = noise * uNoiseStrength;
  pos += normal * disp;

  vNormal = normalize(normalMatrix * (normal + normal * disp * 0.8));

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  vViewPos   = mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const fragmentShader = /* glsl */`
uniform sampler2D backgroundTex;
uniform sampler2D envMap;
uniform vec2      uResolution;
uniform float     uIor;
uniform float     uThickness;
uniform float     uAberration;
uniform float     uEnvIntensity; // 環境マップ反射強度

varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  vec2 screenUV = gl_FragCoord.xy / uResolution;

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;

  vec3 incident = normalize(vViewPos);

  float ndotv  = max(dot(n, -incident), 0.0);
  float fresnel = pow(1.0 - ndotv, 3.0);

  // ── IORベース色収差屈折 ───────────────────────────────────────
  float iorR = uIor - uAberration;
  float iorG = uIor;
  float iorB = uIor + uAberration;

  vec3 refR = refract(incident, n, 1.0 / iorR);
  vec3 refG = refract(incident, n, 1.0 / iorG);
  vec3 refB = refract(incident, n, 1.0 / iorB);

  vec2 uvR = screenUV + (refR.xy - incident.xy) * uThickness;
  vec2 uvG = screenUV + (refG.xy - incident.xy) * uThickness;
  vec2 uvB = screenUV + (refB.xy - incident.xy) * uThickness;

  float r = texture2D(backgroundTex, uvR).r;
  float g = texture2D(backgroundTex, uvG).g;
  float b = texture2D(backgroundTex, uvB).b;

  vec3 color = vec3(r, g, b);

  // ── 環境マッピング ────────────────────────────────────────────
  vec3 reflView = reflect(incident, n);
  mat3 vm = mat3(viewMatrix);
  vec3 reflWorld = normalize(vec3(
    dot(vm[0], reflView),
    dot(vm[1], reflView),
    dot(vm[2], reflView)
  ));

  #define PI 3.14159265359
  vec2 envUV = vec2(
    atan(reflWorld.z, reflWorld.x) / (2.0 * PI) + 0.5,
    asin(clamp(reflWorld.y, -1.0, 1.0)) / PI + 0.5
  );
  vec3 envColor = texture2D(envMap, envUV).rgb;

  // Fresnelで屈折と反射をブレンド（uEnvIntensityで強度調整）
  color = mix(color, envColor, fresnel * uEnvIntensity);

  color += pow(fresnel, 5.0) * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;

// ── 背景テキスト Canvas ───────────────────────────────────────
const bgCanvas = document.createElement('canvas');
const bgCtx = bgCanvas.getContext('2d');

function redrawBgCanvas() {
  const W   = window.innerWidth;
  const H   = window.innerHeight;
  const dpr = Math.min(devicePixelRatio, 2);

  bgCanvas.width  = W * dpr;
  bgCanvas.height = H * dpr;
  bgCtx.scale(dpr, dpr);

  bgCtx.fillStyle = '#000000';
  bgCtx.fillRect(0, 0, W, H);

  // CSS の clamp(80px, 22vw, 400px) と揃える
  const fontSize = Math.min(Math.max(80, W * 0.22), 400);
  // ブロブが屈折で参照するテクスチャのメインテキスト色
  bgCtx.fillStyle = '#E7E9E8';
  bgCtx.font = `bold ${fontSize}px Poppins`;
  bgCtx.textAlign = 'center';
  bgCtx.textBaseline = 'middle';

  const lineH = fontSize * 0.9;
  bgCtx.fillText('GLASS',    W / 2, H / 2 - lineH * 0.52);
  bgCtx.fillText('MATERIAL', W / 2, H / 2 + lineH * 0.52);

  // 右上メタ
  bgCtx.fillStyle = '#DFE5E2';
  bgCtx.font = `bold 11px Poppins`;
  bgCtx.textAlign = 'right';
  bgCtx.textBaseline = 'top';
  bgCtx.fillText('COLLECTION 001', W - 40, 32);
  bgCtx.fillText('2026',            W - 40, 52);

  // 左下メタ
  bgCtx.textAlign = 'left';
  bgCtx.textBaseline = 'bottom';
  bgCtx.fillText('WEBGL · THREE.JS', 40, H - 48);
  bgCtx.fillText('GLASS BLOB',       40, H - 28);
}

// ── デバイス判定 ─────────────────────────────────────────────
const isMobile = () => window.innerWidth <= 640;

// ── Three.js セットアップ ─────────────────────────────────────
const canvas = document.getElementById('webgl');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
const getDpr   = () => Math.min(devicePixelRatio, isMobile() ? 1.5 : 2);
renderer.setPixelRatio(getDpr());
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

// ── 背景テクスチャ ────────────────────────────────────────────
const bgTexture = new THREE.CanvasTexture(bgCanvas);

// ── 環境マップ（equirectangular JPEG） ───────────────────────
// import.meta.env.BASE_URL で開発（/）と本番（/glass-blob-webgl/）を自動切り替え
const envTexture = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'environment.jpeg');
envTexture.mapping = THREE.EquirectangularReflectionMapping;

// ── ブロブジオメトリ（モバイルは頂点数を削減） ──────────────
const segments = isMobile() ? 48 : 64;
const geometry = new THREE.SphereGeometry(1.4, segments, segments);

const _dpr = getDpr();

const uniforms = {
  uTime:          { value: 0 },
  uNoiseStrength: { value: 0.6 },
  uNoiseFreq:     { value: 0.2 },
  backgroundTex:  { value: bgTexture },
  envMap:         { value: envTexture },
  uResolution:    { value: new THREE.Vector2(window.innerWidth * _dpr, window.innerHeight * _dpr) },
  uIor:           { value: 1.35 },
  uThickness:     { value: 0.20 },
  uAberration:    { value: 0.018 },
  uEnvIntensity:  { value: 0.85 },
};

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: false,
  side: THREE.FrontSide,
});

const blob = new THREE.Mesh(geometry, material);
blob.scale.setScalar(0);
scene.add(blob);

// ── ライティング ──────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);

const rimLight = new THREE.DirectionalLight(0x4488ff, 0.6);
rimLight.position.set(-4, -3, -2);
scene.add(rimLight);

// ── インタラクション ──────────────────────────────────────────
let targetRotationY  = 0;
let currentRotationY = 0;
let mouseX = 0;
let mouseY = 0;

window.addEventListener('wheel', (e) => {
  targetRotationY += e.deltaY * 0.003;
}, { passive: true });

window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// ── タッチ操作 ────────────────────────────────────────────────
let lastTouchX = 0;
let lastTouchY = 0;

window.addEventListener('touchstart', (e) => {
  lastTouchX = e.touches[0].clientX;
  lastTouchY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  const dx = e.touches[0].clientX - lastTouchX;
  const dy = e.touches[0].clientY - lastTouchY;
  targetRotationY += dx * 0.012;
  mouseX = (e.touches[0].clientX / window.innerWidth  - 0.5) * 2;
  mouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
  lastTouchX = e.touches[0].clientX;
  lastTouchY = e.touches[0].clientY;
}, { passive: true });

// ── ビューポートに応じたカメラ・ブロブスケール調整 ────────────
function updateViewport() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const aspect = W / H;

  camera.aspect = aspect;
  // 縦長（モバイル）ではブロブが画面に収まるようカメラを引く
  camera.position.z = aspect < 0.75 ? 7.0 : aspect < 1.0 ? 6.0 : 5.0;
  camera.updateProjectionMatrix();

  const dpr = getDpr();
  renderer.setSize(W, H);
  renderer.setPixelRatio(dpr);

  redrawBgCanvas();
  bgTexture.needsUpdate = true;
  uniforms.uResolution.value.set(W * dpr, H * dpr);
}

window.addEventListener('resize', updateViewport);

// ── ノイズスピード・ベース値（パネルと共有） ──────────────────
let noiseSpeed    = 0.008;
let baseNoiseStr  = uniforms.uNoiseStrength.value;
let baseNoiseFreq = uniforms.uNoiseFreq.value;

// ── スパイクアニメーション ────────────────────────────────────
let spikeAmount = 0.0;

// ── 登場アニメーション（ふわっとスケールイン） ────────────────
let introStartTime = null;
let introDone = false;
const INTRO_DURATION = 1400;
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// クリック／タップでトゲトゲ（パネル上は除外）
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#panel') || e.target.closest('#panel-toggle')) return;
  spikeAmount = 1.0;
});

// ── アニメーションループ（60fps上限） ────────────────────────
const FRAME_MS = 1000 / 60;
let lastFrameTime = 0;
let fpsFrameCount = 0;
let fpsLastTime   = 0;
const fpsEl = document.getElementById('fps');

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (now - lastFrameTime < FRAME_MS) return;
  lastFrameTime = now;

  // FPS計算（500ms毎に更新）
  fpsFrameCount++;
  if (now - fpsLastTime >= 500) {
    const fps = Math.round(fpsFrameCount * 1000 / (now - fpsLastTime));
    if (fpsEl) fpsEl.textContent = fps + ' fps';
    fpsFrameCount = 0;
    fpsLastTime   = now;
  }

  // 登場アニメーション
  if (!introDone) {
    if (introStartTime === null) introStartTime = now;
    const t = Math.min((now - introStartTime) / INTRO_DURATION, 1);
    blob.scale.setScalar(Math.max(easeOutBack(t), 0));
    if (t >= 1) {
      blob.scale.setScalar(1);
      introDone = true;
    }
  }

  uniforms.uTime.value += noiseSpeed;

  // スパイク：クリックで瞬時に跳ね上がり指数減衰で元に戻る
  uniforms.uNoiseStrength.value = baseNoiseStr  + spikeAmount * 0.85;
  uniforms.uNoiseFreq.value     = baseNoiseFreq + spikeAmount * 2.5;
  if (spikeAmount > 0.001) {
    spikeAmount *= 0.88;
  } else {
    spikeAmount = 0;
  }

  currentRotationY += (targetRotationY - currentRotationY) * 0.08;
  blob.rotation.y = currentRotationY;

  blob.rotation.x += (mouseY * 0.4 - blob.rotation.x) * 0.05;
  blob.rotation.z += (-mouseX * 0.2 - blob.rotation.z) * 0.05;

  renderer.render(scene, camera);
}

// ── パラメーターパネル連携 ────────────────────────────────────
function bindPanel() {
  const toggle = document.getElementById('panel-toggle');
  const panel  = document.getElementById('panel');
  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      panel.classList.toggle('open');
    });
  }

  const rows = [
    { id: 'p-ior',        valId: 'v-ior',        update: v => { uniforms.uIor.value = v; },          fmt: v => v.toFixed(2) },
    { id: 'p-thickness',  valId: 'v-thickness',  update: v => { uniforms.uThickness.value = v; },    fmt: v => v.toFixed(2) },
    { id: 'p-aberration', valId: 'v-aberration', update: v => { uniforms.uAberration.value = v; },   fmt: v => v.toFixed(3) },
    { id: 'p-noise-str',  valId: 'v-noise-str',  update: v => { baseNoiseStr  = v; },                fmt: v => v.toFixed(2) },
    { id: 'p-noise-freq', valId: 'v-noise-freq', update: v => { baseNoiseFreq = v; },                fmt: v => v.toFixed(2) },
    { id: 'p-noise-spd',  valId: 'v-noise-spd',  update: v => { noiseSpeed = v; },                   fmt: v => v.toFixed(3) },
    { id: 'p-env-int',    valId: 'v-env-int',    update: v => { uniforms.uEnvIntensity.value = v; }, fmt: v => v.toFixed(2) },
  ];

  rows.forEach(({ id, valId, update, fmt }) => {
    const input = document.getElementById(id);
    const valEl = document.getElementById(valId);
    if (!input) return;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      update(v);
      valEl.textContent = fmt(v);
    });
  });
}

// ── 起動：フォントロード後に描画 ──────────────────────────────
async function init() {
  await document.fonts.load('bold 1px Poppins');
  updateViewport();   // 初期ビューポート設定
  bindPanel();
  animate();
}

init();
