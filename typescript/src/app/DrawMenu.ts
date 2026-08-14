export interface DrawMenuItem {
  id: string;
  label: string;
  shortcut?: string;
}

export interface DrawMenuGroup {
  label: string;
  items: DrawMenuItem[];
}

export interface DrawDragItem {
  action: string;
  label: string;
  shortcut?: string;
}

/**
 * The generic instance item becomes available only if the currently loaded
 * circuit has a user-defined <ccm> model. LM317/TL431 are built-in composite
 * commands and are mapped to their preserved internal model names by the app.
 */
export const DRAW_UNAVAILABLE_LEGACY_ITEM_IDS = [
  "subcircuit-instance"
] as const;

export const DRAW_MENU_DIRECT_ITEMS: DrawMenuItem[] = [
  { id: "wire", label: "添加导线", shortcut: "w" },
  { id: "routed-wire", label: "添加布线导线", shortcut: "W" },
  { id: "resistor", label: "添加电阻器", shortcut: "r" }
];

export const DRAW_MENU_GROUPS: DrawMenuGroup[] = [
  {
    label: "无源元件",
    items: [
      { id: "capacitor", label: "添加电容器", shortcut: "c" },
      {
        id: "polar-capacitor",
        label: "添加有极性电容器",
        shortcut: "C"
      },
      { id: "inductor", label: "添加电感器", shortcut: "L" },
      { id: "switch", label: "添加开关", shortcut: "s" },
      { id: "push-switch", label: "添加按钮开关" },
      { id: "switch-spdt", label: "添加单刀双掷开关", shortcut: "S" },
      { id: "switch-dpdt", label: "添加DPDT开关" },
      { id: "switch-mbb", label: "添加先合后断开关" },
      { id: "potentiometer", label: "添加可变电阻" },
      { id: "transformer", label: "添加变压器", shortcut: "T" },
      { id: "tapped-transformer", label: "添加有抽头变压器" },
      { id: "custom-transformer", label: "添加自定义变压器" },
      { id: "transmission-line", label: "添加输电线路" },
      { id: "relay", label: "添加继电器", shortcut: "R" },
      { id: "relay-coil", label: "添加继电器线圈" },
      { id: "relay-contact", label: "添加继电器触点" },
      { id: "ldr", label: "添加光敏电阻" },
      { id: "thermistor", label: "添加热敏电阻" },
      { id: "memristor", label: "添加忆阻器" },
      { id: "spark-gap", label: "添加火花隙" },
      { id: "fuse", label: "添加保险丝" },
      { id: "crystal", label: "添加晶振" },
      { id: "cross-switch", label: "添加交叉开关" },
      { id: "gyrator", label: "添加回转器" }
    ]
  },
  {
    label: "输入和电源",
    items: [
      { id: "ground", label: "添加接地", shortcut: "g" },
      { id: "voltage", label: "添加直流电压源(二端口)", shortcut: "v" },
      { id: "ac-voltage", label: "添加交流电压源(二端口)" },
      { id: "rail", label: "添加直流电压源(单端口)" },
      { id: "ac-rail", label: "添加交流电压源(单端口)" },
      { id: "square-rail", label: "添加方波源(单端口)" },
      { id: "clock", label: "添加时钟源" },
      { id: "sweep", label: "添加扫频源" },
      { id: "variable-rail", label: "添加可变电压源" },
      { id: "antenna", label: "添加天线" },
      { id: "am-source", label: "添加调幅源" },
      { id: "fm-source", label: "添加调频源" },
      { id: "current", label: "添加电流源" },
      { id: "noise", label: "添加噪声发生器" },
      { id: "audio-input", label: "添加音频输入" },
      { id: "data-input", label: "添加数据输入" },
      { id: "external-voltage", label: "添加外部电压(JavaScript)" }
    ]
  },
  {
    label: "输出和标签",
    items: [
      { id: "output", label: "添加模拟输出" },
      { id: "led", label: "添加LED灯" },
      { id: "lamp", label: "添加灯泡" },
      { id: "text", label: "添加文本" },
      { id: "box", label: "添加提示框" },
      { id: "line", label: "添加线条" },
      { id: "labeled-node", label: "添加标记的节点" },
      { id: "probe", label: "添加电压表/示波器探头" },
      { id: "ohmmeter", label: "添加欧姆表" },
      { id: "ammeter", label: "添加电流表" },
      { id: "wattmeter", label: "添加瓦特表" },
      { id: "test-point", label: "添加测试点" },
      { id: "decimal-display", label: "添加小数显示" },
      { id: "instruction-display", label: "添加指令显示器" },
      { id: "led-array", label: "添加LED阵列" },
      { id: "data-recorder", label: "添加数据导出" },
      { id: "audio-output", label: "添加音频输出" },
      { id: "stop-trigger", label: "添加停止触发器" },
      { id: "dc-motor", label: "添加直流电机" },
      { id: "three-phase-motor", label: "添加三相电机" }
    ]
  },
  {
    label: "有源元件",
    items: [
      { id: "diode", label: "添加二极管", shortcut: "d" },
      { id: "zener", label: "添加齐纳二极管" },
      { id: "npn", label: "添加NPN双极型晶体管" },
      { id: "pnp", label: "添加PNP双极型晶体管" },
      { id: "nmos", label: "添加MOSFET(N沟道)" },
      { id: "pmos", label: "添加MOSFET(P沟道)" },
      { id: "njfet", label: "添加JFET(N沟道)" },
      { id: "pjfet", label: "添加JFET(P沟道)" },
      { id: "scr", label: "添加可控硅" },
      { id: "diac", label: "添加双向开关二极管" },
      { id: "triac", label: "添加双向可控硅" },
      { id: "npn-darlington", label: "添加达林顿管(NPN)" },
      { id: "pnp-darlington", label: "添加达林顿管(PNP)" },
      { id: "varactor", label: "添加变容二极管" },
      { id: "tunnel-diode", label: "添加隧道二极管" },
      { id: "triode", label: "添加三极管" },
      { id: "unijunction", label: "添加单结型晶体管" }
    ]
  },
  {
    label: "有源集成电路",
    items: [
      { id: "opamp", label: "添加运算放大器(理想,-上)" },
      { id: "opamp-swap", label: "添加运算放大器(理想,+上)" },
      { id: "opamp-real", label: "添加运算放大器(实际)" },
      { id: "analog-switch", label: "添加模拟开关(SPST)" },
      { id: "analog-switch-spdt", label: "添加模拟开关(SPDT)" },
      { id: "analog-mux", label: "添加模拟多路复用器" },
      { id: "tri-state", label: "添加三态缓冲" },
      { id: "schmitt-trigger", label: "添加施密特触发器" },
      { id: "inverting-schmitt", label: "添加施密特触发器(反相)" },
      { id: "delay-buffer", label: "添加延迟缓冲器" },
      { id: "cc2", label: "添加CCII+" },
      { id: "cc2-negative", label: "添加CCII-" },
      { id: "comparator", label: "添加比较器(Hi-Z /接地输出)" },
      { id: "ota", label: "添加OTA(LM13700风格)" },
      { id: "vcvs", label: "添加电压控制电压源" },
      { id: "vccs", label: "添加电压控制电流源" },
      { id: "ccvs", label: "添加电流控制电压源" },
      { id: "cccs", label: "添加电流控制电流源" },
      { id: "optocoupler", label: "添加光耦合器" },
      { id: "time-delay-relay", label: "添加延时继电器" },
      // The legacy entries below are built-in composite models rather than
      // ordinary ElementFactory constructors.
      { id: "lm317", label: "添加LM317" },
      { id: "tl431", label: "添加TL431" },
      { id: "subcircuit-instance", label: "添加子电路实例" },
      { id: "motor-protection-switch", label: "添加电机保护开关" }
    ]
  },
  {
    label: "逻辑门、输入和输出",
    items: [
      { id: "logic-input", label: "添加逻辑输入" },
      { id: "logic-output", label: "添加逻辑输出" },
      { id: "bus-input", label: "添加总线输入" },
      { id: "inverter", label: "添加非门" },
      { id: "nand-gate", label: "添加与非门" },
      { id: "nor-gate", label: "添加或非门" },
      { id: "and-gate", label: "添加与门" },
      { id: "or-gate", label: "添加或门" },
      { id: "xor-gate", label: "添加异或门" },
      { id: "xnor-gate", label: "添加XNOR门" }
    ]
  },
  {
    label: "数字芯片",
    items: [
      { id: "d-flip-flop", label: "添加D触发器" },
      { id: "jk-flip-flop", label: "添加JK触发器" },
      { id: "t-flip-flop", label: "添加T触发器" },
      { id: "seven-segment", label: "添加7段LED显示器" },
      { id: "seven-segment-decoder", label: "添加7段译码器" },
      { id: "multiplexer", label: "添加多路复用器" },
      { id: "demultiplexer", label: "添加信号分离器" },
      { id: "sipo-shift", label: "添加SIPO移位寄存器" },
      { id: "piso-shift", label: "添加PISO移位寄存器" },
      { id: "counter", label: "添加计数器" },
      { id: "counter-2", label: "添加带加载计数器" },
      { id: "ring-counter", label: "添加环形计数器" },
      { id: "latch", label: "添加锁存器" },
      { id: "sequence-generator", label: "添加序列发生器" },
      { id: "full-adder", label: "添加加法器" },
      { id: "half-adder", label: "添加半加器" },
      { id: "custom-logic", label: "添加自定义逻辑" },
      { id: "sram", label: "添加静态随机存储器" },
      { id: "rom", label: "添加ROM" },
      { id: "bus-transceiver", label: "添加总线收发器" },
      { id: "bus-splitter", label: "添加总线分线器" }
    ]
  },
  {
    label: "模拟和混合芯片",
    items: [
      { id: "timer-555", label: "添加555定时器" },
      { id: "phase-comparator", label: "添加相位比较器" },
      { id: "dac", label: "添加DAC" },
      { id: "adc", label: "添加ADC" },
      { id: "vco", label: "添加VCO" },
      { id: "monostable", label: "添加单稳态" }
    ]
  }
];

export const DRAW_DRAG_ITEMS: DrawDragItem[] = [
  { action: "drag-all", label: "拖动所有", shortcut: "(Alt-拖动)" },
  { action: "drag-row", label: "拖动行", shortcut: "(Alt-Shift-拖动)" },
  { action: "drag-column", label: "拖动列", shortcut: "(Alt-Meta-拖动)" },
  { action: "drag-selected", label: "拖动选择的元件" },
  { action: "drag-post", label: "拖动端点", shortcut: "(Ctrl-拖动)" }
];

/**
 * ScopeElm is a TypeScript extension.  The original Draw > Outputs and
 * Labels submenu does not contain it: legacy creates undocked scopes from a
 * component context menu instead.  Keep it isolated so it cannot shift the
 * historical Draw paths.
 */
export const DRAW_EXTENSION_ITEMS: DrawMenuItem[] = [
  { id: "scope-element", label: "添加嵌入式示波器" }
];
