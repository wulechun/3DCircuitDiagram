// aiParser.js —— 调用 OpenAI 兼容视觉接口，把电路图解析为电路 JSON
import { guessType } from './components3d.js';

const SYSTEM_PROMPT = `你是资深电子工程师。用户会给你一张电路图（原理图、实物图或 PCB 图）。请识别电路并输出严格 JSON（不要输出任何 JSON 以外的文字，不要用 markdown 代码块包裹），结构如下：

{
  "title": "电路名称",
  "subtitle": "一句话简介",
  "overview": "150~300字的整体介绍：这是什么电路、能做什么、典型应用场景",
  "principle": "工作原理，300~500字，可用 ①②③ 分步骤描述信号/电流流向",
  "suggestions": ["优化建议1", "优化建议2", "优化建议3"],  // 3~5条，指出可改进之处
  "board": { "w": 90, "h": 60, "color": "#116e93" },
  "components": [
    {
      "ref": "R1",                       // 元件位号
      "type": "resistor",                // 必须从下面类型表选择
      "value": "10kΩ",                   // 参数/型号
      "position": [x, z],                // 在板上的位置，mm，原点为板中心，x∈[-40,40], z∈[-25,25]
      "rotation": 0,                     // 旋转角度，只能取 0/90/180/270
      "color": null,                     // 电解电容套管颜色/按钮帽颜色，如 "#67c8e8"，可null
      "pins": 2,                         // 端子/IC 引脚数，其他类型填 0
      "role": "一句话说明它在电路中的作用",
      "description": "150~250字详细介绍：是什么元件、参数含义、封装特点、工作方式、选型注意事项"
    }
  ],
  "wires": [
    { "from": "R1.1", "to": "Q1.3", "color": "#e53935" }   // 引脚间连线，颜色：红#e53935电源、黑#37474f地、黄#fdd835信号、蓝#1e88e5、绿#43a047、紫#8e24aa
  ]
}

可用 type：resistor(电阻), capacitor_elec(电解电容), capacitor_ceramic(瓷片电容), diode(二极管), led(LED), transistor_to220(功率三极管/场效应管TO-220), transistor_sot23(贴片小三极管SOT-23), ic_dip(直插IC), ic_sop(贴片IC), button(轻触按键), terminal(接线端子), inductor(电感)

要求：
1. components 数量按图上主要元件识别，一般 5~15 个；原理图中没有实体布局时，按信号流向左右布局摆放 position，避免重叠。
2. 引脚编号约定：电阻/电容/二极管/LED 为 1,2；三极管为 1=发射极/集电极之一 2=另一极 3=基极（TO-220 面向文字从左到右为 1,2,3）；IC 按左上角开始逆时针编号；端子 1=正极 2=负极；按键 1~4。
3. wires 要覆盖电路的主要电气连接，15~30 条，每条 from/to 都是 "位号.引脚号"。
4. 若图中有电源输入/输出端子，额外给出 extWires（外接导线方向）：[{"ref":"J1","pin":1,"dir":"-x","color":"#d32f2f"}]，dir 可选 -x/+x/-z/+z。
5. 只输出 JSON，不要任何解释文字。`;

export class AIParseError extends Error {}

// 压缩图片到最大 1600px，转 dataURL
export function imageFileToDataURL(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new AIParseError('读取文件失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new AIParseError('图片解析失败'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function extractJSON(text) {
  if (!text) throw new AIParseError('AI 返回内容为空');
  let t = String(text).trim();
  // 去掉思考块与 markdown 围栏
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // 截取首个 { 到末个 } 之间
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s < 0 || e <= s) throw new AIParseError('AI 返回中没有 JSON：' + t.slice(0, 160));
  return JSON.parse(t.slice(s, e + 1));
}

const DIRS = ['-x', '+x', '-z', '+z'];
const WIRE_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#8e24aa', '#fb8c00', '#37474f'];

// 规范化 AI 输出 → 可渲染电路数据
export function normalizeCircuit(raw) {
  if (!raw || typeof raw !== 'object') throw new AIParseError('解析结果不是有效对象');
  const board = raw.board && typeof raw.board === 'object' ? raw.board : {};
  const bw = clampNum(board.w, 60, 140, 90);
  const bh = clampNum(board.h, 40, 100, 60);

  const seen = new Set();
  const counters = {};
  const components = [];
  const refMap = new Map();

  for (const c of (Array.isArray(raw.components) ? raw.components : [])) {
    if (!c || typeof c !== 'object') continue;
    let ref = String(c.ref || '').trim().replace(/\s+/g, '');
    if (!ref) {
      const prefix = guessType(c).startsWith('resistor') ? 'R'
        : guessType(c).charAt(0).toUpperCase();
      counters[prefix] = (counters[prefix] || 0) + 1;
      ref = prefix + counters[prefix];
    }
    if (seen.has(ref)) {
      let n = 2;
      while (seen.has(ref + '_' + n)) n++;
      ref = ref + '_' + n;
    }
    seen.add(ref);
    const comp = {
      ref,
      type: c.type || undefined,
      value: String(c.value || '').slice(0, 40),
      position: [clampNum(c.position?.[0], -(bw / 2 - 6), bw / 2 - 6, 0),
                 clampNum(c.position?.[1], -(bh / 2 - 6), bh / 2 - 6, 0)],
      rotation: [0, 90, 180, 270, -90].includes(c.rotation) ? c.rotation
        : clampNum(c.rotation, 0, 359, 0),
      color: /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : undefined,
      pins: clampNum(c.pins, 2, 24, 0),
      role: String(c.role || '').slice(0, 200),
      description: String(c.description || '').slice(0, 1200),
    };
    if (comp.type === 'capacitor_elec' && c.size?.r) {
      comp.size = { r: clampNum(c.size.r, 2, 8, 4), h: clampNum(c.size.h, 4, 16, 10) };
    }
    components.push(comp);
    refMap.set(ref, comp);
  }

  if (components.length < 2) throw new AIParseError('识别到的元件太少，请换一张更清晰的电路图');

  // 去重接线 & 校验引用
  const wireSet = new Set();
  const wires = [];
  let wi = 0;
  for (const w of (Array.isArray(raw.wires) ? raw.wires : [])) {
    if (!w?.from || !w?.to) continue;
    const from = String(w.from).trim(), to = String(w.to).trim();
    const fr = pinPart(from), tr = pinPart(to);
    if (!refMap.has(fr) || !refMap.has(tr) || fr === tr) continue;
    const key = [from, to].sort().join('|');
    if (wireSet.has(key)) continue;
    wireSet.add(key);
    wires.push({
      from, to,
      color: /^#[0-9a-fA-F]{6}$/.test(w.color || '') ? w.color
        : WIRE_COLORS[wi++ % WIRE_COLORS.length],
    });
  }

  const extWires = (Array.isArray(raw.extWires) ? raw.extWires : [])
    .filter((w) => w && refMap.has(String(w.ref || '').trim()))
    .map((w) => ({
      ref: String(w.ref).trim(),
      pin: clampNum(w.pin, 1, 24, 1),
      dir: DIRS.includes(w.dir) ? w.dir : '-x',
      color: /^#[0-9a-fA-F]{6}$/.test(w.color || '') ? w.color : '#d32f2f',
    }));

  return {
    title: String(raw.title || '').slice(0, 60) || 'AI 解析电路',
    subtitle: String(raw.subtitle || '').slice(0, 120),
    overview: String(raw.overview || '').slice(0, 2000),
    principle: String(raw.principle || '').slice(0, 3000),
    suggestions: (Array.isArray(raw.suggestions) ? raw.suggestions : [])
      .map((s) => String(s).slice(0, 300)).filter(Boolean).slice(0, 8),
    board: { w: bw, h: bh, color: /^#[0-9a-fA-F]{6}$/.test(board.color || '') ? board.color : '#116e93' },
    components,
    wires,
    extWires,
  };
}

function pinPart(pinStr) {
  const s = String(pinStr || '');
  const i = s.lastIndexOf('.');
  return i > 0 ? s.slice(0, i) : s;
}

function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

// 主入口：图片 dataURL + 配置 → 规范化电路 JSON
export async function parseCircuitImage(dataURL, cfg, { onProgress } = {}) {
  if (!cfg?.baseUrl || !cfg?.model) {
    throw new AIParseError('未配置 AI 接口：请点击右上角 ⚙ 填写接口地址与模型名');
  }
  onProgress?.('正在调用视觉模型识别电路...');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000); // 3 分钟超时

  let res, data;
  try {
    res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        max_tokens: 6000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataURL } },
              { type: 'text', text: '请识别这张电路图并按要求输出 JSON。' },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new AIParseError('请求超时（3 分钟），可换用更快的模型');
    throw new AIParseError('网络请求失败：' + err.message);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new AIParseError(`接口返回 ${res.status}：${t.slice(0, 200)}`);
  }
  data = await res.json().catch(() => { throw new AIParseError('接口响应不是 JSON'); });

  const content = data?.choices?.[0]?.message?.content;
  onProgress?.('正在解析识别结果...');
  const raw = extractJSON(
    typeof content === 'string' ? content
      : Array.isArray(content) ? content.map((p) => p?.text || '').join('') : ''
  );
  return normalizeCircuit(raw);
}
