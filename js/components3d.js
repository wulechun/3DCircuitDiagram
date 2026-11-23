// components3d.js —— 电路元件 3D 模型工厂
// 单位约定：1 单位 = 1mm；电路板顶面 y=0，元件原点在板面中心，+z 朝向板前方
import * as THREE from 'three';

// ---------- 通用材质 ----------
const M = (color, opts = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: opts.rough ?? 0.55,
  metalness: opts.metal ?? 0.05,
  ...(opts.extra || {})
});

const MAT = {
  lead:  () => M('#b9c0c7', { metal: 0.85, rough: 0.35 }),          // 元件引脚
  solder: () => M('#c9ccd1', { metal: 0.9, rough: 0.3 }),
  black: () => M('#16181d', { rough: 0.42 }),
  metal: () => M('#aab3bc', { metal: 0.9, rough: 0.32 }),
};

function cyl(r1, r2, h, seg = 24) { return new THREE.CylinderGeometry(r1, r2, h, seg); }
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

function mesh(geo, mat, x = 0, y = 0, z = 0, castShadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

// 竖直圆柱（沿 y 轴）
function vCyl(mat, r, h, x, yBottom, z, seg = 24) {
  const m = mesh(cyl(r, r, h, seg), mat, x, yBottom + h / 2, z);
  return m;
}

// 沿 x 轴水平圆柱
function hCylX(mat, r, len, xCenter, y, z, seg = 24) {
  const m = mesh(cyl(r, r, len, seg), mat, xCenter, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
}

// 沿 z 轴水平圆柱
function hCylZ(mat, r, len, x, y, zCenter, seg = 24) {
  const m = mesh(cyl(r, r, len, seg), mat, x, y, zCenter);
  m.rotation.x = Math.PI / 2;
  return m;
}

// 引脚：从 (x, z) 板面竖直向上 h
function leg(mat, x, z, h, r = 0.4) {
  return mesh(cyl(r, r, h, 10), mat, x, h / 2, z);
}

// ---------- 电阻色环 ----------
const BAND_COLORS = ['#111111', '#7a4a1f', '#e03131', '#ff922b', '#f5c518',
  '#37b24d', '#1c7ed6', '#7048e8', '#9aa1a9', '#f1f3f5'];
const GOLD = '#c9a227';

export function parseResistorBands(value) {
  // "10k" "4.7k" "100" "1M" "220R" -> [色1,色2,倍率,金]
  const s = String(value || '').toUpperCase().replace('Ω', '').replace('OHM', '').trim();
  const m = s.match(/^(\d+\.?\d*)\s*(R|K|KΩ|M|MΩ)?/);
  if (!m) return [BAND_COLORS[1], BAND_COLORS[0], BAND_COLORS[2], GOLD];
  let num = parseFloat(m[1]);
  const unit = m[2] || '';
  if (unit.startsWith('K')) num *= 1e3;
  else if (unit.startsWith('M')) num *= 1e6;
  let d1d2 = Math.round(num);
  let mult = 0;
  while (d1d2 >= 100) { d1d2 = Math.round(d1d2 / 10); mult++; }
  const d1 = Math.floor(d1d2 / 10) % 10, d2 = d1d2 % 10;
  return [BAND_COLORS[d1], BAND_COLORS[d2], BAND_COLORS[mult] || GOLD, GOLD];
}

// ---------- 文字贴图 ----------
function textTexture(text, { w = 256, h = 128, font = 'bold 64px Consolas', color = '#e8e8e8' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = font; g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2, w * 0.92);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function labelPlane(text, widthMm, heightMm, opts) {
  const mat = new THREE.MeshBasicMaterial({
    map: textTexture(text, opts), transparent: true, depthWrite: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(widthMm, heightMm), mat);
}

// ============================================================
// 元件工厂：每种返回 Group（原点=板面中心），并注册引脚局部坐标
// ============================================================

// --- 轴类元件（电阻/二极管）：横卧，轴向沿 x ---
function buildAxial({ bodyColor, bandColors, bodyLen = 9, bodyR = 2.0, stripeIndex = -1, leadSpan = 5.5 }) {
  const g = new THREE.Group();
  const bodyMat = M(bodyColor, { rough: 0.6 });
  const y = 2.2; // 悬空高度
  const body = hCylX(bodyMat, bodyR, bodyLen, 0, y, 0);
  g.add(body);
  // 色环
  const n = bandColors.length;
  bandColors.forEach((col, i) => {
    const off = -bodyLen * 0.32 + i * (bodyLen * 0.6 / Math.max(n - 1, 1));
    const band = hCylX(M(col, { rough: 0.5 }), bodyR + 0.12, 0.75, off, y, 0);
    g.add(band);
  });
  if (stripeIndex >= 0) {
    const band = hCylX(M('#e6e6e6', { rough: 0.5 }), bodyR + 0.12, 0.9, stripeIndex, y, 0);
    g.add(band);
  }
  // 引脚
  const leadMat = MAT.lead();
  g.add(leg(leadMat, -leadSpan, 0, y - bodyR + 0.3));
  g.add(leg(leadMat, leadSpan, 0, y - bodyR + 0.3));
  // 引脚上斜段
  [[-leadSpan, -bodyLen / 2 + 0.6], [leadSpan, bodyLen / 2 - 0.6]].forEach(([px, bx]) => {
    const seg = mesh(box(Math.abs(bx - px), 0.5, 0.5), leadMat, (px + bx) / 2, y - 0.55, 0);
    const ang = Math.atan2(bodyR - 0.3, Math.abs(bx - px));
    seg.rotation.z = px < bx ? ang : -ang;
    g.add(seg);
  });
  g.userData.pins = [[-leadSpan, 0, 0], [leadSpan, 0, 0]];
  return g;
}

function buildResistor(comp) {
  return buildAxial({
    bodyColor: '#d9c49a',
    bandColors: parseResistorBands(comp.value),
  });
}

function buildDiode(comp) {
  return buildAxial({
    bodyColor: '#191b20',
    bandColors: [],
    bodyLen: 8.5, bodyR: 2.3,
    stripeIndex: 2.4,
    leadSpan: 5,
  });
}

function buildLED(comp) {
  const g = new THREE.Group();
  const color = comp.color || '#ff4d4d';
  const shellMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.25, metalness: 0,
    emissive: new THREE.Color(color), emissiveIntensity: 0.35,
    transparent: true, opacity: 0.85,
  });
  // 底座法兰 + 圆顶
  g.add(vCyl(shellMat, 2.9, 1.6, 0, 1.8, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.7, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  dome.position.set(0, 3.4, 0);
  dome.castShadow = true;
  g.add(dome);
  const leadMat = MAT.lead();
  g.add(leg(leadMat, -1.4, 0.9, 2.0, 0.35));
  g.add(leg(leadMat, 1.4, 0.9, 2.0, 0.35));
  g.add(mesh(box(2.2, 0.4, 0.4), leadMat, -0.4, 2.0, 0.9));
  g.add(mesh(box(2.2, 0.4, 0.4), leadMat, 0.4, 2.0, 0.9));
  g.userData.pins = [[-1.4, 0.9, 0], [1.4, 0.9, 0]];
  return g;
}

// --- 电解电容 ---
function buildElecCap(comp) {
  const g = new THREE.Group();
  const r = comp.size?.r || 4;
  const h = comp.size?.h || 10;
  const sleeve = comp.color || '#1b1d22';
  const bodyMat = M(sleeve, { rough: 0.4 });
  g.add(vCyl(bodyMat, r, h, 0, 2, 0));
  // 顶部铝壳
  const top = mesh(cyl(r - 0.5, r - 0.5, 0.7, 24), MAT.metal(), 0, 2 + h - 0.3, 0);
  g.add(top);
  // 防爆纹（十字浅槽）
  const vent = hCylX(M('#3a3f47', { rough: 0.6 }), r - 1.2, 0.5, 0, 2 + h - 0.55, 0);
  const vent2 = hCylZ(M('#3a3f47', { rough: 0.6 }), r - 1.2, 0.5, 0, 2 + h - 0.55, 0);
  g.add(vent); g.add(vent2);
  // 负极色条
  const stripe = mesh(new THREE.CylinderGeometry(r + 0.08, r + 0.08, h * 0.72, 24, 1, true, -Math.PI * 0.16, Math.PI * 0.32),
    M('#cfd4d9', { rough: 0.5 }), 0, 2 + h / 2, 0);
  g.add(stripe);
  const leadMat = MAT.lead();
  const span = Math.max(r * 0.4, 1.5);
  g.add(leg(leadMat, -span, 0.9, 2.2, 0.45));
  g.add(leg(leadMat, span, 0.9, 2.2, 0.45));
  g.userData.pins = [[-span, 0.9, 0], [span, 0.9, 0]];
  return g;
}

// --- 瓷片电容 ---
function buildCeramicCap(comp) {
  const g = new THREE.Group();
  const bodyMat = M('#e8862d', { rough: 0.55 });
  // 竖立圆盘：面向 ±x
  const disc = mesh(cyl(2.8, 2.8, 2.6, 24), bodyMat, 0, 4.3, 0);
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  const leadMat = MAT.lead();
  g.add(leg(leadMat, -2, 0, 4.2, 0.35));
  g.add(leg(leadMat, 2, 0, 4.2, 0.35));
  g.add(mesh(box(1.6, 0.4, 0.4), leadMat, -1.2, 4.0, 0));
  g.add(mesh(box(1.6, 0.4, 0.4), leadMat, 1.2, 4.0, 0));
  g.userData.pins = [[-2, 0, 0], [2, 0, 0]];
  return g;
}

// --- 三极管 TO-220（TIP42 等） ---
function buildTO220(comp) {
  const g = new THREE.Group();
  const bodyMat = M('#17181d', { rough: 0.38 });
  const tabMat = MAT.metal();
  const bodyH = 9.5, bodyW = 10, bodyD = 4.5;
  const bodyBottom = 5.2;
  // 塑封主体（稍前）
  g.add(mesh(box(bodyW, bodyH, bodyD), bodyMat, 0, bodyBottom + bodyH / 2, -1.2));
  // 金属散热片（顶部后方）
  g.add(mesh(box(bodyW, 3.6, bodyD), tabMat, 0, bodyBottom + bodyH + 1.7, -1.9));
  // 安装孔
  const hole = mesh(cyl(1.3, 1.3, bodyD + 0.6, 16), M('#20242b'), 0, bodyBottom + bodyH + 1.7, -1.9);
  g.add(hole);
  // 正面型号文字
  const label = labelPlane(comp.value || comp.label || comp.ref || '', 8.4, 4.2,
    { font: 'bold 58px Consolas', color: '#c9ccd1' });
  label.position.set(0, bodyBottom + bodyH / 2 + 1.5, 1.12);
  g.add(label);
  // 三根引脚
  const leadMat = MAT.lead();
  [-2.54, 0, 2.54].forEach((x) => {
    g.add(leg(leadMat, x, 3.4, bodyBottom, 0.55));
    // 从身前到引脚的过渡
    g.add(mesh(box(0.7, 0.7, 4.8), leadMat, x, bodyBottom - 0.6, 1.0));
  });
  g.userData.pins = [[-2.54, 3.4, 0], [0, 3.4, 0], [2.54, 3.4, 0]];
  return g;
}

// --- 贴片三极管 SOT-23 ---
function buildSOT23(comp) {
  const g = new THREE.Group();
  const bodyMat = M('#14151a', { rough: 0.4 });
  g.add(mesh(box(2.9, 1.3, 2.6), bodyMat, 0, 0.95, 0));
  g.add(mesh(box(2.4, 0.5, 2.1), bodyMat, 0, 1.75, 0));
  const leadMat = MAT.lead();
  // 1/2 脚在 +z 侧，3 脚在 -z 侧
  [[-0.95, 1.9], [0.95, 1.9], [0, -1.9]].forEach(([x, z]) => {
    g.add(mesh(box(0.7, 0.3, 1.6), leadMat, x, 0.3, z > 0 ? z - 0.4 : z + 0.4));
    g.add(mesh(box(0.7, 0.25, 0.8), leadMat, x, 0.15, z));
  });
  g.userData.pins = [[-0.95, 1.9, 0], [0.95, 1.9, 0], [0, -1.9, 0]];
  return g;
}

// --- DIP 集成电路 ---
function buildDIP(comp) {
  const g = new THREE.Group();
  const n = Math.max(4, comp.pins || 8);
  const perSide = n / 2;
  const bodyLen = perSide * 2.54 + 3;
  const bodyMat = M('#17181d', { rough: 0.42 });
  g.add(mesh(box(bodyLen, 3.4, 7.6), bodyMat, 0, 2.6, 0));
  // 缺口（pin1 方向）
  const notch = mesh(cyl(1.0, 1.0, 1.0, 16), M('#0d0e12'), -bodyLen / 2 + 1.2, 4.4, 0);
  g.add(notch);
  if (comp.value || comp.label) {
    const label = labelPlane(comp.value, bodyLen - 3, 3, { font: 'bold 52px Consolas', color: '#b9bfc7' });
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 4.35, 0);
    g.add(label);
  }
  const leadMat = MAT.lead();
  const pins = [];
  const zStart = -(perSide - 1) * 2.54 / 2;
  for (let i = 0; i < perSide; i++) {
    const z = zStart + i * 2.54;
    // 两侧引脚
    [[-3.81, 1], [3.81, -1]].forEach(([x, dir]) => {
      g.add(mesh(box(0.6, 0.3, 1.8), leadMat, x + dir * 0.5, 1.1, z));
      g.add(leg(leadMat, x + dir * 1.35, z, 1.0, 0.4));
      g.add(mesh(box(1.6, 0.3, 0.6), leadMat, x + dir * 0.9, 1.0, z));
    });
    pins.push([-3.81 - 1.35, z, 0]);
  }
  for (let i = perSide - 1; i >= 0; i--) pins.push([3.81 + 1.35, zStart + i * 2.54, 0]);
  g.userData.pins = pins;
  return g;
}

// --- SOP 贴片 IC ---
function buildSOP(comp) {
  const g = new THREE.Group();
  const n = Math.max(4, comp.pins || 8);
  const perSide = n / 2;
  const bodyLen = perSide * 1.27 + 2.4;
  const bodyMat = M('#17181d', { rough: 0.42 });
  g.add(mesh(box(bodyLen, 1.6, 4.2), bodyMat, 0, 1.1, 0));
  const dot = mesh(cyl(0.5, 0.5, 0.3, 12), M('#3a3f47'), -bodyLen / 2 + 0.9, 1.95, -1.2);
  g.add(dot);
  const leadMat = MAT.lead();
  const pins = [];
  const zStart = -(perSide - 1) * 1.27 / 2;
  for (let i = 0; i < perSide; i++) {
    const z = zStart + i * 1.27;
    [[-1, 1], [1, -1]].forEach(([side, dir]) => {
      const x = side * (bodyLen / 2 - 0.2);
      g.add(mesh(box(1.6, 0.22, 0.5), leadMat, x + side * 0.6, 0.3, z));
    });
    pins.push([-bodyLen / 2 - 0.7, z, 0]);
  }
  for (let i = perSide - 1; i >= 0; i--) pins.push([bodyLen / 2 + 0.7, zStart + i * 1.27, 0]);
  g.userData.pins = pins;
  return g;
}

// --- 轻触按键（红色圆帽） ---
function buildButton(comp) {
  const g = new THREE.Group();
  const baseMat = M('#14151a', { rough: 0.45 });
  g.add(mesh(box(12, 5.5, 12), baseMat, 0, 2.75, 0));
  // 帽
  const capColor = comp.color || '#d92b2b';
  const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.32 });
  g.add(mesh(cyl(3.4, 3.8, 2.6, 24), capMat, 0, 5.5 + 1.3, 0));
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(3.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), capMat);
  capTop.position.set(0, 6.8, 0);
  capTop.castShadow = true;
  g.add(capTop);
  // 四角引脚
  const leadMat = MAT.lead();
  const pins = [];
  [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]].forEach(([x, z]) => {
    g.add(leg(leadMat, x, z, 2.2, 0.45));
    pins.push([x, z, 0]);
  });
  g.userData.pins = pins;
  return g;
}

// --- 绿色接线端子 ---
function buildTerminal(comp) {
  const g = new THREE.Group();
  const n = Math.max(2, comp.pins || 2);
  const pitch = 5.08;
  const w = n * pitch;
  const greenMat = M('#2f9e4f', { rough: 0.5 });
  const bodyH = 10.2, bodyD = 10.5;
  g.add(mesh(box(w, bodyH, bodyD), greenMat, 0, bodyH / 2, 0));
  const leadMat = MAT.lead();
  const pins = [];
  const holes = [];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pitch / 2 + i * pitch;
    // 顶部螺丝
    g.add(mesh(cyl(1.55, 1.55, 1.6, 20), MAT.metal(), x, bodyH - 0.5, -2.2));
    const slot = mesh(box(2.6, 0.5, 0.55), M('#5b636e', { metal: 0.6, rough: 0.4 }), x, bodyH + 0.25, -2.2);
    slot.rotation.y = (i % 2) ? Math.PI / 2 : Math.PI / 2 + 0.4;
    g.add(slot);
    // 前面板进线孔
    g.add(mesh(cyl(1.5, 1.5, 1.4, 20), M('#10120f', { rough: 0.9 }), x, bodyH / 2 + 1.4, bodyD / 2 - 0.2));
    holes.push([x, bodyH / 2 + 1.4, bodyD / 2 + 0.3]);
    // 底部引脚
    g.add(leg(leadMat, x, -2.2, 2.0, 0.7));
    pins.push([x, -2.2, 0]);
  }
  g.userData.pins = pins;
  g.userData.holes = holes;
  return g;
}

// --- 电感 ---
function buildInductor(comp) {
  const g = new THREE.Group();
  const bodyMat = M('#2b2e35', { rough: 0.55 });
  g.add(vCyl(bodyMat, 4, 5.5, 0, 1.5, 0));
  const copper = M('#c77b3c', { metal: 0.8, rough: 0.35 });
  for (let i = 0; i < 4; i++) {
    const ring = mesh(new THREE.TorusGeometry(3.4, 0.45, 8, 28), copper, 0, 2.4 + i * 1.2, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  const leadMat = MAT.lead();
  g.add(leg(leadMat, -2.5, 0, 1.8, 0.45));
  g.add(leg(leadMat, 2.5, 0, 1.8, 0.45));
  g.userData.pins = [[-2.5, 0, 0], [2.5, 0, 0]];
  return g;
}

// ============================================================
export const FACTORIES = {
  resistor: buildResistor,
  capacitor_elec: buildElecCap,
  capacitor_ceramic: buildCeramicCap,
  diode: buildDiode,
  led: buildLED,
  transistor_to220: buildTO220,
  transistor_sot23: buildSOT23,
  ic_dip: buildDIP,
  ic_sop: buildSOP,
  button: buildButton,
  terminal: buildTerminal,
  inductor: buildInductor,
};

export const TYPE_LABELS = {
  resistor: '电阻', capacitor_elec: '电解电容', capacitor_ceramic: '瓷片电容',
  diode: '二极管', led: 'LED', transistor_to220: '三极管 (TO-220)',
  transistor_sot23: '贴片三极管 (SOT-23)', ic_dip: '集成电路 (DIP)',
  ic_sop: '贴片 IC (SOP)', button: '轻触按键', terminal: '接线端子', inductor: '电感',
};

// 按 ref 前缀推断类型（AI 输出类型缺失/非法时兜底）
export function guessType(comp) {
  const known = Object.keys(FACTORIES);
  if (known.includes(comp.type)) return comp.type;
  const ref = String(comp.ref || '').toUpperCase();
  if (/^LED/.test(ref)) return 'led';
  if (/^(R|VR|RN)/.test(ref)) return 'resistor';
  if (/^(D|VD)/.test(ref)) return 'diode';
  if (/^(C|EC)/.test(ref)) {
    const v = String(comp.value || '');
    return /µ|u|F|UF/i.test(v) && !/NF/i.test(v) ? 'capacitor_elec' : 'capacitor_ceramic';
  }
  if (/^(Q|VT|T)\d/.test(ref)) {
    return /TIP|BD|MOS|AO4|IRF|SI23|AO3/i.test(ref + (comp.value || '')) ? 'transistor_to220' : 'transistor_sot23';
  }
  if (/^(U|IC|N)\d/.test(ref)) return 'ic_dip';
  if (/^(SW|S|K|BT|KEY)/.test(ref)) return 'button';
  if (/^(J|P|CN|XS|CON)/.test(ref)) return 'terminal';
  if (/^(L|FB)\d/.test(ref)) return 'inductor';
  return 'resistor';
}

export function createComponent(comp) {
  const type = guessType(comp);
  const factory = FACTORIES[type] || buildResistor;
  const g = factory(comp);
  g.userData.compId = comp.ref;
  g.userData.type = type;
  return g;
}
