// main.js —— 入口：Three.js 场景、电路板构建、布线、点击交互
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { RoomEnvironment } from '../lib/RoomEnvironment.js';
import { DEMO_CIRCUIT } from './circuitData.js';
import { createComponent } from './components3d.js';
import { imageFileToDataURL, parseCircuitImage, normalizeCircuit } from './aiParser.js';
import * as panel from './panel.js';

const BOARD_TOP = 1.6;           // 板厚
const SILK_PX_PER_MM = 16;       // 丝印纹理精度

let renderer, scene, camera, controls;
let circuitGroup = null;
const compGroups = new Map();    // ref -> THREE.Group
let selectedRef = null;
let selectedMeshes = [];
const clock = new THREE.Clock();

const $ = (id) => document.getElementById(id);

// ============================================================
// 场景初始化
// ============================================================
function initScene() {
  const canvas = $('three-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1114);
  scene.fog = new THREE.Fog(0x0e1114, 260, 520);

  camera = new THREE.PerspectiveCamera(42, 1, 1, 1200);
  camera.position.set(72, 58, 96);

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 30;
  controls.maxDistance = 420;
  controls.maxPolarAngle = Math.PI * 0.49;

  // 环境反射
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  // 灯光
  scene.add(new THREE.HemisphereLight(0x93a7bc, 0x181b20, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.4);
  key.position.set(58, 88, 42);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -130; key.shadow.camera.right = 130;
  key.shadow.camera.top = 130; key.shadow.camera.bottom = -130;
  key.shadow.camera.far = 320;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7fb3ff, 0.5);
  fill.position.set(-70, 46, -58);
  scene.add(fill);

  buildMat();

  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const vp = $('viewport');
  const w = vp.clientWidth, h = vp.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// ---------- 绿色切割垫 ----------
function buildMat() {
  const W = 240, H = 190;
  const c = document.createElement('canvas');
  c.width = 1440; c.height = 1140;
  const g = c.getContext('2d');
  g.fillStyle = '#1e7a4e';
  g.fillRect(0, 0, c.width, c.height);
  // 细网格（每 10mm）
  const px = c.width / W;
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 10) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let y = 0; y <= H; y += 10) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke(); }
  // 粗网格（每 50mm）
  g.strokeStyle = 'rgba(255,255,255,0.16)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 50) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let y = 0; y <= H; y += 50) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke(); }
  // 噪点
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = -0.02;
  mat.receiveShadow = true;
  scene.add(mat);
}

// ============================================================
// 电路板构建
// ============================================================
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
}

function buildCircuit(circuit) {
  if (circuitGroup) {
    scene.remove(circuitGroup);
    disposeGroup(circuitGroup);
  }
  compGroups.clear();
  setSelected(null);

  circuitGroup = new THREE.Group();
  const bw = circuit.board?.w || 90;
  const bh = circuit.board?.h || 60;
  const pcbColor = circuit.board?.color || '#116e93';

  // 板体
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(bw, bh, 3.5), { depth: BOARD_TOP, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const board = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: pcbColor, roughness: 0.5, metalness: 0.06 }));
  board.castShadow = true;
  board.receiveShadow = true;
  circuitGroup.add(board);

  // 四角螺丝
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a13b, metalness: 0.9, roughness: 0.3 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.8 }));
    hole.position.set(sx * (bw / 2 - 4.5), BOARD_TOP + 0.24, sz * (bh / 2 - 4.5));
    circuitGroup.add(hole);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.9, 20), goldMat);
    screw.position.set(sx * (bw / 2 - 4.5), BOARD_TOP + 0.42, sz * (bh / 2 - 4.5));
    screw.castShadow = true;
    circuitGroup.add(screw);
  });

  // 元件
  for (const comp of (circuit.components || [])) {
    let g;
    try { g = createComponent(comp); } catch (e) { continue; }
    g.position.set(comp.position?.[0] || 0, BOARD_TOP, comp.position?.[1] || 0);
    g.rotation.y = ((comp.rotation || 0) * Math.PI) / 180;
    circuitGroup.add(g);
    compGroups.set(comp.ref, g);
  }

  circuitGroup.updateMatrixWorld(true);

  // 丝印层（含焊盘 + 位号）
  const silk = buildSilkscreen(circuit, bw, bh);
  circuitGroup.add(silk);

  // 布线
  buildWires(circuit);

  scene.add(circuitGroup);
}

// ---------- 丝印纹理 ----------
function buildSilkscreen(circuit, bw, bh) {
  const W = bw * SILK_PX_PER_MM, H = bh * SILK_PX_PER_MM;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const mm = (x, z) => [ (x + bw / 2) * SILK_PX_PER_MM, (z + bh / 2) * SILK_PX_PER_MM ];
  g.lineCap = 'round';

  // 外框
  g.strokeStyle = 'rgba(240,244,248,0.75)';
  g.lineWidth = 0.3 * SILK_PX_PER_MM;
  const [bx1, by1] = mm(-bw / 2 + 2, -bh / 2 + 2);
  const [bx2, by2] = mm(bw / 2 - 2, bh / 2 - 2);
  g.strokeRect(bx1, by1, bx2 - bx1, by2 - by1);

  // 板名
  g.fillStyle = 'rgba(240,244,248,0.85)';
  g.font = `bold ${3.4 * SILK_PX_PER_MM}px "Microsoft YaHei"`;
  g.textBaseline = 'top';
  const title = (circuit.title || '').slice(0, 22);
  g.fillText(title, ...mm(-bw / 2 + 5, -bh / 2 + 4.2));

  // 焊盘 + 位号
  for (const comp of (circuit.components || [])) {
    const grp = compGroups.get(comp.ref);
    if (!grp) continue;
    const px0 = (comp.position?.[0] || 0), pz0 = (comp.position?.[1] || 0);
    // 焊盘
    const pads = grp.userData.pins || [];
    for (const p of pads) {
      const local = new THREE.Vector3(p[0], 0, p[1]);
      const wp = grp.localToWorld(local.clone());
      const [cx, cy] = mm(wp.x, wp.z);
      g.fillStyle = '#d7dce1';
      g.beginPath(); g.arc(cx, cy, 1.5 * SILK_PX_PER_MM, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2c313a';
      g.beginPath(); g.arc(cx, cy, 0.65 * SILK_PX_PER_MM, 0, Math.PI * 2); g.fill();
    }
    // 位号（偏移到元件旁，避开元件本体）
    const isBig = ['terminal', 'transistor_to220', 'ic_dip', 'button'].includes(grp.userData.type);
    const off = isBig ? 9.5 : 6.5;
    const side = pz0 > 0 ? -1 : 1; // 靠下的元件标在上方，反之标下方
    g.fillStyle = 'rgba(244,248,252,0.92)';
    g.font = `600 ${2.3 * SILK_PX_PER_MM}px Consolas`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(comp.ref, ...mm(px0, pz0 + side * off));
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const planeGeo = new THREE.PlaneGeometry(bw, bh);
  planeGeo.rotateX(-Math.PI / 2);
  const silk = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.62, metalness: 0.02,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  silk.position.y = BOARD_TOP + 0.03;
  silk.receiveShadow = false;
  return silk;
}

// ---------- 布线 ----------
function dirVec(dir) {
  switch (dir) {
    case '+x': return new THREE.Vector3(1, 0, 0);
    case '-z': return new THREE.Vector3(0, 0, -1);
    case '+z': return new THREE.Vector3(0, 0, 1);
    default: return new THREE.Vector3(-1, 0, 0);
  }
}

function getPinWorld(pinStr) {
  const s = String(pinStr || '');
  const i = s.lastIndexOf('.');
  const ref = i > 0 ? s.slice(0, i) : s;
  const pin = i > 0 ? (parseInt(s.slice(i + 1), 10) || 1) : 1;
  const g = compGroups.get(ref);
  if (!g) return null;
  const pins = g.userData.pins || [];
  if (!pins.length) return null;
  const p = pins[Math.min(pin - 1, pins.length - 1)];
  return g.localToWorld(new THREE.Vector3(p[0], 0.35, p[1]));
}

function buildWires(circuit) {
  const wireMat = (color) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || '#888888'), roughness: 0.45, metalness: 0.1,
  });

  (circuit.wires || []).forEach((w, i) => {
    const a = getPinWorld(w.from);
    const b = getPinWorld(w.to);
    if (!a || !b) return;
    const h = 2.6 + (i % 4) * 0.55;
    const pts = [
      a,
      new THREE.Vector3(a.x, a.y + h, a.z),
      new THREE.Vector3(b.x, a.y + h, a.z),
      new THREE.Vector3(b.x, a.y + h, b.z),
      b,
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.55, 8, false), wireMat(w.color));
    tube.castShadow = true;
    circuitGroup.add(tube);
  });

  // 端子外接导线
  (circuit.extWires || []).forEach((ew) => {
    const g = compGroups.get(ew.ref);
    if (!g?.userData.holes?.length) return;
    const hole = g.userData.holes[Math.min(ew.pin - 1, g.userData.holes.length - 1)];
    const p0 = g.localToWorld(new THREE.Vector3(hole[0], hole[1], hole[2]));
    const d = dirVec(ew.dir);
    const pts = [
      p0,
      p0.clone().add(new THREE.Vector3(0, 5, 0)),
      p0.clone().addScaledVector(d, 11).add(new THREE.Vector3(0, 8, 0)),
      p0.clone().addScaledVector(d, 25).add(new THREE.Vector3(0, 10, 0)),
      p0.clone().addScaledVector(d, 36).add(new THREE.Vector3(0, 4.5, 0)),
      p0.clone().addScaledVector(d, 38.5).add(new THREE.Vector3(0, 1.2, 0)),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 2.0, 10, false), wireMat(ew.color));
    tube.castShadow = true;
    circuitGroup.add(tube);
    // 线头铜芯
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 4.5, 10),
      new THREE.MeshStandardMaterial({ color: 0xc9a15e, metalness: 0.85, roughness: 0.35 })
    );
    tip.position.copy(p0.clone().addScaledVector(d, 40).add(new THREE.Vector3(0, 0.8, 0)));
    tip.rotation.z = d.x < 0 ? Math.PI / 2 : d.x > 0 ? Math.PI / 2 : 0;
    if (d.z !== 0) tip.rotation.x = Math.PI / 2;
    circuitGroup.add(tip);
  });
}

// ============================================================
// 交互：点击选中 / 高亮
// ============================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPos = null;

function setSelected(ref) {
  if (selectedRef === ref) return;
  // 清除旧高亮
  selectedMeshes.forEach((m) => {
    if (m.material?.emissive && m.userData.origEmissive !== undefined) {
      m.material.emissive.setHex(m.userData.origEmissive);
      m.material.emissiveIntensity = m.userData.origIntensity ?? 1;
      delete m.userData.origEmissive;
    }
  });
  selectedMeshes = [];
  selectedRef = ref;
  const g = ref ? compGroups.get(ref) : null;
  if (g) {
    g.traverse((m) => {
      if (m.isMesh && m.material?.emissive) {
        m.userData.origEmissive = m.material.emissive.getHex();
        m.userData.origIntensity = m.material.emissiveIntensity;
        m.material.emissive.setHex(0x1c6dd0);
        m.material.emissiveIntensity = 0.45;
        selectedMeshes.push(m);
      }
    });
  }
}

function pickComponent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(circuitGroup ? circuitGroup.children : [], true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.compId) o = o.parent;
    if (o) return o.userData.compId;
    // 命中板体/丝印/导线等非元件：仅当命中元件时选中
    if (h.object.userData.isBoard) return null;
  }
  return null;
}

function initInteraction() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => { downPos = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const dx = e.clientX - downPos[0], dy = e.clientY - downPos[1];
    downPos = null;
    if (dx * dx + dy * dy > 36) return; // 拖拽不算点击
    if (e.button !== 0) return;
    const ref = circuitGroup ? pickComponent(e) : null;
    setSelected(ref);
    panel.selectComponent(ref, { scroll: false });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!circuitGroup) return;
    const ref = pickComponent(e);
    canvas.style.cursor = ref ? 'pointer' : '';
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setSelected(null);
      panel.selectComponent(null);
    }
  });
}

// 面板（chips / 连接列表）→ 3D 选中
function onPanelSelect(ref) {
  if (ref === selectedRef) return;
  setSelected(ref);
}

// ============================================================
// 上传 / JSON 载入
// ============================================================
function initFileHandlers() {
  $('btn-upload').addEventListener('click', () => $('file-image').click());
  $('btn-json').addEventListener('click', () => $('file-json').click());

  $('file-image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataURL = await imageFileToDataURL(file);
      panel.showLoading(true, '正在调用 AI 识别电路图...');
      panel.setStatus('AI 解析中，通常需要 20~60 秒...');
      const cfg = panel.getAIConfig();
      const circuit = await parseCircuitImage(dataURL, cfg, {
        onProgress: (t) => { $('loading-text').textContent = t; },
      });
      panel.showLoading(false);
      buildCircuit(circuit);
      panel.renderOverview(circuit);
      panel.setStatus(`解析成功：${circuit.components.length} 个元件 / ${circuit.wires.length} 条连线`, 'ok');
      panel.toast(`AI 解析完成：${circuit.title}`, 'ok');
    } catch (err) {
      panel.showLoading(false);
      panel.setStatus('AI 解析失败：' + err.message, 'err');
      panel.toast('解析失败：' + err.message, 'err');
    }
  });

  $('file-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const circuit = normalizeCircuit(JSON.parse(text));
      buildCircuit(circuit);
      panel.renderOverview(circuit);
      panel.setStatus(`已载入：${circuit.title}（${circuit.components.length} 元件）`, 'ok');
      panel.toast('JSON 载入成功', 'ok');
    } catch (err) {
      panel.setStatus('JSON 载入失败：' + err.message, 'err');
      panel.toast('载入失败：' + err.message, 'err');
    }
  });
}

// ============================================================
// 渲染循环
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  // 选中呼吸高亮 + 抬起动画
  if (selectedMeshes.length) {
    const k = 0.4 + Math.sin(t * 5) * 0.22;
    selectedMeshes.forEach((m) => { m.material.emissiveIntensity = k; });
  }
  compGroups.forEach((g, ref) => {
    const targetY = BOARD_TOP + (ref === selectedRef ? 1.6 : 0);
    g.position.y += (targetY - g.position.y) * Math.min(1, dt * 10);
  });

  controls.update();
  renderer.render(scene, camera);
}

// ============================================================
// 启动
// ============================================================
initScene();
buildCircuit(DEMO_CIRCUIT);
panel.initPanel({ onSelectComponent: onPanelSelect });
panel.renderOverview(DEMO_CIRCUIT);
initInteraction();
initFileHandlers();
panel.setStatus('内置示例：按键软锁存开关 · 点击元件查看详情');
animate();
