import * as THREE from 'three';

// ── GLSL シェーダー（インライン） ─────────────────────────────

const vertexShader = /* glsl */`
uniform float uTime;
uniform float uNoiseStrength;
uniform float uNoiseFreq;

varying vec3 vNormal;
varying vec3 vViewPos;
varying vec3 vWorldPos;

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

  // 球面法線をそのまま使用：disp が負になると displacedNormal が反転してポリゴンのギザギザが出るため
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  vViewPos   = mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const fragmentShader = /* glsl */`
#define PI 3.14159265358979

varying vec3 vNormal;
varying vec3 vWorldPos;
uniform float uTime;
uniform sampler2D uBgTex;
uniform sampler2D uEnvTex;
uniform vec2 uResolution;
uniform float uRefraction;
uniform float uNoiseAmount;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(
    abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
    0.0, 1.0
  );
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
}

// ランダムノイズ（屈折ブラーの微細な揺らぎ用）
float rand(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float cosA   = max(dot(n, viewDir), 0.0);
  float fresnel = pow(1.0 - cosA, 5.0);

  vec2 screenUV = gl_FragCoord.xy / uResolution;

  // unseen.co 方式の屈折法線
  // normal.xy × (1 - normal.z × 1.33) : エッジで強く・中心でゼロになる
  vec2 refractNml = n.xy * (1.0 - n.z * 1.33) * uRefraction;

  // RGB 色収差付きブラー屈折
  // uNoiseAmount でブラー幅を制御（小=シャボン玉の軽さ・大=水っぽさ）
  vec3 refractCol = vec3(0.0);
  vec3 cOff = vec3(0.97, 1.0, 1.03);
  for (int i = 0; i < 8; i++) {
    float slide = float(i) / 8.0 * uNoiseAmount + rand(screenUV + float(i) * 0.01) * (uNoiseAmount * 0.1);
    refractCol.r += texture2D(uBgTex, clamp(screenUV - refractNml * (1.0 + slide * cOff.r), 0.001, 0.999)).r;
    refractCol.g += texture2D(uBgTex, clamp(screenUV - refractNml * (1.0 + slide * cOff.g), 0.001, 0.999)).g;
    refractCol.b += texture2D(uBgTex, clamp(screenUV - refractNml * (1.0 + slide * cOff.b), 0.001, 0.999)).b;
  }
  refractCol /= 8.0;

  // 環境マップ反射（equirectangular）
  vec3 reflDir  = reflect(-viewDir, n);
  float envU    = atan(reflDir.z, reflDir.x) / (2.0 * PI) + 0.5;
  float envV    = asin(clamp(reflDir.y, -1.0, 1.0)) / PI + 0.5;
  vec3 envColor = texture2D(uEnvTex, vec2(envU, envV)).rgb;

  // 薄膜干渉（虹色）
  float thinFilm  = sin(fresnel * 6.0 + uTime * 0.35) * 0.5 + 0.5;
  float hue       = 0.55 + thinFilm * 0.30;
  vec3 iridescent = hsl2rgb(hue, 0.88, 0.60);
  vec3 irisEnv    = mix(iridescent, envColor * 1.1, 0.25);

  // 合成：中心→bgRT の歪みテキスト, エッジ→虹色＋環境反射
  vec3 color  = mix(refractCol, irisEnv, fresnel * 0.85);
  // シルエット境界だけ smoothstep でフェード、内側は alpha=1.0（HTML ブリード完全遮断）
  float alpha = smoothstep(0.0, 0.06, cosA);

  gl_FragColor = vec4(color, alpha);
}
`;

// ── デバイス判定 ─────────────────────────────────────────────
const isMobile = () => window.innerWidth <= 640;

// ── Three.js セットアップ ─────────────────────────────────────
const canvas = document.getElementById('webgl');

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
const getDpr   = () => Math.min(devicePixelRatio, isMobile() ? 1.5 : 2);
renderer.setPixelRatio(getDpr());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

// null を渡すと WebGL エラーになるため 1×1 の白テクスチャで初期化
const _placeholder = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat
);
_placeholder.needsUpdate = true;

const uniforms = {
  uTime:          { value: 0 },
  uNoiseStrength: { value: 0.44 },
  uNoiseFreq:     { value: 0.3 },
  uBgTex:         { value: _placeholder },
  uEnvTex:        { value: _placeholder },
  uResolution:    { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uRefraction:    { value: 0.06 },
  uNoiseAmount:   { value: 0.008 },
};

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.FrontSide,
  blending: THREE.NormalBlending,
});

// ── ブロブジオメトリ（モバイルは頂点数を削減） ──────────────
const segments = isMobile() ? 64 : 96;
const geometry = new THREE.SphereGeometry(1.4, segments, segments);

const blobGroup = new THREE.Group();
blobGroup.add(new THREE.Mesh(geometry, material));
blobGroup.scale.setScalar(0);
scene.add(blobGroup);

// ── 環境マップ ────────────────────────────────────────────────
const envTexture = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'environment.jpeg');
uniforms.uEnvTex.value = envTexture;

// ── 背景Orthoシーン + WebGLRenderTarget ───────────────────────
// Pass1: キャンバステキスト → bgRT → Pass2: blob が bgRT をサンプリングして歪み描画
const bgCamera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bgScene    = new THREE.Scene();
const bgPlaneMat = new THREE.MeshBasicMaterial({ map: _placeholder, depthTest: false, depthWrite: false });
bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgPlaneMat));

// 物理ピクセルで作成（gl_FragCoord は物理px / CSS px ではない）
const bgRT = new THREE.WebGLRenderTarget(renderer.domElement.width, renderer.domElement.height, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
});
uniforms.uBgTex.value = bgRT.texture;

function buildBgTexture() {
  const W   = window.innerWidth;
  const H   = window.innerHeight;
  const dpr = getDpr();
  // 物理ピクセルで canvas を作成（Retina 対応 + uResolution と一致させる）
  const PW  = renderer.domElement.width;
  const PH  = renderer.domElement.height;

  const cvs = document.createElement('canvas');
  cvs.width  = PW;
  cvs.height = PH;
  const ctx = cvs.getContext('2d');
  ctx.scale(dpr, dpr);  // CSS ピクセル座標で描画

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const fontSize = Math.min(Math.max(80, W * 0.22), 400);
  ctx.font         = `700 ${fontSize}px Poppins, sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#000000';
  ctx.fillText('SOAP',   W / 2, H / 2 - fontSize * 0.44);
  ctx.fillText('BUBBLE', W / 2, H / 2 + fontSize * 0.44);

  const prev = bgPlaneMat.map;
  bgPlaneMat.map = new THREE.CanvasTexture(cvs);
  bgPlaneMat.needsUpdate = true;
  // uResolution を物理ピクセルに合わせる（gl_FragCoord は物理ピクセル）
  uniforms.uResolution.value.set(PW, PH);
  if (prev && prev !== _placeholder) prev.dispose();
}

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
  bgRT.setSize(renderer.domElement.width, renderer.domElement.height);

  buildBgTexture();
}

window.addEventListener('resize', updateViewport);

// ── ノイズスピード・ベース値（パネルと共有） ──────────────────
let noiseSpeed    = 0.022;
let baseNoiseStr  = uniforms.uNoiseStrength.value;
let baseNoiseFreq = uniforms.uNoiseFreq.value;

// ── 登場アニメーション（ふわっとスケールイン） ────────────────
let introStartTime = null;
let introDone = false;
const INTRO_DURATION = 1400;
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

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
    blobGroup.scale.setScalar(Math.max(easeOutBack(t), 0));
    if (t >= 1) {
      blobGroup.scale.setScalar(1);
      introDone = true;
    }
  }

  uniforms.uTime.value          += noiseSpeed;
  uniforms.uNoiseStrength.value  = baseNoiseStr;
  uniforms.uNoiseFreq.value      = baseNoiseFreq;

  currentRotationY += (targetRotationY - currentRotationY) * 0.08;
  blobGroup.rotation.y = currentRotationY;

  blobGroup.rotation.x += (mouseY * 0.4 - blobGroup.rotation.x) * 0.05;
  blobGroup.rotation.z += (-mouseX * 0.2 - blobGroup.rotation.z) * 0.05;

  // Pass 1: キャンバステキスト → bgRT（blob のサンプリングソース）
  renderer.setRenderTarget(bgRT);
  renderer.clear();
  renderer.render(bgScene, bgCamera);
  // Pass 2: blob が bgRT を屈折サンプリングしてスクリーンへ描画
  renderer.setRenderTarget(null);
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
    { id: 'p-noise-str',  valId: 'v-noise-str',  update: v => { baseNoiseStr  = v; },               fmt: v => v.toFixed(2) },
    { id: 'p-noise-freq', valId: 'v-noise-freq', update: v => { baseNoiseFreq = v; },               fmt: v => v.toFixed(2) },
    { id: 'p-noise-spd',  valId: 'v-noise-spd',  update: v => { noiseSpeed = v; },                  fmt: v => v.toFixed(3) },
    { id: 'p-refraction', valId: 'v-refraction', update: v => { uniforms.uRefraction.value = v; },   fmt: v => v.toFixed(3) },
    { id: 'p-noise-amt',  valId: 'v-noise-amt',  update: v => { uniforms.uNoiseAmount.value = v; },  fmt: v => v.toFixed(3) },
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
  buildBgTexture();
  updateViewport();
  bindPanel();
  // 外側は HTML テキスト表示・内側は bgRT の歪みテキストのみ（二重防止）
  const bgText = document.getElementById('bg-text');
  if (bgText) bgText.style.opacity = '1';
  animate();
}

init();
