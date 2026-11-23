// circuitData.js —— 内置示例电路：按键软锁存开关（参考图电路）
// 电路 JSON 结构约定（AI 解析也按此结构输出）：
// {
//   title, subtitle, overview, principle, suggestions: [],
//   board: { w, h, color },                       // 板尺寸(mm)与颜色，可省略
//   components: [{ ref, type, value, position:[x,z], rotation, color?, pins?,
//                  size?:{r,h}, role, description }],
//   wires: [{ from:"R1.1", to:"Q1.3", color }],   // 引脚间跳线
//   extWires: [{ ref:"J1", pin:1, dir:"-x", color }] // 端子外接导线（可选）
// }

export const DEMO_CIRCUIT = {
  title: '按键软锁存开关',
  subtitle: '一颗按键实现「按一下开机、再按一下关机」的经典电路',
  board: { w: 90, h: 60, color: '#116e93' },
  overview:
    '这是一个经典的按键软锁存开关电路（一键开关机电路）。板上只需一个轻触按键 SW1，就能控制负载电源的通断：按一下开机，再按一下关机。' +
    '电路以 TIP42（PNP 功率三极管）作为电源开关主体，配合 NPN 小三极管 Q2、分压电阻和电容构成正反馈锁存环路，' +
    '上电瞬间由按键触发，随后由输出电压自身维持导通状态，因此叫「软锁存」。这类电路广泛用于电池供电设备、单片机产品的电源管理。',
  principle:
    '① 开机：按下 SW1，电源经 R7 向 Q2 基极注入电流，Q2 导通；Q2 集电极把 Q1（TIP42）的基极经 R6 拉低，PNP 管 Q1 随之饱和导通，' +
    '电源从 J1 经 Q1 流向 J2，负载得电。\n' +
    '② 锁存：输出电压经 R1、R2 分压后反馈到 Q2 基极，维持 Q2 继续导通，因此松开按键后电路依然保持开机状态——这就是「锁存」。\n' +
    '③ 关机：再次按下 SW1，Q2 基极被按键直接拉到地，Q2 截止；Q1 基极被 R9 上拉回高电平，Q1 截止，输出断电，锁存解除。\n' +
    '④ C1 为输出储能滤波电容，可吸收负载电流突变；C4 抑制按键抖动与浪涌尖峰；R9 保证关机时 Q1 可靠截止；R8 在上电瞬间稳定 Q2 基极电位，防止误开机。',
  suggestions: [
    'TIP42 导通压降约 0.3~0.5V，大电流时发热明显，建议换成 P-MOSFET（如 AO3401、IRLML6402）＋栅极限流电阻，效率更高、可支持更大电流。',
    '输入端缺少防反接保护：可在 J1 串入肖特基二极管（如 SS34），或使用 P-MOS 防反接电路实现零压降保护。',
    '轻触按键存在机械抖动，可能引起状态误翻转，可在 SW1 两端并联 100nF 电容，或利用 C4 增大时间常数去抖。',
    '输出端建议增加 TVS 管（如 SMAJ12A）防浪涌，并加一颗 LED ＋ 1kΩ 限流电阻作电源指示灯。',
    '长期待机场景可把 R8 调整为 Q2 基极的确定性下拉，避免上电瞬间因分布电容充电导致误开机。',
  ],
  components: [
    {
      ref: 'J1', type: 'terminal', value: '电源输入 2P', pins: 2,
      position: [-40, 2], rotation: -90,
      role: '接入电池或适配器，为整块电路板供电。',
      description: '2P 绿色接线端子，间距 5.08mm，通过螺丝压紧外接导线。1 脚接电源正极，2 脚接电源负极（地）。端子固定在板边，方便反复拆装外接电源线。',
    },
    {
      ref: 'J2', type: 'terminal', value: '负载输出 2P', pins: 2,
      position: [40, 2], rotation: 90,
      role: '向外部负载（被控设备）输出受控电源。',
      description: '2P 绿色接线端子。Q1 导通时，J1 进来的电源从这里输出给负载；Q1 截止时输出悬空，负载断电。1 脚为受控正极，2 脚与输入共地。',
    },
    {
      ref: 'Q1', type: 'transistor_to220', value: 'TIP42',
      position: [-9, -15], rotation: 0,
      role: '电源开关主体：通断整个输出回路。',
      description: 'TIP42 是 PNP 型功率三极管，TO-220 封装，常用于 5A 以下电源开关。发射极接输入电源、集电极接输出、基极由驱动电路控制：基极被拉低约 0.7V 以下时导通，回到高电平时截止。金属散热背板可配散热片应对大电流。',
    },
    {
      ref: 'Q2', type: 'transistor_sot23', value: 'MMBT3904',
      position: [-3, -6], rotation: 180,
      role: '锁存控制管：驱动 Q1 并参与正反馈锁存。',
      description: 'MMBT3904 是 NPN 小信号三极管（SOT-23 贴片封装）。它集电极串 R6 接 Q1 基极：Q2 导通时把 Q1 基极拉低使 Q1 导通；Q2 截止时 Q1 关断。其基极同时受按键与 R1/R2 分压反馈控制，是实现「一按锁定」的核心。',
    },
    {
      ref: 'R1', type: 'resistor', value: '10kΩ',
      position: [16, 13], rotation: 0,
      role: '与 R2 组成分压器，把输出电压反馈给 Q2。',
      description: '金属膜/碳膜电阻，色环标识阻值（棕黑橙金=10kΩ）。上端接输出正极，下端与 R2 相接，构成 R1→R2 分压网络，把输出电压按比例送到 Q2 基极，是维持锁存的关键反馈支路。',
    },
    {
      ref: 'R2', type: 'resistor', value: '4.7kΩ',
      position: [16, 19], rotation: 0,
      role: '分压下臂：决定 Q2 基极的维持电压。',
      description: '4.7kΩ 电阻（黄紫红金）。R1 与 R2 的分压点接 Q2 基极：输出有电时分压电压大于 0.7V，Q2 保持导通；合理选取 R1/R2 比值可以适应不同输入电压的锁存阈值。',
    },
    {
      ref: 'R6', type: 'resistor', value: '10kΩ',
      position: [19, -3], rotation: 90,
      role: 'Q2 集电极限流：控制 Q1 基极驱动电流。',
      description: '10kΩ 电阻。一端接 Q2 集电极、另一端接 Q1 基极，把 Q1 基极电流限制在安全范围，同时与 R9 配合形成 Q1 基极的分压控制点。',
    },
    {
      ref: 'R7', type: 'resistor', value: '10kΩ',
      position: [0, 8], rotation: 0,
      role: '按键→Q2 基极的注入电阻。',
      description: '10kΩ 电阻。按下 SW1 时电源经 R7 送到 Q2 基极，触发开机；阻值越大触发越「迟钝」，可按电源电压调整。',
    },
    {
      ref: 'R8', type: 'resistor', value: '100kΩ',
      position: [-2, 19], rotation: 90,
      role: 'Q2 基极下拉，防止上电瞬间误开机。',
      description: '100kΩ 大阻值电阻（棕黑黄金），把 Q2 基极缓慢泄放到地电位，保证上电或关机后 Q2 可靠截止，避免锁存环被干扰误触发。',
    },
    {
      ref: 'R9', type: 'resistor', value: '1kΩ',
      position: [-14, -4], rotation: 90,
      role: 'Q1 基极上拉：保证关机时可靠截止。',
      description: '1kΩ 电阻（棕黑红金）。把 Q1 基极上拉到输入电源正极：Q2 截止时没有别的通路拉低基极，Q1 便可靠关断，整机静态漏电极小。',
    },
    {
      ref: 'C1', type: 'capacitor_elec', value: '100µF/25V', color: '#67c8e8', size: { r: 4.5, h: 11 },
      position: [-17, 16], rotation: 0,
      role: '输出储能滤波：稳住输出电压、吸收电流突变。',
      description: '100µF 铝电解电容（浅蓝色套管，色条一侧为负极）。接在输出与地之间，负载电流突增时放电补能、突降时吸收浪涌，让软锁存开关的输出更平稳。',
    },
    {
      ref: 'C4', type: 'capacitor_elec', value: '10µF/25V', color: '#1c1e24', size: { r: 3, h: 7 },
      position: [-21, -7], rotation: 0,
      role: '按键/基极回路缓冲：抑制抖动与尖峰。',
      description: '10µF 小型电解电容。位于 Q2 基极附近的触发放电回路中，延缓基极电位跳变，能滤掉按键机械抖动和电源尖峰，提高电路抗干扰能力。',
    },
    {
      ref: 'SW1', type: 'button', value: '轻触开关',
      position: [8, 20], rotation: 0, color: '#e23333',
      role: '唯一的人工操作入口：触发开机与关机。',
      description: '四脚轻触按键（红色圆帽）。按下瞬间改变 Q2 基极电位：第一次按下触发开机锁存，再次按下把 Q2 基极拉地强制关机。是整个电路唯一的交互部件。',
    },
  ],
  wires: [
    { from: 'J1.1', to: 'Q1.1', color: '#e53935' },   // 电源正 → Q1 发射极
    { from: 'Q1.2', to: 'J2.1', color: '#e53935' },   // Q1 集电极 → 输出正
    { from: 'J1.2', to: 'Q2.2', color: '#37474f' },   // 地 → Q2 发射极
    { from: 'J1.2', to: 'C1.2', color: '#37474f' },   // 地 → C1 负极
    { from: 'J1.2', to: 'C4.2', color: '#37474f' },   // 地 → C4 负极
    { from: 'J1.2', to: 'SW1.2', color: '#37474f' },  // 地 → 按键公共端
    { from: 'J2.2', to: 'J1.2', color: '#37474f' },   // 输出地 → 输入地
    { from: 'C1.1', to: 'J2.1', color: '#1e88e5' },   // C1 正极 → 输出正
    { from: 'Q1.3', to: 'R9.1', color: '#fdd835' },   // Q1 基极 ← 上拉电阻
    { from: 'R9.2', to: 'J1.1', color: '#fb8c00' },   // 上拉到电源正
    { from: 'Q1.3', to: 'R6.2', color: '#43a047' },   // Q1 基极 ← Q2 集电极支路
    { from: 'R6.1', to: 'Q2.1', color: '#43a047' },   // R6 → Q2 集电极
    { from: 'Q2.3', to: 'R7.1', color: '#8e24aa' },   // Q2 基极 ← 按键支路
    { from: 'R7.2', to: 'SW1.1', color: '#8e24aa' },  // R7 → 按键
    { from: 'Q2.3', to: 'R2.2', color: '#eceff1' },   // Q2 基极 ← 分压反馈
    { from: 'R2.1', to: 'R1.2', color: '#8d6e63' },   // 分压中点
    { from: 'R1.1', to: 'J2.1', color: '#1e88e5' },   // 反馈取样自输出
    { from: 'Q2.3', to: 'R8.1', color: '#78909c' },   // 基极下拉
    { from: 'C4.1', to: 'Q2.3', color: '#b0bec5' },   // C4 缓冲接入基极
  ],
  extWires: [
    { ref: 'J1', pin: 1, dir: '-x', color: '#d32f2f' },
    { ref: 'J1', pin: 2, dir: '-x', color: '#263238' },
    { ref: 'J2', pin: 1, dir: '+x', color: '#d32f2f' },
    { ref: 'J2', pin: 2, dir: '+x', color: '#263238' },
  ],
};
