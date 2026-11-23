# 电路图 3D 讲解（Circuit 3D Explainer）

把一张电路图变成可交互的 3D 电路板：左侧是 Three.js 渲染的 3D 电路，右侧是电路介绍与优化建议；**点击任意元件**，右侧显示它的参数、作用和详细介绍。

![preview](手绘电路图-按键软锁存开关.png)

## 原理

整个流程围绕一份**电路 JSON** 展开：

```
电路图图片 ──(视觉大模型识别)──▶ 电路 JSON ──(Three.js 参数化建模)──▶ 3D 电路板
```

1. **电路 JSON**：描述电路的唯一数据源。包含 `title / overview / principle / suggestions`（讲解文本）与 `components`（元件列表：位号、类型、参数、板上坐标、旋转角、作用、详细介绍）、`wires`（引脚间连线）、`extWires`（端子外接导线）。
2. **AI 解析**（可选）：把上传的电路图压缩后发给任意 OpenAI 兼容的多模态接口（`/chat/completions`），Prompt 约束模型只输出上述结构的 JSON；本地对返回做清洗（剥 markdown 围栏 / 校验元件引用 / 坐标钳制 / 重名位号去重）。
3. **3D 渲染**：Three.js 按元件类型参数化生成模型（电阻色环按阻值自动算色、TO-220 / 电解电容 / 轻触按键 / 接线端子等 12 类），PCB 丝印（焊盘、位号、板名）用 Canvas 纹理绘制，连线用 CatmullRom 曲线 + TubeGeometry 生成跳线弧。
4. **交互**：Raycaster 拾取元件 → 高亮抬起 + 右侧面板切到元件详情；面板的元件清单 / 连接关系反向联动 3D 高亮。

不配置 AI 时，页面直接展示内置示例电路（按键软锁存开关）。

## 使用方法

### 启动

双击 **start.bat**（自动起本地服务并打开浏览器），或手动：

```bash
python server.py 8765
# 打开 http://127.0.0.1:8765/
```

> 必须走 HTTP 服务，直接双击 index.html 会因 file:// 的 CORS 限制加载不了 ES Module。`server.py` 已修复 Windows 下 `.js` 被识别成 `text/plain` 的问题。

### 三种用法

| 方式 | 操作 |
|---|---|
| 看示例 | 打开即是内置「按键软锁存开关」3D 讲解，点元件看详情 |
| 上传电路图 | 点 **上传电路图** 选一张图（根目录的手绘图纸可直接当测试图）。首次使用先点 **⚙** 填写：接口地址、API Key、视觉模型名（如 `qwen-vl-max` / `doubao-1.5-vision-pro` / `gpt-4o`），配置保存在浏览器 localStorage |
| 载入 JSON | 点 **载入JSON** 直接加载一份电路 JSON 文件，跳过 AI |

### 电路 JSON 结构（手写/调试用）

```jsonc
{
  "title": "电路名称", "subtitle": "一句话简介",
  "overview": "整体介绍", "principle": "工作原理",
  "suggestions": ["优化建议1", "优化建议2"],
  "board": { "w": 90, "h": 60, "color": "#116e93" },
  "components": [{
    "ref": "R1", "type": "resistor", "value": "10kΩ",
    "position": [16, 13], "rotation": 0,     // 板中心为原点，mm，旋转 0/90/180/270
    "role": "一句话作用", "description": "详细介绍"
  }],
  "wires": [{ "from": "R1.1", "to": "Q1.3", "color": "#e53935" }],
  "extWires": [{ "ref": "J1", "pin": 1, "dir": "-x", "color": "#d32f2f" }]
}
```

`type` 可选：`resistor` / `capacitor_elec` / `capacitor_ceramic` / `diode` / `led` / `transistor_to220` / `transistor_sot23` / `ic_dip` / `ic_sop` / `button` / `terminal` / `inductor`（填错会按位号前缀自动纠正）。

## 目录结构

```
├── index.html            # 入口页面
├── server.py             # 本地服务（修复 .js MIME）
├── start.bat             # 一键启动
├── lib/                  # three.js r187（module 版 + OrbitControls + RoomEnvironment）
└── js/
    ├── main.js           # 场景 / 建板 / 布线 / 点击交互 / 丝印纹理
    ├── components3d.js   # 12 类元件的参数化 3D 模型工厂
    ├── circuitData.js    # 内置示例电路（按键软锁存开关）
    ├── aiParser.js       # 视觉大模型解析 → 电路 JSON（含清洗与校验）
    └── panel.js          # 右侧面板（总览 / 元件详情 / AI 设置）
```
