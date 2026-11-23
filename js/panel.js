// panel.js —— 右侧信息面板：总览 / 元件详情 / AI 设置 / Toast 状态
import { TYPE_LABELS } from './components3d.js';

const $ = (id) => document.getElementById(id);
const content = $('panel-content');

let currentCircuit = null;
let onSelectCallback = null;   // 点击元件 chip / 连接项时通知 main.js
let selectedRef = null;

// ---------- 状态 / Toast ----------
export function setStatus(text, cls = '') {
  const el = $('status-text');
  el.textContent = text;
  el.className = cls;
}

let toastTimer = null;
export function toast(msg, cls = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

export function showLoading(show, text = '正在解析电路图...') {
  const ov = $('loading-overlay');
  $('loading-text').textContent = text;
  ov.classList.toggle('hidden', !show);
}

// ---------- AI 配置 ----------
const AI_CFG_KEY = 'circuit3d_ai_cfg';
export function getAIConfig() {
  try { return JSON.parse(localStorage.getItem(AI_CFG_KEY)) || {}; }
  catch { return {}; }
}
export function saveAIConfig(cfg) {
  localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
}

function openSettings() {
  const cfg = getAIConfig();
  $('ai-base-url').value = cfg.baseUrl || '';
  $('ai-key').value = cfg.apiKey || '';
  $('ai-model').value = cfg.model || '';
  $('modal-backdrop').classList.remove('hidden');
}
function closeSettings() { $('modal-backdrop').classList.add('hidden'); }

export function initPanel({ onSelectComponent }) {
  onSelectCallback = onSelectComponent;

  // 工具栏按钮
  $('btn-settings').addEventListener('click', openSettings);
  $('modal-close').addEventListener('click', closeSettings);
  $('modal-cancel').addEventListener('click', closeSettings);
  $('modal-backdrop').addEventListener('click', (e) => {
    if (e.target === $('modal-backdrop')) closeSettings();
  });
  $('modal-save').addEventListener('click', () => {
    saveAIConfig({
      baseUrl: $('ai-base-url').value.trim().replace(/\/+$/, ''),
      apiKey: $('ai-key').value.trim(),
      model: $('ai-model').value.trim(),
    });
    closeSettings();
    toast('AI 配置已保存', 'ok');
  });
  $('ai-test').addEventListener('click', async () => {
    const cfg = {
      baseUrl: $('ai-base-url').value.trim().replace(/\/+$/, ''),
      apiKey: $('ai-key').value.trim(),
      model: $('ai-model').value.trim(),
    };
    if (!cfg.baseUrl || !cfg.model) { toast('请先填写接口地址和模型名', 'err'); return; }
    const btn = $('ai-test');
    btn.textContent = '测试中...';
    try {
      const res = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {}),
        },
        body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 4 }),
      });
      if (res.ok) toast('接口连通正常', 'ok');
      else {
        const t = await res.text();
        toast(`接口返回 ${res.status}：${t.slice(0, 120)}`, 'err');
      }
    } catch (err) {
      toast('连接失败：' + err.message, 'err');
    } finally {
      btn.textContent = '测试连通';
    }
  });

  renderEmpty();
}

// ---------- 渲染：空状态 ----------
export function renderEmpty() {
  $('circuit-title').textContent = '电路图 3D 讲解';
  $('circuit-subtitle').classList.add('hidden');
  content.innerHTML = `
    <div class="section">
      <div class="section-title">使用说明</div>
      <div class="section-body dim">
        左侧是可旋转的 3D 电路板。<b>点击任意元件</b>即可在右侧查看它的详细介绍与作用。<br><br>
        ① 点击上方「上传电路图」，AI 会识别原理图并自动生成 3D 电路（需在 ⚙ 中配置视觉模型接口）；<br>
        ② 或点击「载入JSON」直接载入电路描述文件；<br>
        ③ 未配置 AI 时展示内置示例电路。
      </div>
    </div>`;
}

// ---------- 渲染：总览 ----------
export function renderOverview(circuit) {
  currentCircuit = circuit;
  selectedRef = null;
  $('circuit-title').textContent = circuit.title || '未命名电路';
  if (circuit.subtitle) {
    const sub = $('circuit-subtitle');
    sub.textContent = circuit.subtitle;
    sub.classList.remove('hidden');
  }

  const compCount = (circuit.components || []).length;
  let html = '';

  html += `
    <div class="section">
      <div class="section-title">电路介绍</div>
      <div class="section-body">${esc(circuit.overview || '暂无介绍')}</div>
    </div>`;

  if (circuit.principle) {
    html += `
    <div class="section">
      <div class="section-title">工作原理</div>
      <div class="section-body dim">${escMultiline(circuit.principle)}</div>
    </div>`;
  }

  if (circuit.suggestions?.length) {
    html += `
    <div class="section">
      <div class="section-title">优化建议</div>
      <ul class="suggest-list">${circuit.suggestions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
    </div>`;
  }

  html += `
    <div class="section">
      <div class="section-title">元件清单（${compCount}）</div>
      <div class="chip-wrap">${(circuit.components || []).map((c) =>
        `<span class="chip" data-ref="${escAttr(c.ref)}"><b>${esc(c.ref)}</b>${esc(TYPE_LABELS[c.type] || c.type || '')}</span>`).join('')}
      </div>
    </div>`;

  content.innerHTML = html;

  // chips 点击 → 选中元件
  content.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      selectComponent(chip.dataset.ref, { scroll: false });
    });
  });
}

// ---------- 渲染：元件详情 ----------
export function renderDetail(comp, circuit) {
  currentCircuit = circuit;
  selectedRef = comp.ref;
  const typeLabel = TYPE_LABELS[comp.type] || comp.type || '元件';

  // 与该元件相连的连线
  const links = (circuit.wires || []).filter((w) => {
    return pinRef(w.from) === comp.ref || pinRef(w.to) === comp.ref;
  });
  let linksHtml = '';
  if (links.length) {
    linksHtml = `
    <div class="section">
      <div class="section-title">连接关系（${links.length}）</div>
      <ul class="net-list">${links.map((w, i) => {
        const other = pinRef(w.from) === comp.ref ? w.to : w.from;
        const mine = pinRef(w.from) === comp.ref ? w.from : w.to;
        return `<li data-i="${circuit.wires.indexOf(w)}" data-ref="${escAttr(pinRef(other))}">
          <span class="net-dot" style="background:${esc(w.color || '#888')}"></span>
          <span>${esc(mine)} → ${esc(other)}</span></li>`;
      }).join('')}</ul>
    </div>`;
  }

  content.innerHTML = `
    <button class="back-btn" id="btn-back">← 返回总览</button>
    <div class="detail-head">
      <span class="detail-ref">${esc(comp.ref || '?')}</span>
      <span class="detail-type">${esc(typeLabel)}</span>
    </div>
    <table class="kv-table">
      <tr><td>参数</td><td>${esc(comp.value || '—')}</td></tr>
      <tr><td>封装</td><td>${esc(TYPE_LABELS[comp.type] || comp.type || '—')}</td></tr>
      <tr><td>作用</td><td>${esc(comp.role || '—')}</td></tr>
    </table>
    <div class="section">
      <div class="section-title">详细介绍</div>
      <div class="section-body">${esc(comp.description || '暂无详细介绍')}</div>
    </div>
    ${linksHtml}`;

  $('btn-back').addEventListener('click', () => {
    renderOverview(circuit);
    onSelectCallback(null);
  });
  content.querySelectorAll('.net-list li').forEach((li) => {
    li.addEventListener('click', () => {
      selectComponent(li.dataset.ref, { scroll: false });
    });
  });
}

// ---------- 选中状态同步 ----------
export function selectComponent(ref, { scroll = true } = {}) {
  if (!currentCircuit) return;
  if (ref === null) {
    selectedRef = null;
    renderOverview(currentCircuit);
    return;
  }
  const comp = (currentCircuit.components || []).find((c) => c.ref === ref);
  if (!comp) return;
  renderDetail(comp, currentCircuit);
  markActiveChip(ref);
  onSelectCallback(ref);
  if (scroll) content.scrollTop = 0;
}

function markActiveChip(ref) {
  content.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.ref === ref);
  });
}

// ---------- 工具 ----------
function pinRef(pinStr) {
  // "R1.2" -> "R1"；"J1" -> "J1"
  const s = String(pinStr || '');
  const i = s.lastIndexOf('.');
  return i > 0 ? s.slice(0, i) : s;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escAttr(s) { return esc(s); }
function escMultiline(s) {
  return esc(s).replace(/\n/g, '<br>');
}
