import {
  AnalogMuxElm,
  AudioInputElm,
  BusLogicInputElm,
  CapacitorElm,
  CircuitElm,
  CircuitLoader,
  CircuitRunner,
  CurrentElm,
  CustomCompositeModel,
  CustomTransformerElm,
  DataInputElm,
  DataRecorderElm,
  DCMotorElm,
  DelayBufferElm,
  ElementFactory,
  InductorElm,
  FuseElm,
  LDRElm,
  LabeledNodeElm,
  LogicInputElm,
  OpAmpRealElm,
  OptocouplerElm,
  Point,
  PotElm,
  Rectangle,
  ResistorElm,
  RoutedWireElm,
  StringTokenizer,
  Switch2Elm,
  SwitchElm,
  StopTriggerElm,
  ThermistorNTCElm,
  ThreePhaseMotorElm,
  TimeDelayRelayElm,
  TriStateElm,
  VoltageElm,
  VarRailElm,
  WireElm,
  type XmlRecord
} from "../core";
import {
  circuitExamples,
  circuitMenuEntries,
  type CircuitExample
} from "../examples";
import {
  CircuitCanvasRenderer,
  getSwitchInteractionBounds,
  type DraftElement
} from "../ui/CircuitCanvasRenderer";
import {
  DRAW_DRAG_ITEMS,
  DRAW_EXTENSION_ITEMS,
  DRAW_MENU_DIRECT_ITEMS,
  DRAW_MENU_GROUPS,
  DRAW_UNAVAILABLE_LEGACY_ITEM_IDS,
  type DrawMenuItem
} from "./DrawMenu";

const DEFAULT_CIRCUIT = [
  "$ 1 0.000005 10.20027730826997 50 5 43 5e-11",
  "r 176 80 384 80 0 10",
  "s 384 80 448 80 0 1 false",
  "w 176 80 176 352 0",
  "c 384 352 176 352 0 0.000015 -9.86 -10",
  "l 384 80 384 352 0 1 0.03 0",
  "v 448 352 448 80 0 0 40 5 0 0 0.5",
  "r 384 352 448 352 0 100",
  "o 4 64 0 4099 20 0.05 0 2 4 3",
  "o 3 64 0 4099 20 0.05 1 2 3 3",
  "o 0 64 0 4099 0.625 0.05 2 2 0 3",
  "38 3 0 0.000001 0.000101 Capacitance",
  "38 4 0 0.01 1.01 Inductance",
  "38 0 0 1 101 Resistance",
  "h 1 4 3"
].join("\n");

const EMPTY_CIRCUIT = "$ 1 0.000005 10.2 50 5 43 5e-11";

type Tool = "select" | string;

type ShortcutMap = Record<string, Tool>;

/** Parse the engineering notation accepted by the original edit dialog. */
export function parseEditableNumber(source: string): number | null {
  let value = source.trim().replace(/µ/g, "u");
  if (value.length === 0) return null;

  let rmsMultiplier = 1;
  if (/rms$/i.test(value)) {
    value = value.replace(/rms$/i, "").trim();
    rmsMultiplier = Math.SQRT2;
  }
  value = value.replace(
    /^([+-]?\d+)([fFpPnNuUmMkKMGg])(\d+)$/,
    "$1.$3$2"
  );
  value = value.replace(/[mM][eE][gG]$/, "M");

  const match = value.match(
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([fFpPnNuUmMkKMGg]?)$/
  );
  if (match === null) return null;
  const multipliers: Record<string, number> = {
    f: 1e-15,
    F: 1e-15,
    p: 1e-12,
    P: 1e-12,
    n: 1e-9,
    N: 1e-9,
    u: 1e-6,
    U: 1e-6,
    m: 1e-3,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    g: 1e9,
    G: 1e9
  };
  const parsed = Number(match[1]);
  const multiplier = multipliers[match[2]] ?? 1;
  const result = parsed * multiplier * rmsMultiplier;
  return Number.isFinite(result) ? result : null;
}

const DRAW_SHORTCUT_ITEMS = [
  ...DRAW_MENU_DIRECT_ITEMS,
  ...DRAW_MENU_GROUPS.flatMap((group) => group.items)
];

const DEFAULT_TOOL_SHORTCUTS: ShortcutMap = Object.fromEntries(
  DRAW_SHORTCUT_ITEMS.flatMap((item) =>
    item.shortcut?.length === 1 ? [[item.shortcut, item.id]] : []
  )
);

export interface ComponentSpec {
  id: string;
  label: string;
  category: string;
  type: string;
  arguments: string;
  flags?: number;
  xmlOnly?: boolean;
}

type CircuitMenuEntry =
  | { kind: "group"; group: CircuitMenuGroup }
  | { kind: "example"; example: CircuitExample };

interface CircuitMenuGroup {
  label: string;
  entries: CircuitMenuEntry[];
  groups: Map<string, CircuitMenuGroup>;
}

export const COMPONENTS: ComponentSpec[] = [
  { id: "wire", label: "导线", category: "基础", type: "w", arguments: "" },
  { id: "resistor", label: "电阻", category: "基础", type: "r", arguments: "1000" },
  { id: "capacitor", label: "电容", category: "基础", type: "c", arguments: "0.000001 0 0" },
  { id: "polar-capacitor", label: "极性电容", category: "基础", type: "209", arguments: "0.00001 0.001" },
  { id: "inductor", label: "电感", category: "基础", type: "l", arguments: "0.01 0 0 0" },
  { id: "switch", label: "开关", category: "基础", type: "s", arguments: "0 false" },
  { id: "switch-spdt", label: "单刀双掷开关", category: "基础", type: "S", arguments: "0 false 0 2" },
  { id: "switch-dpdt", label: "双刀双掷开关", category: "基础", type: "429", arguments: "0 false 2" },
  { id: "switch-mbb", label: "先通后断开关", category: "基础", type: "416", arguments: "0 false 0" },
  { id: "ground", label: "接地", category: "基础", type: "g", arguments: "" },
  { id: "potentiometer", label: "电位器", category: "基础", type: "174", arguments: "1000 0.5" },
  { id: "fuse", label: "保险丝", category: "基础", type: "404", arguments: "0.0613 6.73 0 false" },
  { id: "ldr", label: "光敏电阻", category: "基础", type: "374", arguments: "0.34 Light\\sBrightness" },
  { id: "thermistor", label: "NTC 热敏电阻", category: "基础", type: "350", arguments: "10000 3605 -40 150 0.34 Temperature" },
  { id: "voltage", label: "电压源", category: "电源", type: "v", arguments: "0 40 5 0 0 0.5" },
  { id: "rail", label: "电源轨", category: "电源", type: "R", arguments: "0 40 5 0 0 0.5" },
  { id: "current", label: "电流源", category: "电源", type: "i", arguments: "0.01 0" },
  { id: "sweep", label: "扫频源", category: "电源", type: "170", arguments: "20 4000 5 0.1 0" },
  { id: "noise", label: "噪声源", category: "电源", type: "n", arguments: "5" },
  { id: "data-input", label: "采样数据源", category: "电源", type: "424", arguments: "1 40 5 0 0 0.5 0.001 1 0" },
  { id: "audio-input", label: "音频输入", category: "电源", type: "411", arguments: "1 40 5 0 0 0.5 5 0 0" },
  { id: "diode", label: "二极管", category: "半导体", type: "d", arguments: "0.805904783" },
  { id: "zener", label: "稳压二极管", category: "半导体", type: "z", arguments: "0.805904783 5.6" },
  { id: "led", label: "发光二极管", category: "半导体", type: "162", arguments: "1 0 0" },
  { id: "npn", label: "NPN 晶体管", category: "半导体", type: "t", arguments: "0 1 0 0 100" },
  { id: "pnp", label: "PNP 晶体管", category: "半导体", type: "t", arguments: "-1 0 0 100" },
  { id: "npn-darlington", label: "NPN 达林顿管", category: "半导体", type: "400", arguments: "1" },
  { id: "pnp-darlington", label: "PNP 达林顿管", category: "半导体", type: "400", arguments: "-1" },
  { id: "nmos", label: "N 沟道 MOSFET", category: "半导体", type: "f", arguments: "0 0 0 0" },
  { id: "njfet", label: "N 沟道 JFET", category: "半导体", type: "j", arguments: "0 0 0 0" },
  { id: "opamp", label: "运算放大器", category: "模拟芯片", type: "a", arguments: "-15 15 1000000" },
  { id: "opamp-swap", label: "运算放大器（交换输入）", category: "模拟芯片", type: "a", arguments: "-15 15 1000000", flags: 9 },
  { id: "opamp-real", label: "非理想运算放大器", category: "模拟芯片", type: "409", arguments: "0.6 0 0.0231 0" },
  { id: "optocoupler", label: "光耦合器", category: "模拟芯片", type: "407", arguments: "1" },
  { id: "cccs", label: "电流控制电流源", category: "模拟芯片", type: "215", arguments: "2 2*a" },
  { id: "ota", label: "OTA 跨导放大器", category: "模拟芯片", type: "402", arguments: "" },
  { id: "transformer", label: "变压器", category: "模拟芯片", type: "T", arguments: "4 1 0 0.99" },
  { id: "custom-transformer", label: "自定义多绕组变压器", category: "模拟芯片", type: "406", arguments: "4 0.999 1,1:1 3 0 0 0" },
  { id: "relay", label: "继电器", category: "模拟芯片", type: "178", arguments: "0.2 0 1 0.01 1000 0.001 0" },
  { id: "dc-motor", label: "直流电机", category: "模拟芯片", type: "415", arguments: "0.5 1 0.15 0.15 0.02 0.05 1 0" },
  { id: "time-delay-relay", label: "延时继电器", category: "模拟芯片", type: "414", arguments: "1 0 1 10000000" },
  { id: "analog-mux", label: "模拟多路复用器", category: "模拟芯片", type: "432", arguments: "2 20 10000000000 2.5" },
  { id: "logic-input", label: "逻辑输入", category: "数字逻辑", type: "L", arguments: "0 false 5 0" },
  { id: "logic-output", label: "逻辑输出", category: "数字逻辑", type: "M", arguments: "2.5" },
  { id: "inverter", label: "非门", category: "数字逻辑", type: "I", arguments: "0.5 5" },
  { id: "tri-state", label: "三态缓冲器", category: "数字逻辑", type: "180", arguments: "0.1 10000000000 100000000 5" },
  { id: "and-gate", label: "与门", category: "数字逻辑", type: "150", arguments: "2 0 5" },
  { id: "nand-gate", label: "与非门", category: "数字逻辑", type: "151", arguments: "2 0 5" },
  { id: "or-gate", label: "或门", category: "数字逻辑", type: "152", arguments: "2 0 5" },
  { id: "nor-gate", label: "或非门", category: "数字逻辑", type: "153", arguments: "2 0 5" },
  { id: "xor-gate", label: "异或门", category: "数字逻辑", type: "154", arguments: "2 0 5" },
  { id: "xnor-gate", label: "同或门", category: "数字逻辑", type: "431", arguments: "2 0 5" },
  { id: "comparator", label: "比较器", category: "数字逻辑", type: "401", arguments: "" },
  { id: "half-adder", label: "半加器", category: "数字逻辑", type: "195", arguments: "" },
  { id: "d-flip-flop", label: "D 触发器", category: "数字芯片", type: "155", arguments: "" },
  { id: "jk-flip-flop", label: "JK 触发器", category: "数字芯片", type: "156", arguments: "" },
  { id: "counter", label: "计数器", category: "数字芯片", type: "164", arguments: "4" },
  { id: "timer-555", label: "555 定时器", category: "数字芯片", type: "165", arguments: "" },
  { id: "dac", label: "数模转换器", category: "数字芯片", type: "166", arguments: "4" },
  { id: "adc", label: "模数转换器", category: "数字芯片", type: "167", arguments: "4" },
  { id: "multiplexer", label: "多路复用器", category: "数字芯片", type: "184", arguments: "2" },
  { id: "delay-buffer", label: "延时缓冲器", category: "数字芯片", type: "422", arguments: "0.001 2.5 5" },
  { id: "sequence-generator", label: "序列发生器", category: "数字芯片", type: "188", arguments: "8 170", flags: 10 },
  { id: "monostable", label: "单稳态触发器", category: "数字芯片", type: "194", arguments: "false 0.01" },
  { id: "piso-shift", label: "并入串出移位寄存器", category: "数字芯片", type: "186", arguments: "8", flags: 2 },
  { id: "sipo-shift", label: "串入并出移位寄存器", category: "数字芯片", type: "189", arguments: "8" },
  { id: "sram", label: "静态 RAM", category: "数字芯片", type: "413", arguments: "4 4 -2" },
  { id: "seven-segment", label: "七段数码管", category: "显示与测量", type: "157", arguments: "" },
  { id: "probe", label: "电压探针", category: "显示与测量", type: "p", arguments: "" },
  { id: "test-point", label: "测试点", category: "显示与测量", type: "368", arguments: "0" },
  { id: "ohmmeter", label: "欧姆表", category: "显示与测量", type: "216", arguments: "0.01 0" },
  { id: "wattmeter", label: "功率表", category: "显示与测量", type: "420", arguments: "32 0" },
  { id: "stop-trigger", label: "停止触发器", category: "显示与测量", type: "408", arguments: "1 0 0" },
  { id: "data-recorder", label: "数据记录器", category: "显示与测量", type: "210", arguments: "10240" },
  { id: "output", label: "输出端", category: "显示与测量", type: "O", arguments: "" },
  { id: "text", label: "文本", category: "显示与测量", type: "x", arguments: "24 文本" },
  { id: "labeled-node", label: "带标签节点", category: "基础", type: "207", arguments: "" },
  { id: "analog-switch", label: "模拟开关", category: "基础", type: "159", arguments: "" },
  { id: "analog-switch-spdt", label: "模拟单刀双掷开关", category: "基础", type: "160", arguments: "" },
  { id: "cross-switch", label: "交叉开关", category: "基础", type: "430", arguments: "0 false" },
  { id: "motor-protection-switch", label: "电机保护开关", category: "基础", type: "428", arguments: "" },
  { id: "antenna", label: "天线信号源", category: "电源", type: "A", arguments: "" },
  { id: "am-source", label: "调幅信号源", category: "电源", type: "200", arguments: "1000 40 5" },
  { id: "fm-source", label: "调频信号源", category: "电源", type: "201", arguments: "800 40 5 200" },
  { id: "variable-rail", label: "可调电源轨", category: "电源", type: "172", arguments: "" },
  { id: "external-voltage", label: "外部电压源", category: "电源", type: "418", arguments: "" },
  { id: "memristor", label: "忆阻器", category: "半导体", type: "m", arguments: "" },
  { id: "spark-gap", label: "火花隙", category: "半导体", type: "187", arguments: "" },
  { id: "tunnel-diode", label: "隧道二极管", category: "半导体", type: "175", arguments: "" },
  { id: "varactor", label: "变容二极管", category: "半导体", type: "176", arguments: "" },
  { id: "diac", label: "双向触发二极管", category: "半导体", type: "203", arguments: "" },
  { id: "scr", label: "可控硅", category: "半导体", type: "177", arguments: "" },
  { id: "triac", label: "双向可控硅", category: "半导体", type: "206", arguments: "" },
  { id: "triode", label: "真空三极管", category: "半导体", type: "173", arguments: "" },
  { id: "unijunction", label: "单结晶体管", category: "半导体", type: "417", arguments: "" },
  { id: "lamp", label: "白炽灯", category: "半导体", type: "181", arguments: "" },
  { id: "transmission-line", label: "传输线", category: "模拟芯片", type: "171", arguments: "" },
  { id: "cc2", label: "第二代电流传输器", category: "模拟芯片", type: "179", arguments: "" },
  { id: "vcvs", label: "电压控制电压源", category: "模拟芯片", type: "212", arguments: "" },
  { id: "vccs", label: "电压控制电流源", category: "模拟芯片", type: "213", arguments: "" },
  { id: "ccvs", label: "电流控制电压源", category: "模拟芯片", type: "214", arguments: "" },
  { id: "relay-coil", label: "继电器线圈", category: "模拟芯片", type: "425", arguments: "" },
  { id: "relay-contact", label: "继电器触点", category: "模拟芯片", type: "426", arguments: "" },
  { id: "tapped-transformer", label: "中心抽头变压器", category: "模拟芯片", type: "169", arguments: "" },
  { id: "three-phase-motor", label: "三相电机", category: "模拟芯片", type: "427", arguments: "" },
  { id: "phase-comparator", label: "相位比较器", category: "模拟芯片", type: "161", arguments: "" },
  { id: "vco", label: "压控振荡器", category: "模拟芯片", type: "158", arguments: "" },
  { id: "counter-2", label: "可配置计数器", category: "数字芯片", type: "421", arguments: "" },
  { id: "ring-counter", label: "环形计数器", category: "数字芯片", type: "163", arguments: "" },
  { id: "latch", label: "锁存器", category: "数字芯片", type: "168", arguments: "" },
  { id: "seven-segment-decoder", label: "七段译码器", category: "数字芯片", type: "197", arguments: "" },
  { id: "rom", label: "只读存储器", category: "数字芯片", type: "436", arguments: "" },
  { id: "custom-logic", label: "自定义逻辑", category: "数字芯片", type: "208", arguments: "" },
  { id: "full-adder", label: "全加器", category: "数字芯片", type: "196", arguments: "" },
  { id: "demultiplexer", label: "多路分配器", category: "数字芯片", type: "185", arguments: "" },
  { id: "t-flip-flop", label: "T 触发器", category: "数字芯片", type: "193", arguments: "" },
  { id: "schmitt-trigger", label: "施密特触发器", category: "数字逻辑", type: "182", arguments: "" },
  { id: "inverting-schmitt", label: "反相施密特触发器", category: "数字逻辑", type: "183", arguments: "" },
  { id: "audio-output", label: "音频输出", category: "显示与测量", type: "211", arguments: "" },
  { id: "decimal-display", label: "十进制显示器", category: "显示与测量", type: "419", arguments: "" },
  { id: "scope-element", label: "示波器探针", category: "显示与测量", type: "403", arguments: "" },
  { id: "line", label: "绘图直线", category: "显示与测量", type: "423", arguments: "" },
  { id: "box", label: "绘图矩形", category: "显示与测量", type: "b", arguments: "" },
  { id: "bus-splitter", label: "总线分线器", category: "显示与测量", type: "433", arguments: "" },
  { id: "ammeter", label: "电流表", category: "显示与测量", type: "370", arguments: "" },
  { id: "crystal", label: "晶体谐振器", category: "显示与测量", type: "412", arguments: "" },
  { id: "led-array", label: "LED 阵列", category: "显示与测量", type: "405", arguments: "" },
  { id: "routed-wire", label: "正交导线", category: "基础", type: "__routedWire", arguments: "", xmlOnly: true },
  { id: "push-switch", label: "按钮开关", category: "基础", type: "s", arguments: "1 true" },
  { id: "ac-voltage", label: "交流电压源", category: "电源", type: "v", arguments: "1 60 170 0 0 0.5" },
  { id: "ac-rail", label: "交流电源轨", category: "电源", type: "R", arguments: "1 60 170 0 0 0.5" },
  { id: "square-rail", label: "方波电源轨", category: "电源", type: "R", arguments: "2 40 5 0 0 0.5" },
  { id: "clock", label: "时钟信号源", category: "电源", type: "R", arguments: "2 100 2.5 2.5 0 0.5", flags: 1 },
  { id: "pmos", label: "P 沟道 MOSFET", category: "半导体", type: "f", arguments: "1.5 0.02", flags: 33 },
  { id: "pjfet", label: "P 沟道 JFET", category: "半导体", type: "j", arguments: "-4 0.00125", flags: 1 },
  { id: "cc2-negative", label: "第二代负型电流传输器", category: "模拟芯片", type: "179", arguments: "-1" },
  { id: "gyrator", label: "回转器", category: "模拟芯片", type: "__gyrator", arguments: "", xmlOnly: true },
  { id: "bus-input", label: "总线逻辑输入", category: "数字逻辑", type: "__busInput", arguments: "", xmlOnly: true },
  { id: "bus-transceiver", label: "总线收发器", category: "数字芯片", type: "__busTransceiver", arguments: "4", xmlOnly: true },
  { id: "instruction-display", label: "指令显示器", category: "显示与测量", type: "__instruction", arguments: "", xmlOnly: true }
];

const COMPONENT_BY_ID = new Map(
  COMPONENTS.map((component) => [component.id, component])
);

interface ScopeChannel {
  elementIndex: number;
  value: number;
  name: string;
  elementLabel: string;
  unit: string;
  color: string;
  scale: number | null;
  samples: number[];
  read: () => number;
}

/** App-layer counterpart of legacy ScopeManager's Scope array. */
interface ScopeGroup {
  scopeId: number;
  panel: number;
  plots: ScopeChannel[];
}

export interface NativeCircuitApi {
  loadCircuit(source: string): void;
  exportCircuit(): string;
  setRunning(running: boolean): void;
  getElements(): readonly CircuitElm[];
  getTime(): number;
  /**
   * Regression-only observation point.  The caller must still use the real
   * canvas UI to perform an interaction; this merely returns a viewport
   * coordinate at which that interaction can be made.
   */
  getElementClickPoint(index: number): { x: number; y: number };
  /** Advance a paused simulation by a deterministic number of solver steps. */
  stepSimulation(steps?: number): { time: number; steps: number };
  /** Capture numerical state after a real UI action without exposing core APIs. */
  getDynamicSnapshot(): DynamicCircuitSnapshot;
  /** Test-only solver trace; used only by --diagnostic visual regression. */
  beginDiagnosticTrace(): void;
  recordDiagnosticTraceSnapshot(): void;
  consumeDiagnosticTrace(): ReturnType<CircuitRunner["consumeDiagnosticTrace"]>;
  /** Test-only UI locator; never mutates circuit or simulation state. */
  getElementRangeClickPoint(index: number): { x: number; y: number };
  /** Test-only layout observation; never changes the rendered UI. */
  getVisualRegressionLayout(): VisualRegressionLayout;
}

export interface VisualRegressionLayout {
  canvas: { width: number; height: number; cssWidth: number; cssHeight: number };
  scope: { width: number; height: number; cssWidth: number; cssHeight: number };
  workspaceOrigin: { x: number; y: number };
  workspace: { width: number; height: number };
  sidebarX: number;
  scopeY: number;
  toolbarVisible: boolean;
}

export interface DynamicCircuitElementSnapshot {
  index: number;
  type: string;
  volts: number[];
  voltageDiff: number;
  current: number;
  power: number;
  switchPosition: number | null;
  switchMomentary: boolean | null;
  sliderValue: number | null;
  voltage: number | null;
  position: number | null;
}

export interface DynamicScopeSnapshot {
  scopeId: number;
  plotCount: number;
  name: string;
  panel: number;
  unit: string;
  sampleCount: number;
  lastSample: number | null;
  minimum: number | null;
  maximum: number | null;
}

export interface DynamicCircuitSnapshot {
  time: number;
  timeStep: number;
  subIterations: number;
  running: boolean;
  elements: DynamicCircuitElementSnapshot[];
  scopes: DynamicScopeSnapshot[];
  scopeCount: number;
}

export class NativeCircuitApp {
  public readonly api: NativeCircuitApi;

  private readonly renderer = new CircuitCanvasRenderer();
  private readonly factory = new ElementFactory();
  private readonly canvas: HTMLCanvasElement;
  private readonly scopeCanvas: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly runButton: HTMLButtonElement;
  private readonly toolButtons: HTMLButtonElement[];
  private readonly fileInput: HTMLInputElement;
  private readonly textDialog: HTMLDialogElement;
  private readonly textArea: HTMLTextAreaElement;
  private readonly dialogTitle: HTMLElement;
  private readonly dialogApply: HTMLButtonElement;
  private readonly exampleDialog: HTMLDialogElement;
  private readonly exampleSearch: HTMLInputElement;
  private readonly exampleList: HTMLElement;
  private readonly componentDialog: HTMLDialogElement;
  private readonly componentSearch: HTMLInputElement;
  private readonly componentList: HTMLElement;
  private readonly contextMenu: HTMLElement;
  private toolShortcuts: ShortcutMap = { ...DEFAULT_TOOL_SHORTCUTS };
  private runner: CircuitRunner;
  private running = true;
  private selectedIndex: number | null = null;
  private readonly selectedIndices = new Set<number>();
  private activeTool: Tool = "select";
  private dragMode: "selected" | "all" | "row" | "column" | "post" =
    "selected";
  private stepsPerFrame = 24;
  private currentSpeed = 50;
  private editDisabled = false;
  private mouseWheelEdit = false;
  private gridSize = 16;
  private clipboard = "";
  private pasteOffset = 0;
  private contextPoint = new Point();
  private draft: DraftElement | null = null;
  private selectionBox: DraftElement | null = null;
  private readonly selectionBase = new Set<number>();
  private panStart: { x: number; y: number } | null = null;
  private elementDragPoint: Point | null = null;
  private dragIndices: number[] = [];
  private dragPostIndex: 0 | 1 = 0;
  private elementDragMoved = false;
  private wheelSensitivity = 1;
  private minimumFrameRate = 20;
  private autoDcOnReset = false;
  private pauseWhenUnfocused = false;
  private resumeAfterFocus = false;
  private history: string[] = [];
  private historyIndex = -1;
  private scopeGroups: ScopeGroup[] = [];
  private heldMomentarySwitch: SwitchElm | null = null;
  /** Legacy CustomCompositeElm remembers the most recently chosen model. */
  private lastDrawSubcircuitModel: string | null = null;
  private lastFrameTime = performance.now();
  private errorMessage: string | null = null;
  private static readonly AUTOSAVE_KEY = "circuitjs1-ts-autosave";

  public constructor(private readonly root: HTMLElement) {
    this.root.innerHTML = NativeCircuitApp.template();
    this.loadShortcuts();
    this.loadApplicationSettings();
    this.applyModificationSettings();
    this.canvas = this.requireElement("circuit-canvas", HTMLCanvasElement);
    this.scopeCanvas = this.requireElement(
      "scope-canvas",
      HTMLCanvasElement
    );
    this.status = this.requireElement("native-status", HTMLElement);
    this.runButton = this.requireElement("run-toggle", HTMLButtonElement);
    this.toolButtons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>("[data-tool]")
    );
    this.fileInput = this.requireElement("circuit-file", HTMLInputElement);
    this.textDialog = this.requireElement(
      "circuit-text-dialog",
      HTMLDialogElement
    );
    this.textArea = this.requireElement(
      "circuit-text",
      HTMLTextAreaElement
    );
    this.dialogTitle = this.requireElement("dialog-title", HTMLElement);
    this.dialogApply = this.requireElement(
      "dialog-apply",
      HTMLButtonElement
    );
    this.exampleDialog = this.requireElement(
      "example-dialog",
      HTMLDialogElement
    );
    this.exampleSearch = this.requireElement(
      "example-search",
      HTMLInputElement
    );
    this.exampleList = this.requireElement(
      "example-list",
      HTMLElement
    );
    this.componentDialog = this.requireElement(
      "component-search-dialog",
      HTMLDialogElement
    );
    this.componentSearch = this.requireElement(
      "component-search",
      HTMLInputElement
    );
    this.componentList = this.requireElement(
      "component-list",
      HTMLElement
    );
    this.contextMenu = this.requireElement(
      "element-context-menu",
      HTMLElement
    );
    const linkedCircuit = NativeCircuitApp.readLinkedCircuit();
    try {
      this.runner = linkedCircuit === null
        ? CircuitRunner.fromText(DEFAULT_CIRCUIT)
        : linkedCircuit.trimStart().startsWith("<")
          ? CircuitRunner.fromXml(linkedCircuit)
          : CircuitRunner.fromText(linkedCircuit);
      this.runner.analyzeCircuit();
    } catch {
      this.runner = CircuitRunner.fromText(DEFAULT_CIRCUIT);
    }
    this.api = {
      loadCircuit: (source) => this.loadCircuit(source),
      exportCircuit: () => this.serializeCircuit(),
      setRunning: (running) => this.setRunning(running),
      getElements: () => this.runner.elements,
      getTime: () => this.runner.simulation.t,
      getElementClickPoint: (index) => this.getElementClickPoint(index),
      getElementRangeClickPoint: (index) => this.getElementRangeClickPoint(index),
      getVisualRegressionLayout: () => this.getVisualRegressionLayout(),
      stepSimulation: (steps) => this.stepSimulation(steps),
      getDynamicSnapshot: () => this.getDynamicSnapshot(),
      beginDiagnosticTrace: () => this.runner.beginDiagnosticTrace(),
      recordDiagnosticTraceSnapshot: () => this.runner.recordDiagnosticTraceSnapshot(),
      consumeDiagnosticTrace: () => this.runner.consumeDiagnosticTrace()
    };

    this.bindEvents();
    this.syncShortcutLabels();
    this.renderExampleList();
    this.renderComponentSearch();
    this.syncOptionButtons();
    this.root
      .querySelector<HTMLElement>("#tool-mode-label")
      ?.classList.toggle(
        "hidden",
        !this.getStoredOption("show-mode", true)
      );
    this.updateRunButtonAppearance();
    this.syncResistorToolbarIcon();
    this.configureScopeChannels();
    this.refreshDrawSubcircuitMenu();
    this.commitHistory(false);
    this.updateInspector();
    this.setTool("select");
    requestAnimationFrame(() => {
      this.fitToView();
      this.animationFrame(performance.now());
    });
  }

  public loadCircuit(
    source: string,
    fit = true,
    recordHistory = true
  ): void {
    const loader = new CircuitLoader();
    const circuitDocument = loader.readCircuit(source);
    const nextRunner = source.trimStart().startsWith("<")
      ? CircuitRunner.fromXml(source)
      : CircuitRunner.fromText(source);
    nextRunner.analyzeCircuit();
    this.runner = nextRunner;
    this.applyCircuitDisplayFlags(
      circuitDocument.format === "text"
        ? circuitDocument.flags
        : loader.readCircuitFlags(circuitDocument.options.flags)
    );
    this.selectedIndex = null;
    this.selectedIndices.clear();
    this.draft = null;
    this.selectionBox = null;
    this.selectionBase.clear();
    this.panStart = null;
    this.elementDragPoint = null;
    this.dragIndices = [];
    this.elementDragMoved = false;
    this.errorMessage = null;
    this.configureScopeChannels();
    this.refreshDrawSubcircuitMenu();
    this.syncOptionButtons();
    if (recordHistory) {
      this.commitHistory();
    }
    this.updateInspector();
    if (fit) {
      requestAnimationFrame(() => this.fitToView());
    }
  }

  public setRunning(running: boolean): void {
    this.running = running;
    this.updateRunButtonAppearance();
    this.runButton.classList.toggle("active", running);
  }

  private getElementClickPoint(index: number): { x: number; y: number } {
    const element = this.runner.elements[index];
    if (element === undefined) {
      throw new RangeError(`Element index ${index} is outside the circuit`);
    }
    // Logic-input controls use the label at point2 as their click hot-zone;
    // their wire midpoint is not interactive in the legacy UI either.
    let modelPoint = new Point(
      (element.point1.x + element.point2.x) / 2,
      (element.point1.y + element.point2.y) / 2
    );
    if (element instanceof LogicInputElm || element instanceof BusLogicInputElm) {
      modelPoint = new Point(element.point2);
    } else if (element instanceof SwitchElm) {
      const bounds = getSwitchInteractionBounds(element);
      modelPoint = new Point(
        (bounds.left + bounds.right) / 2,
        (bounds.top + bounds.bottom) / 2
      );
    }
    const canvasPoint = this.renderer.modelToScreen(modelPoint);
    const bounds = this.canvas.getBoundingClientRect();
    return { x: bounds.left + canvasPoint.x, y: bounds.top + canvasPoint.y };
  }

  private getElementRangeClickPoint(index: number): { x: number; y: number } {
    const element = this.runner.elements[index];
    if (element === undefined) {
      throw new RangeError(`Element index ${index} is outside the circuit`);
    }
    const candidates = element instanceof PotElm
      ? [element.post3, element.midpoint, element.point1, element.point2]
      : [element.point1, element.point2];
    for (const modelPoint of candidates) {
      const point = this.renderer.modelToScreen(modelPoint);
      if (this.renderer.hitTest(this.runner.elements, point.x, point.y) === index) {
        const box = this.canvas.getBoundingClientRect();
        return { x: box.left + point.x, y: box.top + point.y };
      }
    }
    throw new Error(`No Canvas-visible interaction point for element ${index}`);
  }

  private stepSimulation(steps = 1): { time: number; steps: number } {
    if (!Number.isInteger(steps) || steps < 0 || steps > 100_000) {
      throw new RangeError("Simulation step count must be an integer from 0 to 100000");
    }
    this.setRunning(false);
    for (let index = 0; index < steps; index += 1) {
      this.runner.runCircuit(200);
      this.recordScope();
    }
    this.updateInspector();
    return { time: this.runner.simulation.t, steps };
  }

  private getVisualRegressionLayout(): VisualRegressionLayout {
    const box = this.canvas.getBoundingClientRect();
    const scope = this.scopeCanvas.getBoundingClientRect();
    const sidebar = this.root.querySelector<HTMLElement>(".control-panel")?.getBoundingClientRect();
    const toolbar = this.root.querySelector<HTMLElement>(".tool-bar");
    return {
      canvas: { width: this.canvas.width, height: this.canvas.height, cssWidth: box.width, cssHeight: box.height },
      scope: { width: this.scopeCanvas.width, height: this.scopeCanvas.height, cssWidth: scope.width, cssHeight: scope.height },
      workspaceOrigin: { x: box.left, y: box.top },
      workspace: { width: box.width, height: box.height },
      sidebarX: sidebar?.left ?? box.right,
      // A hidden scope has no visual boundary.  Report the bottom of the
      // workspace so callers crop no fictitious bottom panel.
      scopeY: this.hasScopes() ? scope.top : box.bottom,
      toolbarVisible: toolbar !== null && !toolbar.classList.contains("hidden")
    };
  }

  private getDynamicSnapshot(): DynamicCircuitSnapshot {
    return {
      time: this.runner.simulation.t,
      timeStep: this.runner.simulation.timeStep,
      subIterations: this.runner.simulation.subIterations,
      running: this.running,
      elements: this.runner.elements.map((element, index) => ({
        index,
        type: element.getClassName(),
        volts: [...element.volts],
        voltageDiff: element.getVoltageDiff(),
        current: element.getCurrent(),
        power: element.getPower(),
        switchPosition: element instanceof SwitchElm ? element.position : null,
        switchMomentary: element instanceof SwitchElm ? element.momentary : null,
        sliderValue:
          element instanceof VarRailElm ? element.sliderValue : null,
        voltage: element instanceof VarRailElm ? element.getVoltage() : null,
        position: element instanceof PotElm ? element.position : null
      })),
      scopes: this.scopeGroups.flatMap((group) => group.plots.map((channel) => {
        const values = channel.samples.filter(Number.isFinite);
        return {
          scopeId: group.scopeId,
          plotCount: group.plots.length,
          name: channel.name,
          panel: group.panel,
          unit: channel.unit,
          sampleCount: channel.samples.length,
          lastSample:
            channel.samples.length === 0
              ? null
              : channel.samples[channel.samples.length - 1] ?? null,
          minimum: values.length === 0 ? null : Math.min(...values),
          maximum: values.length === 0 ? null : Math.max(...values)
        };
      })),
      scopeCount: this.scopeCount()
    };
  }

  private closeMainMenus(except?: HTMLDetailsElement): boolean {
    let closed = false;
    this.root
      .querySelectorAll<HTMLDetailsElement>(".menu-bar > details[open]")
      .forEach((details) => {
        if (details !== except) {
          details.removeAttribute("open");
          closed = true;
        }
      });
    return closed;
  }

  private bindEvents(): void {
    this.root.addEventListener("pointerover", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const summary = target.closest("summary");
      const owner = summary?.parentElement;
      if (owner?.parentElement?.classList.contains("menu-bar")) {
        const details = owner as HTMLDetailsElement;
        this.closeMainMenus(details);
        details.open = true;
      }
    });
    this.root.addEventListener("pointerdown", (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".menu-bar > details") === null
      ) {
        this.closeMainMenus();
      }
    });
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("#element-context-menu") === null) {
        this.contextMenu.hidden = true;
      }
      const summary = target.closest("summary");
      if (summary !== null) {
        const owner = summary.parentElement;
        if (owner?.parentElement?.classList.contains("menu-bar")) {
          event.preventDefault();
          const details = owner as HTMLDetailsElement;
          this.closeMainMenus(details);
          details.open = true;
        } else if (owner?.classList.contains("component-submenu")) {
          owner.parentElement
            ?.querySelectorAll<HTMLDetailsElement>(
              ":scope > .component-submenu[open]"
            )
            .forEach((details) => {
              if (details !== owner) details.removeAttribute("open");
            });
        }
      }
      const exampleButton = target.closest<HTMLElement>("[data-example]");
      if (exampleButton !== null) {
        this.closeMainMenus();
        this.loadExample(exampleButton.dataset.example ?? "");
        return;
      }
      const actionButton = target.closest<HTMLElement>("[data-action]");
      if (actionButton !== null) {
        actionButton.closest("details")?.removeAttribute("open");
        this.closeMainMenus();
        actionButton.closest(".context-menu")?.setAttribute("hidden", "");
        this.handleAction(actionButton.dataset.action ?? "");
      }
      const toolButton = target.closest<HTMLButtonElement>("[data-tool]");
      if (toolButton !== null) {
        toolButton.closest("details")?.removeAttribute("open");
        toolButton.closest("dialog")?.close();
        const tool = (toolButton.dataset.tool ?? "select") as Tool;
        const palette = toolButton.closest<HTMLElement>(".tool-palette");
        const variant = toolButton.closest<HTMLElement>(".tool-variant");
        if (palette !== null && variant !== null) {
          const mainButton =
            variant.querySelector<HTMLButtonElement>(":scope > .tool-button");
          if (mainButton !== null) {
            mainButton.innerHTML = toolButton.innerHTML;
            mainButton.dataset.tool = tool;
            mainButton.title = toolButton.title;
          }
        }
        this.setTool(
          palette === null && this.activeTool === tool ? "select" : tool
        );
      }
    });
    this.exampleSearch.addEventListener("input", () =>
      this.renderExampleList(this.exampleSearch.value)
    );
    this.componentSearch.addEventListener("input", () =>
      this.renderComponentSearch(this.componentSearch.value)
    );

    this.root.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.dataset.control === "simulation-speed") {
        this.stepsPerFrame = Math.max(
          1,
          Math.round(2 ** (Number(target.value) / 12))
        );
      } else if (target.dataset.control === "current-speed") {
        this.currentSpeed = Number(target.value);
      } else if (target.dataset.parameter !== undefined) {
        this.updateElementParameter(
          target.dataset.parameter,
          Number(target.value)
        );
      } else if (target.dataset.elementRange !== undefined) {
        this.updateElementRange(
          target.dataset.elementRange,
          Number(target.value),
          target
        );
      } else if (target.dataset.elementProperty !== undefined) {
        this.updateElementProperty(
          target.dataset.elementProperty,
          Number(target.value)
        );
      }
    });
    this.root.addEventListener("change", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        (target.dataset.elementProperty !== undefined ||
          target.dataset.elementRange !== undefined)
      ) {
        this.commitHistory();
        if (target.dataset.elementRange !== undefined) {
          this.updateInspector();
        }
      }
    });

    this.canvas.addEventListener("pointerdown", (event) =>
      this.onPointerDown(event)
    );
    this.canvas.addEventListener("pointermove", (event) =>
      this.onPointerMove(event)
    );
    this.canvas.addEventListener("pointerup", (event) =>
      this.onPointerUp(event)
    );
    this.canvas.addEventListener("pointercancel", () => {
      this.releaseHeldMomentarySwitch();
      this.draft = null;
      this.selectionBox = null;
      this.selectionBase.clear();
      this.panStart = null;
      this.elementDragPoint = null;
      this.elementDragMoved = false;
    });
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showContextMenu(event);
    });
    this.canvas.addEventListener("pointerleave", () => {
      this.renderer.crosshair = null;
    });
    this.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (this.mouseWheelEdit && this.adjustSelectedByWheel(event.deltaY)) {
          return;
        }
        const position = this.canvasPosition(event);
        const zoomStep = Math.pow(1.12, this.wheelSensitivity);
        this.renderer.zoomAt(
          position.x,
          position.y,
          event.deltaY < 0 ? zoomStep : 1 / zoomStep
        );
      },
      { passive: false }
    );

    this.fileInput.addEventListener("change", () => {
      const file = this.fileInput.files?.[0];
      if (file === undefined) {
        return;
      }
      void file.text().then((source) => {
        try {
          this.loadCircuit(source);
        } catch (error) {
          this.showError(error);
        }
        this.fileInput.value = "";
      });
    });

    this.dialogApply.addEventListener("click", () => {
      if (this.dialogApply.dataset.mode === "import") {
        try {
          this.loadCircuit(this.textArea.value);
          this.textDialog.close();
        } catch (error) {
          this.showError(error);
        }
      } else if (this.dialogApply.dataset.mode === "export") {
        void navigator.clipboard?.writeText(this.textArea.value);
        this.textDialog.close();
      } else {
        this.textDialog.close();
      }
    });

    this.root
      .querySelector<HTMLButtonElement>("#shortcut-apply")
      ?.addEventListener("click", () => this.applyShortcutDialog());
    this.root
      .querySelector<HTMLButtonElement>("#shortcut-reset")
      ?.addEventListener("click", () => {
        this.toolShortcuts = { ...DEFAULT_TOOL_SHORTCUTS };
        this.renderShortcutRows();
      });
    this.root
      .querySelector<HTMLButtonElement>("#subcircuit-delete")
      ?.addEventListener("click", () => this.deleteSelectedSubcircuit());
    this.root
      .querySelector<HTMLButtonElement>("#subcircuit-create")
      ?.addEventListener("click", () => this.createSubcircuit());
    this.root
      .querySelector<HTMLButtonElement>("#options-apply")
      ?.addEventListener("click", () => this.applyOptionsDialog());
    this.root
      .querySelector<HTMLButtonElement>("#options-reset-colors")
      ?.addEventListener("click", () => this.resetOptionColors());
    this.root
      .querySelector<HTMLButtonElement>("#open-modification-setup")
      ?.addEventListener("click", () => this.openModificationFromOptions());
    this.root
      .querySelector<HTMLButtonElement>("#modification-apply")
      ?.addEventListener("click", () => this.applyModificationDialog());
    this.root
      .querySelector<HTMLFormElement>("#element-edit-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        this.applyElementEditor();
      });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-dialog-close]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          button.closest("dialog")?.close()
        )
      );
    this.root
      .querySelectorAll<HTMLDialogElement>("dialog.settings-dialog")
      .forEach((dialog) => this.makeDialogDraggable(dialog));

    window.addEventListener("keydown", (event) =>
      this.onKeyDown(event)
    );
    window.addEventListener("resize", () => this.resizeCanvases());
    window.addEventListener("blur", () => {
      if (!this.pauseWhenUnfocused || !this.running) return;
      this.resumeAfterFocus = true;
      this.setRunning(false);
    });
    window.addEventListener("focus", () => {
      if (!this.resumeAfterFocus) return;
      this.resumeAfterFocus = false;
      this.setRunning(true);
    });
  }

  private handleAction(action: string): void {
    if (
      this.editDisabled &&
      [
        "undo", "redo", "delete", "cut", "copy", "paste", "duplicate",
        "select-all", "search-component", "zoom-100", "zoom-in", "zoom-out",
        "flip-x", "flip-y", "flip-xy", "fit", "scope-stack",
        "scope-unstack", "scope-separate", "scope-combine", "scope-reset",
        "scope-export-csv", "convert-wires", "edit-selected", "scope-selected",
        "swap-terminals", "split-wire"
      ].includes(action)
    ) {
      this.notifyEditingDisabled();
      return;
    }
    switch (action) {
      case "new":
        this.createNewCircuit();
        break;
      case "open":
        this.fileInput.click();
        break;
      case "save":
        this.downloadCircuit();
        break;
      case "export-link":
        this.exportAsLink();
        break;
      case "export-image":
        this.exportCanvasImage();
        break;
      case "copy-image":
        void this.copyCanvasImage();
        break;
      case "export-svg":
        this.exportCanvasSvg();
        break;
      case "print":
        window.print();
        break;
      case "fullscreen":
        void this.toggleFullscreen();
        break;
      case "recover":
        this.recoverAutosave();
        break;
      case "dc-analysis":
        this.findDcOperatingPoint();
        break;
      case "import-text":
        this.openTextDialog("导入电路文本", "import", "");
        break;
      case "import-dropbox":
        this.openTextDialog(
          "Dropbox 导入不可用",
          "notice",
          [
            "原版 CircuitJS1 通过 Dropbox 的专用网页集成选择文件。",
            "原生 TypeScript 版尚未集成 Dropbox，且不会把此菜单伪装成云端导入。",
            "请先从 Dropbox 下载电路文件，再使用“打开文件…”；也可以复制内容后使用“从文本导入…”。"
          ].join("\n\n")
        );
        break;
      case "create-subcircuit":
        this.openCreateSubcircuitDialog();
        break;
      case "export-text":
        this.openTextDialog(
          "导出电路文本",
          "export",
          this.serializeCircuit()
        );
        break;
      case "examples":
        this.exampleSearch.value = "";
        this.renderExampleList();
        this.exampleDialog.showModal();
        this.exampleSearch.focus();
        break;
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      case "delete":
        this.deleteSelected();
        break;
      case "cut":
        this.copySelection();
        this.deleteSelected();
        break;
      case "copy":
        this.copySelection();
        break;
      case "paste":
        void this.pasteSelection();
        break;
      case "duplicate":
        this.copySelection(false);
        void this.pasteSelection();
        break;
      case "select-all":
        this.selectAll();
        break;
      case "search-component":
        this.componentSearch.value = "";
        this.renderComponentSearch();
        this.componentDialog.showModal();
        this.componentSearch.focus();
        break;
      case "zoom-100":
        this.zoomTo(1);
        break;
      case "zoom-in":
        this.zoomBy(1.25);
        break;
      case "zoom-out":
        this.zoomBy(0.8);
        break;
      case "flip-x":
        this.flipSelection("x");
        break;
      case "flip-y":
        this.flipSelection("y");
        break;
      case "flip-xy":
        this.flipSelection("xy");
        break;
      case "edit-selected":
        this.openElementEditor();
        break;
      case "scope-selected":
        this.addSelectedToScope();
        break;
      case "swap-terminals":
        this.swapSelectedTerminals();
        break;
      case "split-wire":
        this.splitSelectedWire();
        break;
      case "fit":
        this.centerCircuit();
        break;
      case "scope-stack":
        this.stackAllScopes();
        this.commitHistory();
        break;
      case "scope-unstack":
        this.unstackAllScopes();
        this.commitHistory();
        break;
      case "scope-separate":
        this.separateAllScopes();
        this.commitHistory();
        break;
      case "scope-combine":
        this.combineAllScopes();
        this.commitHistory();
        break;
      case "scope-reset":
        for (const channel of this.scopeGroups.flatMap((group) => group.plots)) channel.samples.length = 0;
        break;
      case "scope-export-csv":
        this.exportScopeCsv();
        break;
      case "convert-wires":
        this.convertWiresToRouted();
        break;
      case "drag-selected":
        this.setDragMode("selected");
        break;
      case "drag-all":
        this.setDragMode("all");
        break;
      case "drag-row":
        this.setDragMode("row");
        break;
      case "drag-column":
        this.setDragMode("column");
        break;
      case "drag-post":
        this.setDragMode("post");
        break;
      case "toggle-current":
      case "toggle-voltage":
      case "toggle-power":
      case "toggle-values":
      case "toggle-small-grid":
      case "toggle-toolbar":
      case "toggle-crosshair":
      case "toggle-show-mode":
      case "toggle-euro-resistor":
      case "toggle-iec-gates":
      case "toggle-white-background":
      case "toggle-current-convention":
      case "toggle-disable-editing":
      case "toggle-wheel-edit":
        this.toggleOption(action);
        break;
      case "shortcuts":
        this.openShortcutDialog();
        break;
      case "subcircuits":
        this.openSubcircuitDialog();
        break;
      case "other-options":
        this.openOptionsDialog();
        break;
      case "modification-setup":
        this.openModificationDialog();
        break;
      case "toggle-sidebar":
        this.toggleSidebar();
        break;
      case "reset":
        this.resetSimulation();
        break;
      case "run":
        this.setRunning(!this.running);
        break;
      case "about":
        this.openTextDialog(
          "关于原生 TypeScript 版本",
          "export",
          [
            "CircuitJS1 Native TypeScript",
            "",
            "当前页面、Canvas 绘制、仿真循环、交互和示波器均由 TypeScript 运行。",
            "不加载 GWT、旧版 JavaScript 编译产物或远程兼容页面。",
            `已内置 ${circuitExamples.length} 个原版示例。`
          ].join("\n")
        );
        break;
      default:
        break;
    }
  }

  private makeDialogDraggable(dialog: HTMLDialogElement): void {
    const handle = dialog.querySelector<HTMLElement>(
      ".settings-dialog-body > header"
    );
    if (handle === null) return;
    let drag:
      | {
          pointerId: number;
          offsetX: number;
          offsetY: number;
          width: number;
          height: number;
          scale: number;
        }
      | null = null;

    handle.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (event.target instanceof Element &&
          event.target.closest("button, input, select, textarea") !== null)
      ) {
        return;
      }
      const rectangle = dialog.getBoundingClientRect();
      const scale = Number.parseFloat(this.root.style.zoom) || 1;
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rectangle.left,
        offsetY: event.clientY - rectangle.top,
        width: rectangle.width,
        height: rectangle.height,
        scale
      };
      dialog.style.margin = "0";
      dialog.style.left = `${rectangle.left / scale}px`;
      dialog.style.top = `${rectangle.top / scale}px`;
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("dragging");
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (drag === null || event.pointerId !== drag.pointerId) return;
      const margin = 8;
      const maxLeft = Math.max(margin, window.innerWidth - drag.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - drag.height - margin);
      const left = Math.min(
        maxLeft,
        Math.max(margin, event.clientX - drag.offsetX)
      );
      const top = Math.min(
        maxTop,
        Math.max(margin, event.clientY - drag.offsetY)
      );
      dialog.style.left = `${left / drag.scale}px`;
      dialog.style.top = `${top / drag.scale}px`;
    });

    const finishDrag = (event: PointerEvent) => {
      if (drag === null || event.pointerId !== drag.pointerId) return;
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      handle.classList.remove("dragging");
      drag = null;
    };
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
  }

  private loadExample(id: string): void {
    const example = circuitExamples.find((item) => item.id === id);
    if (example === undefined) return;
    try {
      this.loadCircuit(example.source);
      this.exampleDialog.close();
    } catch (error) {
      this.showError(error);
    }
  }

  private createNewCircuit(): void {
    this.loadCircuit(EMPTY_CIRCUIT);
    this.setTool("select");
    this.setRunning(true);
  }

  private renderExampleList(query = ""): void {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const matches = circuitExamples.filter((example) =>
      normalized.length === 0 ||
      example.name.toLocaleLowerCase("zh-CN").includes(normalized) ||
      example.id.toLocaleLowerCase("zh-CN").includes(normalized)
    );
    this.exampleList.replaceChildren(
      ...matches.map((example) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.example = example.id;
        const name = document.createElement("span");
        name.textContent = example.name;
        const file = document.createElement("small");
        file.textContent =
          example.categoryPath.length > 0
            ? example.categoryPath.join(" › ")
            : example.id;
        button.title = example.id;
        button.append(name, file);
        return button;
      })
    );
    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "example-empty";
      empty.textContent = "没有匹配的示例";
      this.exampleList.append(empty);
    }
  }

  private renderComponentSearch(query = ""): void {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    const matches = COMPONENTS.filter(
      (component) =>
        normalized.length === 0 ||
        component.label.toLocaleLowerCase("zh-CN").includes(normalized) ||
        component.id.toLocaleLowerCase("zh-CN").includes(normalized) ||
        component.category.toLocaleLowerCase("zh-CN").includes(normalized)
    );
    this.componentList.replaceChildren(
      ...matches.map((component) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.tool = component.id;
        const name = document.createElement("span");
        name.textContent = component.label;
        const category = document.createElement("small");
        category.textContent = component.category;
        button.append(name, category);
        return button;
      })
    );
    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "example-empty";
      empty.textContent = "没有匹配的元件";
      this.componentList.append(empty);
    }
  }

  private getDragIndices(selectedIndex: number): number[] {
    if (this.dragMode === "all") {
      return this.runner.elements.map((_, index) => index);
    }
    if (this.dragMode === "row") {
      const selected = this.runner.elements[selectedIndex];
      return this.runner.elements
        .map((element, index) => ({ element, index }))
        .filter(
          ({ element }) =>
            element.y === selected.y ||
            element.y2 === selected.y ||
            element.y === selected.y2 ||
            element.y2 === selected.y2
        )
        .map(({ index }) => index);
    }
    if (this.dragMode === "column") {
      const selected = this.runner.elements[selectedIndex];
      return this.runner.elements
        .map((element, index) => ({ element, index }))
        .filter(
          ({ element }) =>
            element.x === selected.x ||
            element.x2 === selected.x ||
            element.x === selected.x2 ||
            element.x2 === selected.x2
        )
        .map(({ index }) => index);
    }
    return this.selectedIndices.size > 0
      ? [...this.selectedIndices]
      : [selectedIndex];
  }

  private setDragMode(
    mode: "selected" | "all" | "row" | "column" | "post"
  ): void {
    this.dragMode = mode;
    this.setTool("select");
    this.syncOptionButtons();
  }

  private selectAll(): void {
    if (this.editDisabled) {
      this.notifyEditingDisabled();
      return;
    }
    this.selectedIndices.clear();
    this.runner.elements.forEach((_, index) =>
      this.selectedIndices.add(index)
    );
    this.selectedIndex =
      this.runner.elements.length === 0
        ? null
        : this.runner.elements.length - 1;
    this.updateInspector();
  }

  private copySelection(writeToSystemClipboard = true): void {
    if (this.editDisabled) {
      this.notifyEditingDisabled();
      return;
    }
    if (this.selectedIndices.size === 0) return;
    const document = globalThis.document.implementation.createDocument(
      "",
      "cir"
    );
    const root = document.documentElement;
    root.setAttribute("ts", String(this.runner.simulation.maxTimeStep));
    for (const record of this.runner.preservedXmlRecords.filter(
      (record) => record.kind === "model"
    )) {
      root.append(this.xmlRecordToElement(document, record));
    }
    for (const index of [...this.selectedIndices].sort((a, b) => a - b)) {
      const element = this.runner.elements[index];
      if (element === undefined) continue;
      const xmlElement = document.createElement(element.getXmlDumpType());
      element.dumpXml(document, xmlElement);
      root.append(xmlElement);
    }
    this.clipboard =
      new globalThis.XMLSerializer().serializeToString(document);
    this.pasteOffset = 0;
    if (writeToSystemClipboard) {
      void navigator.clipboard?.writeText(this.clipboard);
    }
    this.syncEditMenuState();
  }

  private async pasteSelection(): Promise<void> {
    if (this.editDisabled) {
      this.notifyEditingDisabled();
      return;
    }
    let source = this.clipboard;
    if (source.length === 0) {
      try {
        source = await navigator.clipboard.readText();
      } catch {
        return;
      }
    }
    let elements: CircuitElm[];
    if (source.trimStart().startsWith("<")) {
      elements = [...CircuitRunner.fromXml(source).elements];
    } else {
      const document = new CircuitLoader().readCircuit(source);
      if (document.format !== "text") return;
      elements = document.records
        .filter((record) => record.kind === "element")
        .map((record) => this.factory.createFromRecord(record))
        .filter((element): element is CircuitElm => element !== null);
    }
    if (elements.length === 0) return;
    this.pasteOffset += this.gridSize;
    this.selectedIndices.clear();
    for (const element of elements) {
      element.move(this.pasteOffset, this.pasteOffset);
      this.runner.elements.push(element);
      this.selectedIndices.add(this.runner.elements.length - 1);
    }
    for (const element of this.runner.elements) {
      element.setParentList(this.runner.elements);
    }
    this.selectedIndex = this.runner.elements.length - 1;
    this.runner.analyzed = false;
    this.configureScopeChannels();
    this.commitHistory();
    this.updateInspector();
  }

  private flipSelection(axis: "x" | "y" | "xy"): void {
    if (this.editDisabled) {
      this.notifyEditingDisabled();
      return;
    }
    const selected = this.selectedIndices.size > 0;
    const elements = selected
      ? [...this.selectedIndices]
          .map((index) => this.runner.elements[index])
          .filter((element): element is CircuitElm => element !== undefined)
      : this.runner.elements;
    if (elements.length === 0) return;
    const xs = elements.flatMap((element) => [element.x, element.x2]);
    const ys = elements.flatMap((element) => [element.y, element.y2]);
    const center2X = Math.min(...xs) + Math.max(...xs);
    const center2Y = Math.min(...ys) + Math.max(...ys);
    const count = selected ? elements.length : 0;
    for (const element of elements) {
      if (axis === "x") element.flipX(center2X, count);
      else if (axis === "y") element.flipY(center2Y, count);
      else element.flipXY(this.snap((center2X - center2Y) / 2), count);
    }
    this.runner.analyzed = false;
    this.commitHistory();
    this.updateInspector();
  }

  private canEditElement(element: CircuitElm): boolean {
    if (element instanceof SwitchElm) return true;
    return (
      this.root.querySelector("#element-properties .property-row") !== null
    );
  }

  private openElementEditor(): void {
    if (this.editDisabled || this.selectedIndex === null) return;
    const element = this.runner.elements[this.selectedIndex];
    this.updateInspector();

    const dialog = this.requireElement(
      "element-edit-dialog",
      HTMLDialogElement
    );
    const title = this.requireElement("element-edit-title", HTMLElement);
    const subtitle = this.requireElement(
      "element-edit-subtitle",
      HTMLElement
    );
    const fields = this.requireElement("element-edit-fields", HTMLElement);
    const error = this.requireElement("element-edit-error", HTMLElement);
    title.textContent = "编辑属性";
    subtitle.textContent = element.getClassName();
    error.textContent = "";
    fields.replaceChildren();

    const addTextField = (
      labelText: string,
      value: string,
      dataName: string,
      dataValue: string,
      unit = "",
      options: { integer?: boolean; min?: number; max?: number } = {}
    ) => {
      const label = document.createElement("label");
      label.className = "element-edit-row";
      const caption = document.createElement("span");
      caption.textContent = labelText;
      const control = document.createElement("span");
      control.className = "element-edit-control";
      const input = document.createElement("input");
      input.type = options.integer ? "number" : "text";
      input.value = value;
      input.required = true;
      input.dataset[dataName] = dataValue;
      if (options.integer) input.step = "1";
      if (options.min !== undefined) input.min = String(options.min);
      if (options.max !== undefined) input.max = String(options.max);
      const suffix = document.createElement("small");
      suffix.textContent = unit;
      control.append(input, suffix);
      label.append(caption, control);
      fields.append(label);
    };
    const addCheckbox = (
      labelText: string,
      checked: boolean,
      key: string
    ) => {
      const label = document.createElement("label");
      label.className = "element-edit-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.dataset.editSwitch = key;
      label.append(input, document.createTextNode(labelText));
      fields.append(label);
    };

    if (element instanceof Switch2Elm) {
      addCheckbox("瞬时开关", element.momentary, "momentary");
      addTextField(
        "联动组号",
        String(element.link),
        "editSwitch",
        "link",
        "",
        { integer: true, min: 0, max: 100 }
      );
      addTextField(
        "掷位数",
        String(element.throwCount),
        "editSwitch",
        "throwCount",
        "",
        { integer: true, min: 2, max: 10 }
      );
    } else if (element instanceof SwitchElm) {
      addCheckbox("瞬时开关", element.momentary, "momentary");
      addCheckbox("IEC 符号", element.useIECSymbol(), "iec");
      addTextField(
        "联动标签",
        element.label ?? "",
        "editSwitch",
        "label"
      );
      addTextField(
        "键盘快捷键",
        element.keyShortcut ?? "",
        "editSwitch",
        "keyShortcut"
      );
    } else {
      const sourceRows = this.root.querySelectorAll<HTMLElement>(
        "#element-properties .property-row"
      );
      for (const sourceRow of sourceRows) {
        const sourceInput =
          sourceRow.querySelector<HTMLInputElement>("input");
        if (sourceInput === null) continue;
        const labelText =
          sourceRow.querySelector<HTMLElement>(":scope > span")
            ?.textContent ?? "";
        const property = sourceInput.dataset.elementProperty;
        if (property !== undefined) {
          addTextField(
            labelText,
            sourceInput.value,
            "editProperty",
            property,
            sourceRow.querySelector("small")?.textContent ?? ""
          );
        } else if (element instanceof CustomTransformerElm) {
          addTextField(
            labelText,
            sourceInput.value,
            "editText",
            "description"
          );
        }
      }
    }

    if (fields.childElementCount === 0) return;
    if (!dialog.open) dialog.showModal();
    fields.querySelector<HTMLInputElement>("input")?.focus();
  }

  private applyElementEditor(): void {
    if (this.editDisabled || this.selectedIndex === null) return;
    const dialog = this.requireElement(
      "element-edit-dialog",
      HTMLDialogElement
    );
    const fields = this.requireElement("element-edit-fields", HTMLElement);
    const error = this.requireElement("element-edit-error", HTMLElement);
    const element = this.runner.elements[this.selectedIndex];
    const propertyValues: Array<{ property: string; value: number }> = [];

    for (const input of fields.querySelectorAll<HTMLInputElement>(
      "input[data-edit-property]"
    )) {
      const value = parseEditableNumber(input.value);
      if (value === null) {
        error.textContent = `无法识别数值：${input.value}`;
        input.focus();
        input.select();
        return;
      }
      propertyValues.push({
        property: input.dataset.editProperty ?? "",
        value
      });
    }

    const getSwitchInput = (key: string) =>
      fields.querySelector<HTMLInputElement>(
        `input[data-edit-switch="${key}"]`
      );
    if (element instanceof Switch2Elm) {
      const linkInput = getSwitchInput("link");
      const throwInput = getSwitchInput("throwCount");
      if (
        linkInput === null ||
        throwInput === null ||
        !linkInput.checkValidity() ||
        !throwInput.checkValidity()
      ) {
        error.textContent = "联动组号或掷位数超出允许范围。";
        return;
      }
      element.momentary =
        getSwitchInput("momentary")?.checked ?? false;
      element.link = Math.trunc(Number(linkInput.value));
      element.throwCount = Math.trunc(Number(throwInput.value));
      if (element.throwCount > 2) element.momentary = false;
      element.allocNodes();
      element.setPoints();
    } else if (element instanceof SwitchElm) {
      element.momentary =
        getSwitchInput("momentary")?.checked ?? false;
      if (getSwitchInput("iec")?.checked) {
        element.flags |= SwitchElm.FLAG_IEC;
      } else {
        element.flags &= ~SwitchElm.FLAG_IEC;
      }
      const label = getSwitchInput("label")?.value ?? "";
      element.label = label.length === 0 ? null : label;
      if (element.label === null) {
        element.flags &= ~SwitchElm.FLAG_LABEL;
      } else {
        element.flags |= SwitchElm.FLAG_LABEL;
      }
      const shortcut = (getSwitchInput("keyShortcut")?.value ?? "").trim();
      element.keyShortcut =
        shortcut.length === 0 ? null : shortcut[0].toLowerCase();
      element.setPoints();
    }

    const description = fields.querySelector<HTMLInputElement>(
      'input[data-edit-text="description"]'
    );
    if (
      description !== null &&
      element instanceof CustomTransformerElm &&
      !element.parseDescription(description.value)
    ) {
      error.textContent = "绕组描述格式无效。";
      description.focus();
      description.select();
      return;
    }
    for (const item of propertyValues) {
      this.updateElementProperty(item.property, item.value);
    }

    error.textContent = "";
    this.runner.analyzed = false;
    this.commitHistory();
    this.updateInspector();
    dialog.close();
  }

  private showContextMenu(event: MouseEvent): void {
    const screen = this.canvasPosition(event);
    const index = this.renderer.hitTest(
      this.runner.elements,
      screen.x,
      screen.y
    );
    this.selectedIndices.clear();
    this.selectedIndex = index;
    if (index !== null) this.selectedIndices.add(index);
    const model = this.renderer.screenToModel(screen.x, screen.y);
    this.contextPoint = new Point(this.snap(model.x), this.snap(model.y));
    this.updateInspector();
    const element = index === null ? null : this.runner.elements[index];
    this.contextMenu
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => {
        button.disabled = element === null;
      });
    const edit = this.contextMenu.querySelector<HTMLButtonElement>(
      '[data-action="edit-selected"]'
    );
    if (edit !== null) {
      edit.disabled =
        element === null ||
        this.editDisabled ||
        !this.canEditElement(element);
    }
    const scope = this.contextMenu.querySelector<HTMLButtonElement>(
      '[data-action="scope-selected"]'
    );
    if (scope !== null) {
      scope.disabled = element === null || !element.canViewInScope();
    }
    const flipX = this.contextMenu.querySelector<HTMLButtonElement>(
      '[data-action="flip-x"]'
    );
    if (flipX !== null) {
      flipX.disabled =
        element === null || this.editDisabled || !element.canFlipX();
    }
    const flipY = this.contextMenu.querySelector<HTMLButtonElement>(
      '[data-action="flip-y"]'
    );
    if (flipY !== null) {
      flipY.disabled =
        element === null || this.editDisabled || !element.canFlipY();
    }
    const split = this.contextMenu.querySelector<HTMLButtonElement>(
      '[data-action="split-wire"]'
    );
    if (split !== null) {
      split.disabled =
        !(element instanceof WireElm) ||
        this.editDisabled ||
        (element.x !== element.x2 && element.y !== element.y2);
    }
    this.contextMenu.hidden = false;
    const width = this.contextMenu.offsetWidth;
    const height = this.contextMenu.offsetHeight;
    this.contextMenu.style.left =
      `${Math.min(event.clientX, window.innerWidth - width - 4)}px`;
    this.contextMenu.style.top =
      `${Math.min(event.clientY, window.innerHeight - height - 4)}px`;
  }

  private addSelectedToScope(): void {
    if (this.selectedIndex === null) return;
    const element = this.runner.elements[this.selectedIndex];
    const colors = ["#f1e900", "#00d83b", "#20a7ff", "#fb7185", "#c084fc"];
    const panel = Math.max(-1, ...this.scopeGroups.map((group) => group.panel)) + 1;
    const plot: ScopeChannel = {
      elementIndex: this.selectedIndex,
      value: 0,
      name: `${element.getClassName().replace(/Elm$/, "")} 电压`,
      elementLabel: this.scopeElementLabel(element),
      unit: "V",
      color: colors[this.scopeGroups.length % colors.length],
      scale: null,
      samples: [],
      read: () => element.getVoltageDiff()
    };
    this.scopeGroups.push({ scopeId: this.nextScopeId(), panel, plots: [plot] });
    this.syncScopePlots();
    this.syncScopeLayout();
    this.syncOptionButtons();
  }

  private swapSelectedTerminals(): void {
    if (this.editDisabled || this.selectedIndices.size === 0) return;
    for (const index of this.selectedIndices) {
      const element = this.runner.elements[index];
      element.setPosition(
        element.x2,
        element.y2,
        element.x,
        element.y
      );
    }
    this.runner.analyzed = false;
    this.commitHistory();
  }

  private splitSelectedWire(): void {
    if (this.editDisabled || this.selectedIndex === null) return;
    const wire = this.runner.elements[this.selectedIndex];
    if (!(wire instanceof WireElm)) return;
    const splitX = this.contextPoint.x;
    const splitY = this.contextPoint.y;
    if (
      (splitX === wire.x && splitY === wire.y) ||
      (splitX === wire.x2 && splitY === wire.y2)
    ) {
      return;
    }
    const first = new WireElm(
      wire.x,
      wire.y,
      splitX,
      splitY,
      wire.flags,
      new StringTokenizer("")
    );
    const second = new WireElm(
      splitX,
      splitY,
      wire.x2,
      wire.y2,
      wire.flags,
      new StringTokenizer("")
    );
    first.setBusWidth(wire.busWidth);
    second.setBusWidth(wire.busWidth);
    first.setPoints();
    second.setPoints();
    this.runner.elements.splice(this.selectedIndex, 1, first, second);
    this.selectedIndices.clear();
    this.selectedIndices.add(this.selectedIndex);
    this.selectedIndices.add(this.selectedIndex + 1);
    this.runner.analyzed = false;
    this.commitHistory();
  }

  private zoomTo(scale: number): void {
    const current = this.renderer.viewport.scale;
    this.renderer.zoomAt(
      this.canvas.clientWidth / 2,
      this.canvas.clientHeight / 2,
      scale / current
    );
  }

  private zoomBy(factor: number): void {
    this.renderer.zoomAt(
      this.canvas.clientWidth / 2,
      this.canvas.clientHeight / 2,
      factor
    );
  }

  private toggleOption(action: string): void {
    switch (action) {
      case "toggle-current":
        this.renderer.showCurrent = !this.renderer.showCurrent;
        break;
      case "toggle-voltage":
        this.renderer.showVoltage = !this.renderer.showVoltage;
        if (this.renderer.showVoltage) this.renderer.showPower = false;
        break;
      case "toggle-power":
        this.renderer.showPower = !this.renderer.showPower;
        if (this.renderer.showPower) this.renderer.showVoltage = false;
        break;
      case "toggle-values":
        this.renderer.showValues = !this.renderer.showValues;
        break;
      case "toggle-small-grid":
        this.renderer.smallGrid = !this.renderer.smallGrid;
        this.gridSize = this.renderer.smallGrid ? 8 : 16;
        break;
      case "toggle-toolbar":
        this.root
          .querySelector<HTMLElement>(".tool-bar")
          ?.classList.toggle("hidden");
        break;
      case "toggle-crosshair":
        if (this.isOptionEnabled(action)) this.renderer.crosshair = null;
        this.setStoredOption("crosshair", !this.isOptionEnabled(action));
        break;
      case "toggle-show-mode":
        this.setStoredOption("show-mode", !this.isOptionEnabled(action));
        this.root
          .querySelector<HTMLElement>("#tool-mode-label")
          ?.classList.toggle("hidden", !this.isOptionEnabled(action));
        break;
      case "toggle-euro-resistor":
        this.renderer.europeanResistors =
          !this.renderer.europeanResistors;
        this.setStoredOption(
          "euro-resistors",
          this.renderer.europeanResistors
        );
        this.syncResistorToolbarIcon();
        break;
      case "toggle-iec-gates":
        this.renderer.iecGates = !this.renderer.iecGates;
        this.setStoredOption("iec-gates", this.renderer.iecGates);
        break;
      case "toggle-white-background":
        this.renderer.whiteBackground = !this.renderer.whiteBackground;
        this.setStoredOption(
          "white-background",
          this.renderer.whiteBackground
        );
        break;
      case "toggle-current-convention":
        this.renderer.conventionalCurrent =
          !this.renderer.conventionalCurrent;
        this.setStoredOption(
          "conventional-current",
          this.renderer.conventionalCurrent
        );
        break;
      case "toggle-disable-editing":
        this.editDisabled = !this.editDisabled;
        if (this.editDisabled) this.setTool("select");
        break;
      case "toggle-wheel-edit":
        this.mouseWheelEdit = !this.mouseWheelEdit;
        this.setStoredOption("mouse-wheel-edit", this.mouseWheelEdit);
        break;
      default:
        break;
    }
    this.syncOptionButtons();
    this.syncEditMenuState();
  }

  private isOptionEnabled(action: string): boolean {
    switch (action) {
      case "toggle-current":
        return this.renderer.showCurrent;
      case "toggle-voltage":
        return this.renderer.showVoltage;
      case "toggle-power":
        return this.renderer.showPower;
      case "toggle-values":
        return this.renderer.showValues;
      case "toggle-small-grid":
        return this.renderer.smallGrid;
      case "toggle-toolbar":
        return !this.root
          .querySelector<HTMLElement>(".tool-bar")
          ?.classList.contains("hidden");
      case "toggle-crosshair":
        return this.getStoredOption("crosshair");
      case "toggle-show-mode":
        return this.getStoredOption("show-mode", true);
      case "toggle-euro-resistor":
        return this.renderer.europeanResistors;
      case "toggle-iec-gates":
        return this.renderer.iecGates;
      case "toggle-white-background":
        return this.renderer.whiteBackground;
      case "toggle-current-convention":
        return this.renderer.conventionalCurrent;
      case "toggle-disable-editing":
        return this.editDisabled;
      case "toggle-wheel-edit":
        return this.mouseWheelEdit;
      default:
        return false;
    }
  }

  private syncOptionButtons(): void {
    this.root
      .querySelectorAll<HTMLButtonElement>(
        '[data-action^="toggle-"]'
      )
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(this.isOptionEnabled(button.dataset.action ?? ""))
        )
      );
    const dragActions = [
      "drag-selected",
      "drag-all",
      "drag-row",
      "drag-column",
      "drag-post"
    ];
    for (const action of dragActions) {
      const button = this.root.querySelector<HTMLButtonElement>(
        `[data-action="${action}"]`
      );
      button?.setAttribute(
        "aria-pressed",
        String(action === `drag-${this.dragMode}`)
      );
    }
    // ScopePopupMenu bases its availability on the legacy scope *position*,
    // not simply on whether there are two scopes.  In particular, Stack is a
    // no-op after all scopes already share position 0, and Unstack is a no-op
    // after the final scope is already at its own position.  Keep the same
    // state machine while ScopeGroup remains responsible for preserving
    // multi-plot V/I pairs during the actual transformation.
    const count = this.scopeCount();
    const lastPosition = this.scopeGroups[count - 1]?.panel ?? 0;
    const available: Record<string, boolean> = {
      "scope-stack": count > 1 && lastPosition > 0,
      "scope-unstack": count > 1 && lastPosition !== count - 1,
      "scope-combine": count > 1,
      "scope-separate": count > 0
    };
    for (const [action, enabled] of Object.entries(available)) {
      const button = this.root.querySelector<HTMLButtonElement>(
        `[data-action="${action}"]`
      );
      if (button !== null) button.disabled = !enabled;
    }
  }

  private stackAllScopes(): void {
    if (this.scopeGroups.length < 2) return;
    for (const group of this.scopeGroups) group.panel = 0;
    this.syncScopePlots();
    this.syncOptionButtons();
  }

  private unstackAllScopes(): void {
    if (this.scopeGroups.length < 2) return;
    this.scopeGroups.forEach((group, index) => {
      group.panel = index;
    });
    this.syncScopePlots();
    this.syncOptionButtons();
  }

  private combineAllScopes(): void {
    if (this.scopeCount() < 2) return;
    const [first, ...rest] = this.scopeGroups;
    if (first === undefined) return;
    for (const group of rest) first.plots.push(...group.plots);
    this.scopeGroups = [first];
    this.syncScopePlots();
    this.syncOptionButtons();
  }

  private separateAllScopes(): void {
    if (!this.scopeGroups.some((group) => group.plots.length > 1)) return;
    const groups: ScopeGroup[] = [];
    for (const group of this.scopeGroups) {
      for (const plot of group.plots) {
        const previous = groups[groups.length - 1];
        if (previous !== undefined && this.isVoltageCurrentPair(previous.plots, plot)) {
          previous.plots.push(plot);
        } else {
          groups.push({ scopeId: groups.length, panel: groups.length, plots: [plot] });
        }
      }
    }
    this.scopeGroups = groups;
    this.syncScopePlots();
    this.syncOptionButtons();
  }

  private scopeCount(): number {
    return this.scopeGroups.length;
  }

  private hasScopes(): boolean {
    return this.scopeGroups.length > 0;
  }

  /** Keep the bottom canvas in the DOM while removing it from layout if empty. */
  private syncScopeLayout(): void {
    const hasScopes = this.hasScopes();
    const column = this.root.querySelector<HTMLElement>(".canvas-column");
    column?.classList.toggle("has-scopes", hasScopes);
    this.scopeCanvas.hidden = !hasScopes;
    this.scopeCanvas.setAttribute("aria-hidden", String(!hasScopes));
  }

  private nextScopeId(): number {
    return Math.max(-1, ...this.scopeGroups.map((group) => group.scopeId)) + 1;
  }

  private syncScopePlots(): void {
    this.runner.scopePlots = this.scopeGroups.flatMap((group) =>
      group.plots.map((plot) => ({
        elementIndex: plot.elementIndex,
        value: plot.value,
        panel: group.panel,
        scale: plot.scale,
        scopeId: group.scopeId
      }))
    );
  }

  private isVoltageCurrentPair(existing: ScopeChannel[], plot: ScopeChannel): boolean {
    const previous = existing[existing.length - 1];
    return previous !== undefined && previous.elementIndex === plot.elementIndex &&
      previous.unit === "V" && plot.unit === "A";
  }

  private getStoredOption(name: string, fallback = false): boolean {
    const value = localStorage.getItem(`circuitjs1-ts-option-${name}`);
    return value === null ? fallback : value === "true";
  }

  private setStoredOption(name: string, value: boolean): void {
    localStorage.setItem(`circuitjs1-ts-option-${name}`, String(value));
  }

  private loadShortcuts(): void {
    const stored = localStorage.getItem("circuitjs1-ts-shortcuts");
    if (stored === null) return;
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (typeof parsed !== "object" || parsed === null) return;
      const validTools = new Set(COMPONENTS.map((component) => component.id));
      const shortcuts: ShortcutMap = {};
      for (const [key, tool] of Object.entries(parsed)) {
        if (
          key.length === 1 &&
          typeof tool === "string" &&
          validTools.has(tool)
        ) {
          shortcuts[key] = tool;
        }
      }
      this.toolShortcuts = shortcuts;
    } catch {
      localStorage.removeItem("circuitjs1-ts-shortcuts");
    }
  }

  private renderShortcutRows(): void {
    const body = this.root.querySelector<HTMLElement>(
      "#shortcut-table-body"
    );
    if (body === null) return;
    const shortcutByTool = new Map(
      Object.entries(this.toolShortcuts).map(([key, tool]) => [tool, key])
    );
    body.innerHTML = DRAW_SHORTCUT_ITEMS.map(
      (item) =>
        `<tr><td>${item.label}</td><td>` +
        `<input data-shortcut-tool="${item.id}" maxlength="1" ` +
        `value="${NativeCircuitApp.escapeHtml(shortcutByTool.get(item.id) ?? "")}" ` +
        `aria-label="${item.label}的快捷键"></td></tr>`
    ).join("");
    body.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      input.addEventListener("input", () => this.validateShortcutRows());
    });
    this.validateShortcutRows();
  }

  private validateShortcutRows(): boolean {
    const inputs = Array.from(
      this.root.querySelectorAll<HTMLInputElement>(
        "#shortcut-table-body input"
      )
    );
    const byKey = new Map<string, HTMLInputElement[]>();
    for (const input of inputs) {
      const key = input.value;
      input.classList.remove("invalid");
      if (key.length === 0) continue;
      const matches = byKey.get(key) ?? [];
      matches.push(input);
      byKey.set(key, matches);
    }
    let valid = true;
    for (const matches of byKey.values()) {
      if (matches.length < 2) continue;
      valid = false;
      matches.forEach((input) => input.classList.add("invalid"));
    }
    const error = this.root.querySelector<HTMLElement>("#shortcut-error");
    if (error !== null) {
      error.textContent = valid ? "" : "快捷键不能重复。";
    }
    const apply = this.root.querySelector<HTMLButtonElement>(
      "#shortcut-apply"
    );
    if (apply !== null) apply.disabled = !valid;
    return valid;
  }

  private openShortcutDialog(): void {
    this.renderShortcutRows();
    this.requireElement(
      "shortcut-dialog",
      HTMLDialogElement
    ).showModal();
  }

  private applyShortcutDialog(): void {
    if (!this.validateShortcutRows()) return;
    const shortcuts: ShortcutMap = {};
    this.root
      .querySelectorAll<HTMLInputElement>("#shortcut-table-body input")
      .forEach((input) => {
        if (input.value.length !== 1) return;
        const tool = input.dataset.shortcutTool;
        if (tool !== undefined) shortcuts[input.value] = tool;
      });
    this.toolShortcuts = shortcuts;
    localStorage.setItem(
      "circuitjs1-ts-shortcuts",
      JSON.stringify(shortcuts)
    );
    this.syncShortcutLabels();
    this.requireElement("shortcut-dialog", HTMLDialogElement).close();
  }

  private syncShortcutLabels(): void {
    const shortcutByTool = new Map(
      Object.entries(this.toolShortcuts).map(([key, tool]) => [tool, key])
    );
    this.root
      .querySelectorAll<HTMLButtonElement>(
        ".menu-bar .component-menu button[data-tool]"
      )
      .forEach((button) => {
        button.querySelector("kbd")?.remove();
        const shortcut = shortcutByTool.get(button.dataset.tool ?? "");
        if (shortcut === undefined) return;
        const label = document.createElement("kbd");
        label.textContent = shortcut;
        button.append(label);
      });
  }

  private renderSubcircuitList(): void {
    const list = this.root.querySelector<HTMLSelectElement>(
      "#subcircuit-list"
    );
    if (list === null) return;
    const models = CustomCompositeModel.list();
    list.innerHTML = models
      .map(
        (model) =>
          `<option value="${NativeCircuitApp.escapeHtml(model.name)}">` +
          `${NativeCircuitApp.escapeHtml(model.name)} ` +
          `(${model.pins.length} 引脚，${model.elements.length} 元件)</option>`
      )
      .join("");
    if (models.length > 0) list.selectedIndex = 0;
    const empty = this.root.querySelector<HTMLElement>("#subcircuit-empty");
    if (empty !== null) empty.hidden = models.length > 0;
    const deleteButton = this.root.querySelector<HTMLButtonElement>(
      "#subcircuit-delete"
    );
    if (deleteButton !== null) deleteButton.disabled = models.length === 0;
  }

  /**
   * Keep Draw > Subcircuits tied to the same registry used by loading and
   * exporting XML.  It is deliberately rebuilt after every model mutation so
   * it cannot become a stale visual list of unavailable models.
   */
  private refreshDrawSubcircuitMenu(): void {
    const list = this.root.querySelector<HTMLElement>("#draw-subcircuit-items");
    if (list === null) return;
    list.replaceChildren();
    const models = CustomCompositeModel.list();
    for (const model of models) {
      const button = document.createElement("button");
      button.dataset.tool = `subcircuit:${encodeURIComponent(model.name)}`;
      const label = document.createElement("span");
      label.textContent = `添加 ${model.name}`;
      button.append(label);
      list.append(button);
    }
    const empty = models.length === 0;
    list.classList.toggle("empty-submenu", empty);
    if (empty) {
      const hint = document.createElement("span");
      hint.className = "submenu-empty-hint";
      hint.textContent = "当前电路没有可实例化的子电路";
      list.append(hint);
    }
    const instance = this.root.querySelector<HTMLButtonElement>(
      '[data-tool="subcircuit-instance"]'
    );
    if (instance !== null) {
      const selectedModel = this.lastDrawSubcircuitModel === null
        ? null
        : CustomCompositeModel.get(this.lastDrawSubcircuitModel);
      const selected = selectedModel !== null && selectedModel.internal !== true
        ? this.lastDrawSubcircuitModel
        : models[models.length - 1]?.name ?? null;
      instance.disabled = selected === null;
      instance.title = selected === null
        ? "当前电路没有可实例化的子电路"
        : `使用子电路“${selected}”`;
    }
  }

  private openSubcircuitDialog(): void {
    this.renderSubcircuitList();
    this.requireElement(
      "subcircuit-dialog",
      HTMLDialogElement
    ).showModal();
  }

  /**
   * The legacy File > Create Subcircuit command turns labeled connection
   * nodes into the pins of an XML <ccm> definition.  Keep that file-format
   * boundary here in the app layer; the simulator core only consumes models.
   */
  private openCreateSubcircuitDialog(): void {
    const name = this.requireElement(
      "subcircuit-name",
      HTMLInputElement
    );
    name.value = "";
    const selection = this.selectedIndices.size > 0;
    const description = this.root.querySelector<HTMLElement>(
      "#subcircuit-create-description"
    );
    if (description !== null) {
      description.textContent = selection
        ? "将当前选中的元件和外部标注节点保存为子电路。"
        : "未选择元件：将整个当前电路保存为子电路。";
    }
    this.requireElement(
      "subcircuit-create-dialog",
      HTMLDialogElement
    ).showModal();
    name.focus();
  }

  private createSubcircuit(): void {
    const nameInput = this.requireElement(
      "subcircuit-name",
      HTMLInputElement
    );
    const name = nameInput.value.trim();
    const error = this.root.querySelector<HTMLElement>(
      "#subcircuit-create-error"
    );
    try {
      if (name.length === 0) {
        throw new Error("请输入子电路名称。");
      }
      if (CustomCompositeModel.get(name) !== null) {
        throw new Error(`子电路“${name}”已存在，请使用其他名称。`);
      }
      const model = this.buildSubcircuitModel(name);
      CustomCompositeModel.load(model);
      this.runner.preservedXmlRecords = [
        ...this.runner.preservedXmlRecords,
        model
      ];
      this.runner.sourceFormat = "xml";
      this.commitHistory();
      this.refreshDrawSubcircuitMenu();
      this.requireElement(
        "subcircuit-create-dialog",
        HTMLDialogElement
      ).close();
      this.openSubcircuitDialog();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (error !== null) error.textContent = message;
    }
  }

  private buildSubcircuitModel(name: string): XmlRecord {
    this.runner.analyzeCircuit();
    const selected = this.selectedIndices.size > 0
      ? this.selectedIndices
      : null;
    const elements = this.runner.elements.filter(
      (_element, index) => selected === null || selected.has(index)
    );
    const labels = elements.filter(
      (element): element is LabeledNodeElm =>
        element instanceof LabeledNodeElm && !element.isInternal()
    );
    if (labels.length === 0) {
      throw new Error(
        "创建子电路需要至少一个外部标注节点。请用“标注节点”工具给输入或输出命名。"
      );
    }

    const sideLabels = [[], [], [], []] as LabeledNodeElm[][];
    const sideFor = (element: LabeledNodeElm): number => {
      if (Math.abs(element.dx) >= Math.abs(element.dy) && element.dx > 0) return 3;
      if (Math.abs(element.dx) <= Math.abs(element.dy) && element.dy < 0) return 0;
      if (Math.abs(element.dx) <= Math.abs(element.dy) && element.dy > 0) return 1;
      return 2;
    };
    for (const label of labels) sideLabels[sideFor(label)]?.push(label);
    // Match SimulationManager.getCircuitAsComposite(): north/south pins are
    // ordered left-to-right (x); west/east pins top-to-bottom (y).
    const axis = (side: number) => (element: LabeledNodeElm) =>
      side === 0 || side === 1 ? element.x : element.y;
    sideLabels.forEach((list, side) => list.sort((a, b) => axis(side)(a) - axis(side)(b)));

    const pins: XmlRecord[] = [];
    const seenNodes = new Set<number>();
    for (let side = 0; side < sideLabels.length; side += 1) {
      for (const [position, label] of (sideLabels[side] ?? []).entries()) {
        for (let bit = 0; bit < label.busWidth; bit += 1) {
          const node = label.getNode(bit)?.index ?? 0;
          if (node === 0) {
            throw new Error(`节点“${label.text}”不能连接到地。`);
          }
          if (seenNodes.has(node)) {
            throw new Error(
              `外部标注节点“${label.text}”与另一个引脚连接到同一节点。`
            );
          }
          seenNodes.add(node);
          const used = elements.some(
            (element) =>
              element !== label &&
              Array.from({ length: element.getPostCount() }, (_, post) =>
                element.getNode(post)?.index
              ).includes(node)
          );
          if (!used) {
            throw new Error(`节点“${label.text}”未连接到子电路中的元件。`);
          }
          pins.push({
            tagName: "ext",
            attributes: {
              nm: label.text,
              nd: String(node),
              ps: String(position),
              sd: String(side),
              ...(label.busWidth > 1 ? { bw: String(label.busWidth), bz: String(bit) } : {})
            },
            contents: null,
            children: [],
            kind: "unknown"
          });
        }
      }
    }

    const sideCounts = sideLabels.map((list) => list.length);
    const widthOffset = (sideCounts[2] ?? 0) > 0 ? 1 : 0;
    const rightOffset = (sideCounts[3] ?? 0) > 0 ? 1 : 0;
    const minimumHeight = (sideCounts[0] ?? 0) > 0 && (sideCounts[1] ?? 0) > 0
      ? 2
      : 1;
    return {
      tagName: "ccm",
      attributes: {
        nm: name,
        f: "0",
        sx: String(Math.max(2, (sideCounts[0] ?? 0), (sideCounts[1] ?? 0)) + widthOffset + rightOffset),
        sy: String(Math.max(minimumHeight, (sideCounts[2] ?? 0), (sideCounts[3] ?? 0)))
      },
      contents: null,
      children: [
        ...pins,
        ...elements.map((element) => this.subcircuitElementRecord(element))
      ],
      kind: "model"
    };
  }

  private subcircuitElementRecord(element: CircuitElm): XmlRecord {
    const document = globalThis.document.implementation.createDocument(
      "",
      element.getXmlDumpType()
    );
    const xml = document.documentElement;
    element.dumpXml(document, xml);
    xml.setAttribute(
      "nn",
      Array.from({ length: element.getPostCount() }, (_, index) =>
        String(element.getNode(index)?.index ?? 0)
      ).join(" ")
    );
    return {
      tagName: xml.tagName,
      attributes: Object.fromEntries(
        Array.from(xml.attributes, (attribute) => [attribute.name, attribute.value])
      ),
      contents: xml.firstChild?.nodeValue ?? null,
      children: [],
      kind: "element"
    };
  }

  private deleteSelectedSubcircuit(): void {
    const list = this.root.querySelector<HTMLSelectElement>(
      "#subcircuit-list"
    );
    const name = list?.value;
    if (name === undefined || name.length === 0) return;
    if (!window.confirm(`确定要删除子电路“${name}”吗？`)) return;
    CustomCompositeModel.remove(name);
    this.runner.preservedXmlRecords =
      this.runner.preservedXmlRecords.filter(
        (record) =>
          !(record.tagName === "ccm" && record.attributes.nm === name)
      );
    this.commitHistory();
    this.renderSubcircuitList();
    this.refreshDrawSubcircuitMenu();
  }

  private loadApplicationSettings(): void {
    const number = (key: string, fallback: number) => {
      const value = Number(localStorage.getItem(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    this.wheelSensitivity = number(
      "circuitjs1-ts-wheel-sensitivity",
      1
    );
    this.minimumFrameRate = number(
      "circuitjs1-ts-minimum-frame-rate",
      20
    );
    this.autoDcOnReset = this.getStoredOption("auto-dc-on-reset");
    // These are application preferences in CircuitJS1 (rather than circuit
    // file flags), so they must survive a browser restart.  Keep the legacy
    // defaults: European resistor symbols, conventional current motion and
    // mouse-wheel value editing start enabled.
    this.renderer.europeanResistors = this.getStoredOption(
      "euro-resistors",
      true
    );
    this.renderer.iecGates = this.getStoredOption("iec-gates");
    this.renderer.whiteBackground = this.getStoredOption("white-background");
    this.renderer.conventionalCurrent = this.getStoredOption(
      "conventional-current",
      true
    );
    this.mouseWheelEdit = this.getStoredOption("mouse-wheel-edit", true);
    this.renderer.positiveColor =
      localStorage.getItem("circuitjs1-ts-positive-color") ?? "#20ff40";
    this.renderer.negativeColor =
      localStorage.getItem("circuitjs1-ts-negative-color") ?? "#ff2828";
    this.renderer.neutralColor =
      localStorage.getItem("circuitjs1-ts-neutral-color") ?? "#a3a3a3";
    this.renderer.selectionColor =
      localStorage.getItem("circuitjs1-ts-selection-color") ?? "#38bdf8";
    this.renderer.currentColor =
      localStorage.getItem("circuitjs1-ts-current-color") ?? "#ffe600";
    CircuitElm.decimalDigits = Math.round(
      number("circuitjs1-ts-decimal-digits", 3)
    );
    CircuitElm.shortDecimalDigits = Math.round(
      number("circuitjs1-ts-short-decimal-digits", 1)
    );
  }

  private openOptionsDialog(): void {
    const setValue = (id: string, value: string | number) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (input !== null) input.value = String(value);
    };
    setValue("option-max-time-step", this.runner.simulation.maxTimeStep);
    setValue("option-min-time-step", this.runner.simulation.minTimeStep);
    setValue("option-voltage-range", CircuitElm.voltageRange);
    setValue("option-short-digits", CircuitElm.shortDecimalDigits);
    setValue("option-long-digits", CircuitElm.decimalDigits);
    setValue("option-min-frame-rate", this.minimumFrameRate);
    setValue("option-wheel-sensitivity", this.wheelSensitivity);
    setValue("option-positive-color", this.renderer.positiveColor);
    setValue("option-negative-color", this.renderer.negativeColor);
    setValue("option-neutral-color", this.renderer.neutralColor);
    setValue("option-selection-color", this.renderer.selectionColor);
    setValue("option-current-color", this.renderer.currentColor);
    const setChecked = (id: string, checked: boolean) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (input !== null) input.checked = checked;
    };
    setChecked(
      "option-adjust-time-step",
      this.runner.simulation.adjustTimeStep
    );
    setChecked("option-auto-dc", this.autoDcOnReset);
    const solver = this.root.querySelector<HTMLSelectElement>(
      "#option-solver"
    );
    if (solver !== null) {
      solver.value = String(this.runner.simulation.solverType);
    }
    this.requireElement("options-dialog", HTMLDialogElement).showModal();
  }

  /** Apply the five display flags encoded by CircuitLoader's `$` / `<cir f>`
   * record.  They belong to the circuit, so loading Undo history or a shared
   * circuit must restore them rather than retaining the preceding page state.
   */
  private applyCircuitDisplayFlags(flags: {
    showCurrentDots: boolean;
    smallGrid: boolean;
    showVoltage: boolean;
    showPower: boolean;
    showValues: boolean;
    autoDCOnReset: boolean;
  }): void {
    this.renderer.showCurrent = flags.showCurrentDots;
    this.renderer.smallGrid = flags.smallGrid;
    this.gridSize = flags.smallGrid ? 8 : 16;
    this.renderer.showVoltage = flags.showVoltage;
    this.renderer.showPower = flags.showPower;
    this.renderer.showValues = flags.showValues;
    this.autoDcOnReset = flags.autoDCOnReset;
  }

  private applyOptionsDialog(): void {
    const form = this.root.querySelector<HTMLFormElement>("#options-form");
    if (form !== null && !form.reportValidity()) return;
    const number = (id: string) =>
      Number(
        this.root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? 0
      );
    const color = (id: string) =>
      this.root.querySelector<HTMLInputElement>(`#${id}`)?.value ??
      "#000000";
    this.runner.simulation.maxTimeStep = number("option-max-time-step");
    this.runner.simulation.timeStep = this.runner.simulation.maxTimeStep;
    this.runner.simulation.minTimeStep = number("option-min-time-step");
    CircuitElm.voltageRange = number("option-voltage-range");
    CircuitElm.shortDecimalDigits = Math.round(
      number("option-short-digits")
    );
    CircuitElm.decimalDigits = Math.round(number("option-long-digits"));
    this.minimumFrameRate = number("option-min-frame-rate");
    this.wheelSensitivity = number("option-wheel-sensitivity");
    this.renderer.positiveColor = color("option-positive-color");
    this.renderer.negativeColor = color("option-negative-color");
    this.renderer.neutralColor = color("option-neutral-color");
    this.renderer.selectionColor = color("option-selection-color");
    this.renderer.currentColor = color("option-current-color");
    this.runner.simulation.adjustTimeStep =
      this.root.querySelector<HTMLInputElement>(
        "#option-adjust-time-step"
      )?.checked ?? false;
    this.autoDcOnReset =
      this.root.querySelector<HTMLInputElement>("#option-auto-dc")
        ?.checked ?? false;
    this.runner.simulation.solverType = Number(
      this.root.querySelector<HTMLSelectElement>("#option-solver")?.value ??
        0
    );
    this.runner.analyzed = false;
    localStorage.setItem(
      "circuitjs1-ts-wheel-sensitivity",
      String(this.wheelSensitivity)
    );
    localStorage.setItem(
      "circuitjs1-ts-minimum-frame-rate",
      String(this.minimumFrameRate)
    );
    localStorage.setItem(
      "circuitjs1-ts-short-decimal-digits",
      String(CircuitElm.shortDecimalDigits)
    );
    localStorage.setItem(
      "circuitjs1-ts-decimal-digits",
      String(CircuitElm.decimalDigits)
    );
    localStorage.setItem(
      "circuitjs1-ts-positive-color",
      this.renderer.positiveColor
    );
    localStorage.setItem(
      "circuitjs1-ts-negative-color",
      this.renderer.negativeColor
    );
    localStorage.setItem(
      "circuitjs1-ts-neutral-color",
      this.renderer.neutralColor
    );
    localStorage.setItem(
      "circuitjs1-ts-selection-color",
      this.renderer.selectionColor
    );
    localStorage.setItem(
      "circuitjs1-ts-current-color",
      this.renderer.currentColor
    );
    this.setStoredOption("auto-dc-on-reset", this.autoDcOnReset);
    this.requireElement("options-dialog", HTMLDialogElement).close();
  }

  private resetOptionColors(): void {
    const colors: Record<string, string> = {
      "option-positive-color": "#20ff40",
      "option-negative-color": "#ff2828",
      "option-neutral-color": "#a3a3a3",
      "option-selection-color": "#38bdf8",
      "option-current-color": "#ffe600"
    };
    for (const [id, value] of Object.entries(colors)) {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (input !== null) input.value = value;
    }
  }

  private openModificationDialog(): void {
    const read = (key: string, fallback: string) =>
      localStorage.getItem(`circuitjs1-ts-mod-${key}`) ?? fallback;
    const setValue = (id: string, value: string) => {
      const input = this.root.querySelector<
        HTMLInputElement | HTMLSelectElement
      >(`#${id}`);
      if (input !== null) input.value = value;
    };
    const setChecked = (id: string, checked: boolean) => {
      const input = this.root.querySelector<HTMLInputElement>(`#${id}`);
      if (input !== null) input.checked = checked;
    };
    setValue("mod-ui-scale", read("ui-scale", "1"));
    setValue("mod-menu-size", read("menu-size", "standard"));
    setValue("mod-button-theme", read("button-theme", "default"));
    setValue("mod-run-icon", read("run-icon", "text"));
    setValue("mod-sidebar-duration", read("sidebar-duration", "200"));
    setValue("mod-sidebar-curve", read("sidebar-curve", "ease"));
    setChecked("mod-show-mode", this.getStoredOption("show-mode", true));
    setChecked("mod-hide-buttons", read("hide-buttons", "false") === "true");
    setChecked(
      "mod-overlay-sidebar",
      read("overlay-sidebar", "false") === "true"
    );
    setChecked(
      "mod-animate-sidebar",
      read("animate-sidebar", "true") === "true"
    );
    setChecked(
      "mod-show-sidebar",
      read("show-sidebar", "true") === "true"
    );
    setChecked(
      "mod-pause-unfocused",
      read("pause-unfocused", "false") === "true"
    );
    this.requireElement(
      "modification-dialog",
      HTMLDialogElement
    ).showModal();
  }

  private applyModificationDialog(): void {
    const form = this.root.querySelector<HTMLFormElement>(
      "#modification-form"
    );
    if (form !== null && !form.reportValidity()) return;
    const value = (id: string) =>
      this.root.querySelector<HTMLInputElement | HTMLSelectElement>(
        `#${id}`
      )?.value ?? "";
    const checked = (id: string) =>
      this.root.querySelector<HTMLInputElement>(`#${id}`)?.checked ??
      false;
    const store = (key: string, setting: string | boolean) =>
      localStorage.setItem(
        `circuitjs1-ts-mod-${key}`,
        String(setting)
      );
    store("ui-scale", value("mod-ui-scale"));
    store("menu-size", value("mod-menu-size"));
    store("button-theme", value("mod-button-theme"));
    store("run-icon", value("mod-run-icon"));
    store("hide-buttons", checked("mod-hide-buttons"));
    store("overlay-sidebar", checked("mod-overlay-sidebar"));
    store("animate-sidebar", checked("mod-animate-sidebar"));
    store("sidebar-duration", value("mod-sidebar-duration"));
    store("sidebar-curve", value("mod-sidebar-curve"));
    store("show-sidebar", checked("mod-show-sidebar"));
    store("pause-unfocused", checked("mod-pause-unfocused"));
    this.setStoredOption("show-mode", checked("mod-show-mode"));
    this.applyModificationSettings(false);
    this.requireElement(
      "modification-dialog",
      HTMLDialogElement
    ).close();
    requestAnimationFrame(() => this.resizeCanvases());
  }

  private openModificationFromOptions(): void {
    // Modification Setup is a TS-only extension.  It deliberately lives one
    // level below legacy "Other Options...", leaving the Options menu's main
    // command path and ordering identical to CircuitJS1.
    this.requireElement("options-dialog", HTMLDialogElement).close();
    this.openModificationDialog();
  }

  private applyModificationSettings(
    applyStartupVisibility = true
  ): void {
    const read = (key: string, fallback: string) =>
      localStorage.getItem(`circuitjs1-ts-mod-${key}`) ?? fallback;
    const scale = Math.min(
      3,
      Math.max(0.5, Number(read("ui-scale", "1")) || 1)
    );
    this.root.style.zoom = String(scale);
    this.root.style.width = `${100 / scale}%`;
    this.root.style.height = `${100 / scale}%`;
    const app = this.root.querySelector<HTMLElement>(".native-app");
    app?.classList.toggle("compact-menu", read("menu-size", "standard") === "small");
    app?.classList.toggle(
      "classic-run-buttons",
      read("button-theme", "default") === "classic"
    );
    app?.classList.toggle(
      "overlay-sidebar",
      read("overlay-sidebar", "false") === "true"
    );
    app?.classList.toggle(
      "hide-run-buttons",
      read("hide-buttons", "false") === "true"
    );
    const duration =
      read("animate-sidebar", "true") === "true"
        ? Math.max(0, Number(read("sidebar-duration", "200")) || 0)
        : 0;
    this.root.style.setProperty(
      "--sidebar-duration",
      `${duration}ms`
    );
    this.root.style.setProperty(
      "--sidebar-curve",
      read("sidebar-curve", "ease")
    );
    this.pauseWhenUnfocused =
      read("pause-unfocused", "false") === "true";
    this.root
      .querySelector<HTMLElement>("#tool-mode-label")
      ?.classList.toggle("hidden", !this.getStoredOption("show-mode", true));
    if (
      applyStartupVisibility &&
      read("show-sidebar", "true") !== "true"
    ) {
      app?.classList.add("sidebar-hidden");
    }
    this.updateRunButtonAppearance();
  }

  private updateRunButtonAppearance(): void {
    if (!this.runButton) return;
    // Keep the native simulator state, but render the same two-state control
    // that UIManager.setSimRunning() exposes in the GWT baseline.
    this.runButton.innerHTML = this.running
      ? "<strong>运行</strong>&nbsp;/&nbsp;停止"
      : "运行&nbsp;/&nbsp;<strong>停止</strong>";
    this.runButton.title = this.running ? "暂停仿真" : "继续仿真";
    this.runButton.classList.toggle("topButton-red", !this.running);
    this.runButton.classList.toggle("topButton", this.running);
  }

  private toggleSidebar(): void {
    const app = this.root.querySelector<HTMLElement>(".native-app");
    app?.classList.toggle("sidebar-hidden");
    requestAnimationFrame(() => this.resizeCanvases());
  }

  private static escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        })[character] ?? character
    );
  }

  private syncResistorToolbarIcon(): void {
    const button = this.root.querySelector<HTMLButtonElement>(
      '.tool-bar [data-tool="resistor"]'
    );
    if (button === null) return;
    button.innerHTML = NativeCircuitApp.toolbarIcon(
      this.renderer.europeanResistors ? "resistor" : "resistorUs"
    );
  }

  private adjustSelectedByWheel(deltaY: number): boolean {
    if (this.selectedIndex === null || this.editDisabled) return false;
    const element = this.runner.elements[this.selectedIndex];
    const factor = deltaY < 0 ? 1.08 : 1 / 1.08;
    if (element instanceof ResistorElm) {
      element.setResistance(element.resistance * factor);
    } else if (element instanceof CapacitorElm) {
      element.setCapacitance(element.capacitance * factor);
    } else if (element instanceof InductorElm) {
      element.setInductance(element.inductance * factor);
    } else if (element instanceof CurrentElm) {
      element.currentValue *= factor;
    } else if (element instanceof VoltageElm) {
      element.maxVoltage *= factor;
    } else {
      return false;
    }
    this.runner.analyzed = false;
    this.commitHistory();
    this.updateInspector();
    return true;
  }

  private snap(value: number): number {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  private onPointerDown(event: PointerEvent): void {
    this.canvas.setPointerCapture(event.pointerId);
    const screen = this.canvasPosition(event);
    if (event.button === 2) return;
    if (event.button === 1 || event.altKey) {
      this.panStart = screen;
      return;
    }

    const model = this.renderer.screenToModel(screen.x, screen.y);
    const snapped = new Point(
      this.snap(model.x),
      this.snap(model.y)
    );
    if (this.activeTool !== "select") {
      if (this.editDisabled) return;
      this.draft = { start: snapped, end: new Point(snapped) };
      return;
    }

    const hitIndex = this.renderer.hitTest(
      this.runner.elements,
      screen.x,
      screen.y
    );
    if (hitIndex === null) {
      this.selectionBase.clear();
      if (event.shiftKey) {
        for (const index of this.selectedIndices) {
          this.selectionBase.add(index);
        }
      } else {
        this.selectedIndices.clear();
      }
      const remainingSelection = [...this.selectedIndices];
      this.selectedIndex =
        remainingSelection[remainingSelection.length - 1] ?? null;
      const exact = new Point(model.x, model.y);
      this.selectionBox = {
        start: exact,
        end: new Point(exact)
      };
      this.updateInspector();
      return;
    }
    if (event.shiftKey && hitIndex !== null) {
      if (this.selectedIndices.has(hitIndex)) {
        this.selectedIndices.delete(hitIndex);
      } else {
        this.selectedIndices.add(hitIndex);
      }
      this.selectedIndex = hitIndex;
    } else {
      this.selectedIndices.clear();
      if (hitIndex !== null) this.selectedIndices.add(hitIndex);
      this.selectedIndex = hitIndex;
    }
    const selectedIndex = this.selectedIndex;
    const selected =
      selectedIndex === null
        ? null
        : this.runner.elements[selectedIndex];
    if (
      (selected instanceof SwitchElm ||
        selected instanceof LogicInputElm ||
        selected instanceof BusLogicInputElm) &&
      !this.editDisabled
    ) {
      selected.toggle();
      if (selected instanceof SwitchElm && selected.momentary) {
        this.heldMomentarySwitch = selected;
      }
      this.runner.analyzed = false;
      this.commitHistory();
    } else if (
      selected !== null &&
      selectedIndex !== null &&
      !this.editDisabled
    ) {
      this.elementDragPoint = snapped;
      this.elementDragMoved = false;
      this.dragIndices = this.getDragIndices(selectedIndex);
      const first = this.renderer.modelToScreen(selected.getPost(0));
      const second = this.renderer.modelToScreen(
        selected.getPost(Math.min(1, selected.getPostCount() - 1))
      );
      this.dragPostIndex =
        Math.hypot(screen.x - first.x, screen.y - first.y) <=
        Math.hypot(screen.x - second.x, screen.y - second.y)
          ? 0
          : 1;
    }
    this.updateInspector();
  }

  private onPointerMove(event: PointerEvent): void {
    const screen = this.canvasPosition(event);
    if (this.isOptionEnabled("toggle-crosshair")) {
      this.renderer.crosshair = screen;
    }
    if (this.panStart !== null) {
      this.renderer.pan(
        screen.x - this.panStart.x,
        screen.y - this.panStart.y
      );
      this.panStart = screen;
      return;
    }
    if (this.draft !== null) {
      const model = this.renderer.screenToModel(screen.x, screen.y);
      this.draft.end = new Point(
        this.snap(model.x),
        this.snap(model.y)
      );
      return;
    }
    if (this.selectionBox !== null) {
      const model = this.renderer.screenToModel(screen.x, screen.y);
      this.updateSelectionBox(new Point(model.x, model.y));
      return;
    }
    if (
      this.elementDragPoint !== null &&
      this.selectedIndex !== null
    ) {
      const model = this.renderer.screenToModel(screen.x, screen.y);
      const next = new Point(
        this.snap(model.x),
        this.snap(model.y)
      );
      const dx = next.x - this.elementDragPoint.x;
      const dy = next.y - this.elementDragPoint.y;
      if (dx !== 0 || dy !== 0) {
        if (this.dragMode === "post") {
          this.runner.elements[this.selectedIndex]?.movePoint(
            this.dragPostIndex,
            dx,
            dy
          );
        } else {
          for (const index of this.dragIndices) {
            const moveX = this.dragMode === "row" ? 0 : dx;
            const moveY = this.dragMode === "column" ? 0 : dy;
            this.runner.elements[index]?.move(moveX, moveY);
          }
        }
        this.elementDragPoint = next;
        this.elementDragMoved = true;
        this.runner.analyzed = false;
      }
      return;
    }

    const index = this.renderer.hitTest(
      this.runner.elements,
      screen.x,
      screen.y
    );
    this.canvas.style.cursor =
      index === null ? "crosshair" : "pointer";
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.heldMomentarySwitch !== null) {
      this.releaseHeldMomentarySwitch();
      return;
    }
    if (this.panStart !== null) {
      this.panStart = null;
      return;
    }
    if (this.elementDragPoint !== null) {
      this.elementDragPoint = null;
      this.dragIndices = [];
      if (this.elementDragMoved) {
        this.commitHistory();
        this.updateInspector();
      }
      this.elementDragMoved = false;
      return;
    }
    if (this.selectionBox !== null) {
      const screen = this.canvasPosition(event);
      const model = this.renderer.screenToModel(screen.x, screen.y);
      this.updateSelectionBox(new Point(model.x, model.y));
      this.selectionBox = null;
      this.selectionBase.clear();
      this.updateInspector();
      return;
    }
    if (this.draft === null) {
      return;
    }
    const draft = this.draft;
    this.draft = null;
    if (draft.start.equals(draft.end)) {
      return;
    }
    this.addElement(this.activeTool, draft.start, draft.end);
  }

  /** Matches SwitchElm.mouseUp() in the legacy MouseManager. */
  private releaseHeldMomentarySwitch(): void {
    if (this.heldMomentarySwitch === null) return;
    this.heldMomentarySwitch.toggle();
    this.heldMomentarySwitch = null;
    this.runner.analyzed = false;
    this.commitHistory();
    this.updateInspector();
  }

  private updateSelectionBox(end: Point): void {
    if (this.selectionBox === null) return;
    this.selectionBox.end = end;
    const x = Math.min(this.selectionBox.start.x, end.x);
    const y = Math.min(this.selectionBox.start.y, end.y);
    const selection = new Rectangle(
      x,
      y,
      Math.abs(end.x - this.selectionBox.start.x),
      Math.abs(end.y - this.selectionBox.start.y)
    );
    this.selectedIndices.clear();
    for (const index of this.selectionBase) {
      this.selectedIndices.add(index);
    }
    this.runner.elements.forEach((element, index) => {
      if (selection.intersects(element.getBoundingBox())) {
        this.selectedIndices.add(index);
      }
    });
    const currentSelection = [...this.selectedIndices];
    this.selectedIndex =
      currentSelection[currentSelection.length - 1] ?? null;
  }

  private addElement(tool: Tool, start: Point, end: Point): void {
    if (tool === "select") {
      return;
    }
    if (tool.startsWith("subcircuit:")) {
      this.addSubcircuitElement(
        decodeURIComponent(tool.slice("subcircuit:".length)),
        start,
        end
      );
      return;
    }
    const selected = COMPONENT_BY_ID.get(tool);
    if (selected === undefined) {
      this.showError(new Error(`未知元件工具：${tool}`));
      return;
    }
    const element = this.factory.create(
      selected.type,
      start.x,
      start.y,
      end.x,
      end.y,
      selected.flags ?? 0,
      new StringTokenizer(selected.arguments)
    );
    if (element === null) {
      this.showError(new Error(`元件 ${selected.label} 尚未迁移`));
      return;
    }
    element.setPoints();
    if (selected.xmlOnly) this.runner.sourceFormat = "xml";
    this.runner.elements.push(element);
    this.runner.analyzed = false;
    this.selectedIndex = this.runner.elements.length - 1;
    this.selectedIndices.clear();
    this.selectedIndices.add(this.selectedIndex);
    this.configureScopeChannels();
    this.commitHistory();
    this.updateInspector();
  }

  /** Instantiate an already loaded <ccm> through the same XML path used for
   * imported instances.  This avoids a UI-only stand-in and preserves the
   * model name/state in normal export and reload. */
  private addSubcircuitElement(name: string, start: Point, end: Point): void {
    if (CustomCompositeModel.get(name) === null) {
      this.showError(new Error(`子电路模型“${name}”不在当前电路中。`));
      this.refreshDrawSubcircuitMenu();
      return;
    }
    const element = this.factory.createFromXmlRecord({
      tagName: "cc",
      attributes: {
        x: `${start.x} ${start.y} ${end.x} ${end.y}`,
        f: "0",
        mo: name
      },
      contents: null,
      children: [],
      kind: "element"
    });
    if (element === null) {
      this.showError(new Error(`无法创建子电路“${name}”。`));
      return;
    }
    this.runner.sourceFormat = "xml";
    this.runner.elements.push(element);
    this.runner.analyzed = false;
    this.selectedIndex = this.runner.elements.length - 1;
    this.selectedIndices.clear();
    this.selectedIndices.add(this.selectedIndex);
    this.configureScopeChannels();
    this.commitHistory();
    this.updateInspector();
  }

  private updateElementParameter(
    parameter: string,
    logarithmicValue: number
  ): void {
    if (this.editDisabled) return;
    const selected =
      this.selectedIndex === null
        ? null
        : this.runner.elements[this.selectedIndex];
    const value = 10 ** logarithmicValue;
    if (parameter === "resistance") {
      const element =
        selected instanceof ResistorElm
          ? selected
          : this.runner.elements.find(
              (candidate): candidate is ResistorElm =>
                candidate instanceof ResistorElm
            );
      element?.setResistance(value);
    } else if (parameter === "capacitance") {
      const element =
        selected instanceof CapacitorElm
          ? selected
          : this.runner.elements.find(
              (candidate): candidate is CapacitorElm =>
                candidate instanceof CapacitorElm
            );
      element?.setCapacitance(value);
    } else if (parameter === "inductance") {
      const element =
        selected instanceof InductorElm
          ? selected
          : this.runner.elements.find(
              (candidate): candidate is InductorElm =>
                candidate instanceof InductorElm
            );
      element?.setInductance(value);
    }
    this.runner.analyzed = false;
    this.updateInspector();
  }

  private updateElementProperty(property: string, value: number): void {
    if (
      this.editDisabled ||
      !Number.isFinite(value) ||
      this.selectedIndex === null
    ) {
      return;
    }
    const element = this.runner.elements[this.selectedIndex];
    if (element instanceof ResistorElm && property === "resistance") {
      element.setResistance(Math.max(value, 1e-12));
    } else if (
      element instanceof CapacitorElm &&
      property === "capacitance"
    ) {
      element.setCapacitance(Math.max(value, 1e-15));
    } else if (
      element instanceof InductorElm &&
      property === "inductance"
    ) {
      element.setInductance(Math.max(value, 1e-15));
    } else if (element instanceof CurrentElm) {
      if (property === "currentValue") element.currentValue = value;
      if (property === "maxVoltage") {
        element.maxVoltage = Math.max(0, value);
      }
    } else if (element instanceof AudioInputElm) {
      if (property === "audioMaxVoltage") {
        element.audioMaxVoltage = value;
      }
      if (property === "startPosition") {
        element.startPosition = Math.max(value, 0);
      }
    } else if (element instanceof DataInputElm) {
      if (property === "sampleLength") {
        element.sampleLength = Math.max(value, 1e-15);
      }
      if (property === "scaleFactor") element.scaleFactor = value;
    } else if (element instanceof DataRecorderElm) {
      if (property === "dataCount") element.setDataCount(value);
    } else if (element instanceof VoltageElm) {
      if (property === "maxVoltage") element.maxVoltage = value;
      if (property === "frequency") {
        element.frequency = Math.max(0, value);
      }
      if (property === "bias") element.bias = value;
    } else if (element instanceof LogicInputElm) {
      if (property === "hiV") element.hiV = value;
      if (property === "loV") element.loV = value;
    } else if (element instanceof FuseElm) {
      if (property === "resistance") {
        element.resistance = Math.max(value, 1e-12);
      }
      if (property === "i2t") element.i2t = Math.max(value, 1e-12);
    } else if (element instanceof LDRElm) {
      if (property === "position") {
        element.position = Math.min(1, Math.max(0, value));
        element.updateResistance();
      }
    } else if (element instanceof ThermistorNTCElm) {
      if (property === "position") {
        element.position = Math.min(1, Math.max(0, value));
      }
      if (property === "r25") element.r25 = Math.max(value, 1e-9);
      if (property === "r50") element.r50 = Math.max(value, 1e-9);
      element.updateResistance();
    } else if (element instanceof DelayBufferElm) {
      if (property === "delay") element.delay = Math.max(value, 0);
      if (property === "threshold") element.threshold = value;
      if (property === "highVoltage") element.highVoltage = value;
    } else if (element instanceof AnalogMuxElm) {
      if (property === "rOn") element.rOn = Math.max(value, 1e-9);
      if (property === "rOff") element.rOff = Math.max(value, 1e-9);
      if (property === "threshold") element.threshold = value;
    } else if (element instanceof TimeDelayRelayElm) {
      if (property === "onDelay") element.onDelay = Math.max(value, 0);
      if (property === "offDelay") element.offDelay = Math.max(value, 0);
      if (property === "onResistance") {
        element.onResistance = Math.max(value, 1e-9);
      }
      if (property === "offResistance") {
        element.offResistance = Math.max(value, 1e-9);
      }
    } else if (element instanceof ThreePhaseMotorElm) {
      if (property === "statorInductance" && value > 0) {
        element.statorInductance = value;
      }
      if (property === "rotorInductance" && value > 0) {
        element.rotorInductance = value;
      }
      if (
        property === "couplingCoefficient" &&
        value > 0 &&
        value < 1
      ) {
        element.mutualInductance =
          value *
          Math.sqrt(
            element.statorInductance * element.rotorInductance
          );
      }
      if (property === "statorResistance" && value > 0) {
        element.statorResistance = value;
      }
      if (property === "rotorResistance" && value > 0) {
        element.rotorResistance = value;
      }
      if (property === "friction") element.friction = value;
      if (property === "inertia" && value > 0) element.inertia = value;
    } else if (element instanceof TriStateElm) {
      if (property === "rOn") element.rOn = Math.max(value, 1e-9);
      if (property === "rOff") element.rOff = Math.max(value, 1e-9);
      if (property === "rOffGround") {
        element.rOffGround = Math.max(value, 0);
      }
      if (property === "highVoltage") element.highVoltage = value;
    } else if (element instanceof DCMotorElm) {
      if (property === "inductance") {
        element.inductance = Math.max(value, 1e-12);
      }
      if (property === "resistance") {
        element.resistance = Math.max(value, 1e-12);
      }
      if (property === "torqueConstant") {
        element.torqueConstant = Math.max(value, 0);
        element.backEmfConstant = element.torqueConstant;
      }
      if (property === "momentOfInertia") {
        element.momentOfInertia = Math.max(value, 1e-12);
      }
      if (property === "friction") {
        element.friction = Math.max(value, 1e-12);
      }
      if (property === "gearRatio") {
        element.gearRatio = Math.max(value, 1e-12);
      }
      element.setupModels();
    } else if (element instanceof OpAmpRealElm) {
      if (property === "slewRate") {
        element.slewRate = Math.max(value, 0);
      }
      if (property === "currentLimit") {
        element.currentLimit = Math.max(value, 1e-9);
      }
    } else if (element instanceof OptocouplerElm) {
      if (property === "ctr") element.ctr = Math.max(value, 0);
    } else if (element instanceof CustomTransformerElm) {
      if (property === "inductance") {
        element.inductance = Math.max(value, 1e-12);
      }
      if (property === "couplingCoef") {
        element.couplingCoef = Math.min(0.999999, Math.max(value, 1e-6));
      }
      element.parseDescription(element.description);
    }
    this.runner.analyzed = false;
  }

  /**
   * Applies the value of an element-owned range control.  These controls are
   * deliberately part of the regular inspector rather than the test API, so
   * automated dynamic checks exercise the same browser input path as a user.
   */
  private updateElementRange(
    range: string,
    value: number,
    input: HTMLInputElement
  ): void {
    if (
      this.editDisabled ||
      !Number.isFinite(value) ||
      this.selectedIndex === null
    ) {
      return;
    }
    const element = this.runner.elements[this.selectedIndex];
    const output = input
      .closest("label")
      ?.querySelector<HTMLOutputElement>("output");
    if (element instanceof VarRailElm && range === "var-rail-voltage") {
      element.setSliderValue(value);
      if (output !== null && output !== undefined) {
        const voltage =
          element.bias +
          (element.sliderValue / 100) * (element.maxVoltage - element.bias);
        output.textContent = CircuitElm.getVoltageText(voltage);
      }
    } else if (element instanceof PotElm && range === "potentiometer") {
      element.setSliderPosition(0.005 + (Math.max(0, Math.min(100, value)) / 100) * 0.99);
      if (output !== null && output !== undefined) {
        output.textContent = `${Math.round(element.position * 100)}%`;
      }
    } else {
      return;
    }
    this.runner.analyzed = false;
  }

  private resetSimulation(): void {
    this.runner.resetTime();
    for (const element of this.runner.elements) {
      element.reset();
    }
    this.runner.analyzed = false;
    for (const channel of this.scopeGroups.flatMap((group) => group.plots)) {
      channel.samples.length = 0;
    }
    this.errorMessage = null;
    this.setRunning(true);
    if (this.autoDcOnReset) {
      this.findDcOperatingPoint();
    }
  }

  private deleteSelected(): void {
    if (this.editDisabled || this.selectedIndices.size === 0) {
      if (this.editDisabled) this.notifyEditingDisabled();
      return;
    }
    const selected = [...this.selectedIndices].sort((a, b) => b - a);
    for (const index of selected) {
      this.runner.elements.splice(index, 1);
    }
    this.selectedIndex = null;
    this.selectedIndices.clear();
    this.runner.analyzed = false;
    this.configureScopeChannels();
    this.commitHistory();
    this.updateInspector();
  }

  private serializeCircuit(): string {
    this.syncScopePlots();
    if (this.runner.sourceFormat === "xml") {
      return this.serializeXmlCircuit();
    }
    const flags =
      (this.renderer.showCurrent ? 1 : 0) |
      (this.renderer.smallGrid ? 2 : 0) |
      (this.renderer.showVoltage ? 0 : 4) |
      (this.renderer.showPower ? 8 : 0) |
      (this.renderer.showValues ? 0 : 16) |
      (this.runner.simulation.adjustTimeStep ? 64 : 0) |
      (this.autoDcOnReset ? 128 : 0);
    const options =
      `$ ${flags} ` +
      `${this.runner.simulation.maxTimeStep} 10.2 50 ` +
      `${CircuitElm.voltageRange} 43 ${this.runner.simulation.minTimeStep}`;
    const modelRecords = this.runner.preservedTextRecords.filter(
      (record) => {
        const type = record.trimStart().split(/\s+/, 1)[0];
        // These records configure factories used by later CircuitElm lines.
        // Preserve their legacy pre-element ordering so a text export can be
        // loaded into a fresh app without silently falling back to defaults.
        return (
          type === "!" ||
          type === "." ||
          type === '"' ||
          type === "32" ||
          type === "34"
        );
      }
    );
    const otherRecords = this.runner.preservedTextRecords.filter((record) => {
      if (modelRecords.includes(record)) return false;
      return record.trimStart().split(/\s+/, 1)[0] !== "o";
    });
    const scopeRecords = this.scopeGroups.map((group) => {
      const first = group.plots[0];
      if (first === undefined) return "";
      const hasMultiplePlots = group.plots.length > 1;
      const flags = hasMultiplePlots ? 4096 : 0;
      const voltageScale = group.plots.find((plot) => plot.value !== 3)?.scale ?? 0;
      const currentScale = group.plots.find((plot) => plot.value === 3)?.scale ?? 0;
      return [
        "o", first.elementIndex, 64, first.value, flags, voltageScale,
        currentScale, group.panel,
        ...(hasMultiplePlots ? [group.plots.length, ...group.plots.slice(1).flatMap((plot) => [plot.elementIndex, plot.value])] : [])
      ].join(" ");
    }).filter(Boolean);
    return [
      options,
      ...modelRecords,
      ...this.runner.elements.map((element) => element.dump()),
      ...scopeRecords,
      ...otherRecords
    ].join("\n");
  }

  private serializeXmlCircuit(): string {
    const document = globalThis.document.implementation.createDocument(
      "",
      "cir"
    );
    const root = document.documentElement;
    root.setAttribute(
      "f",
      String(
        (this.renderer.showCurrent ? 1 : 0) |
          (this.renderer.smallGrid ? 2 : 0) |
          (this.renderer.showVoltage ? 0 : 4) |
          (this.renderer.showPower ? 8 : 0) |
          (this.renderer.showValues ? 0 : 16) |
          (this.runner.simulation.adjustTimeStep ? 64 : 0) |
          (this.autoDcOnReset ? 128 : 0)
      )
    );
    root.setAttribute(
      "ts",
      String(this.runner.simulation.maxTimeStep)
    );
    root.setAttribute(
      "mts",
      String(this.runner.simulation.minTimeStep)
    );
    root.setAttribute("st", String(this.runner.simulation.solverType));
    root.setAttribute("vr", String(CircuitElm.voltageRange));

    const modelRecords = this.runner.preservedXmlRecords.filter(
      (record) => record.kind === "model"
    );
    const otherRecords = this.runner.preservedXmlRecords.filter(
      (record) => record.kind !== "model" && record.kind !== "scope"
    );
    for (const record of modelRecords) {
      root.append(this.xmlRecordToElement(document, record));
    }
    for (const element of this.runner.elements) {
      const xmlElement = document.createElement(
        element.getXmlDumpType()
      );
      element.dumpXml(document, xmlElement);
      root.append(xmlElement);
    }
    for (const group of this.scopeGroups) {
      const first = group.plots[0];
      if (first === undefined) continue;
      const scope = document.createElement("o");
      scope.setAttribute("en", String(first.elementIndex));
      scope.setAttribute("p", String(group.panel));
      for (const plot of group.plots) {
        const child = document.createElement("p");
        child.setAttribute("e", String(plot.elementIndex));
        child.setAttribute("v", String(plot.value));
        if (plot.scale !== null) child.setAttribute("sc", String(plot.scale));
        scope.append(child);
      }
      root.append(scope);
    }
    for (const record of otherRecords) {
      root.append(this.xmlRecordToElement(document, record));
    }
    return new globalThis.XMLSerializer().serializeToString(document);
  }

  private xmlRecordToElement(
    document: Document,
    record: {
      tagName: string;
      attributes: Record<string, string>;
      contents: string | null;
      children: Array<{
        tagName: string;
        attributes: Record<string, string>;
        contents: string | null;
        children: any[];
      }>;
    }
  ): Element {
    const element = document.createElement(record.tagName);
    for (const [name, value] of Object.entries(record.attributes)) {
      element.setAttribute(name, value);
    }
    if (record.contents !== null) {
      element.append(document.createTextNode(record.contents));
    }
    for (const child of record.children) {
      element.append(this.xmlRecordToElement(document, child));
    }
    return element;
  }

  private commitHistory(saveAutosave = true): void {
    const source = this.serializeCircuit();
    if (saveAutosave) {
      try {
        localStorage.setItem(NativeCircuitApp.AUTOSAVE_KEY, source);
      } catch {
        // Autosave is best-effort in privacy-restricted browser contexts.
      }
    }
    if (this.history[this.historyIndex] === source) {
      return;
    }
    this.history.splice(this.historyIndex + 1);
    this.history.push(source);
    if (this.history.length > 60) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
    this.syncEditMenuState();
  }

  private undo(): void {
    if (this.editDisabled || this.historyIndex <= 0) {
      if (this.editDisabled) this.notifyEditingDisabled();
      return;
    }
    this.historyIndex -= 1;
    this.loadCircuit(this.history[this.historyIndex], true, false);
    this.syncEditMenuState();
  }

  private redo(): void {
    if (this.editDisabled || this.historyIndex >= this.history.length - 1) {
      if (this.editDisabled) this.notifyEditingDisabled();
      return;
    }
    this.historyIndex += 1;
    this.loadCircuit(this.history[this.historyIndex], true, false);
    this.syncEditMenuState();
  }

  private downloadCircuit(): void {
    const blob = new Blob([this.serializeCircuit()], {
      type: "text/plain;charset=utf-8"
    });
    this.downloadBlob(
      blob,
      this.runner.sourceFormat === "xml" ? "circuit.xml" : "circuit.txt"
    );
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private exportAsLink(): void {
    const base = window.location.href.split("#", 1)[0];
    const link =
      `${base}#circuit=` +
      encodeURIComponent(this.serializeCircuit());
    this.openTextDialog("导出电路链接", "export", link);
  }

  private exportCanvasImage(): void {
    this.canvas.toBlob((blob) => {
      if (blob !== null) this.downloadBlob(blob, "circuit.png");
    }, "image/png");
  }

  private async copyCanvasImage(): Promise<void> {
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob(resolve, "image/png")
    );
    if (blob === null || navigator.clipboard === undefined) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ]);
    } catch (error) {
      this.showError(error);
    }
  }

  private exportCanvasSvg(): void {
    const image = this.canvas.toDataURL("image/png");
    const width = this.canvas.width;
    const height = this.canvas.height;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<image width="${width}" height="${height}" href="${image}"/>` +
      "</svg>";
    this.downloadBlob(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      "circuit.svg"
    );
  }

  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement === null) {
      await this.root.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  private recoverAutosave(): void {
    const source = localStorage.getItem(NativeCircuitApp.AUTOSAVE_KEY);
    if (source === null || source.trim().length === 0) {
      this.errorMessage = "没有可恢复的自动保存";
      return;
    }
    try {
      this.loadCircuit(source);
    } catch (error) {
      this.showError(error);
    }
  }

  private findDcOperatingPoint(): void {
    this.setRunning(false);
    this.runner.resetTime();
    for (const element of this.runner.elements) element.reset();
    this.runner.analyzed = false;
    try {
      for (let index = 0; index < 256; index += 1) {
        this.runner.runCircuit(200);
      }
      this.errorMessage = null;
      this.recordScope();
    } catch (error) {
      this.showError(error);
    }
  }

  private exportScopeCsv(): void {
    const length = Math.max(
      0,
      ...this.scopeGroups.flatMap((group) => group.plots).map((channel) => channel.samples.length)
    );
    const rows = [
      ["sample", ...this.scopeGroups.flatMap((group) => group.plots).map((channel) => channel.name)].join(
        ","
      )
    ];
    for (let index = 0; index < length; index += 1) {
      rows.push(
        [
          index,
          ...this.scopeGroups.flatMap((group) => group.plots).map(
            (channel) => channel.samples[index] ?? ""
          )
        ].join(",")
      );
    }
    this.downloadBlob(
      new Blob([rows.join("\n")], {
        type: "text/csv;charset=utf-8"
      }),
      "scope.csv"
    );
  }

  private convertWiresToRouted(): void {
    if (this.editDisabled) {
      this.notifyEditingDisabled();
      return;
    }
    let changed = false;
    const converted = this.runner.elements.map((element) => {
      if (!(element instanceof WireElm) || element instanceof RoutedWireElm) {
        return element;
      }
      const routed = new RoutedWireElm(element.x, element.y);
      routed.flags = element.flags;
      routed.setPosition(element.x, element.y, element.x2, element.y2);
      routed.setBusWidth(element.busWidth);
      changed = true;
      return routed;
    });
    if (!changed) return;
    this.runner.elements.splice(
      0,
      this.runner.elements.length,
      ...converted
    );
    this.runner.sourceFormat = "xml";
    this.runner.analyzed = false;
    this.selectedIndex = null;
    this.selectedIndices.clear();
    this.commitHistory();
  }

  private openTextDialog(
    title: string,
    mode: "import" | "export" | "notice",
    value: string
  ): void {
    this.dialogTitle.textContent = title;
    this.dialogApply.dataset.mode = mode;
    this.dialogApply.textContent = mode === "import" ? "载入" : mode === "export" ? "复制" : "知道了";
    this.textArea.value = value;
    this.textArea.readOnly = mode !== "import";
    this.textDialog.showModal();
    this.textArea.focus();
    if (mode !== "import") {
      this.textArea.select();
    }
  }

  private configureScopeChannels(): void {
    const scopedPlots = this.runner.scopePlots
      .map((plot) => ({
        ...plot,
        element: this.runner.elements[plot.elementIndex]
      }))
      .filter((plot) => plot.element !== undefined)
      .filter((plot) => plot.panel < 3);
    if (scopedPlots.length > 0) {
      const plots = scopedPlots.map((plot) => {
        const className = plot.element
          .getClassName()
          .replace(/Elm$/, "");
        const elementLabel = this.scopeElementLabel(plot.element);
        if (plot.value === 3) {
          return {
            elementIndex: plot.elementIndex,
            value: plot.value,
            name: `${className} 电流`,
            elementLabel,
            unit: "A",
            color: "#00d83b",
            scale: plot.scale,
            samples: [],
            read: () => plot.element.getCurrent()
          };
        }
        if (plot.value === 7) {
          return {
            elementIndex: plot.elementIndex,
            value: plot.value,
            name: `${className} 功率`,
            elementLabel,
            unit: "W",
            color: "#20a7ff",
            scale: plot.scale,
            samples: [],
            read: () => plot.element.getPower()
          };
        }
        return {
          elementIndex: plot.elementIndex,
          value: plot.value,
          name: `${className} 电压`,
          elementLabel,
          unit: "V",
          color: "#f1e900",
          scale: plot.scale,
          samples: [],
          read: () => plot.element.getVoltageDiff()
        };
      });
      this.scopeGroups = [...new Map(scopedPlots.map((plot) => [
        plot.scopeId,
        { scopeId: plot.scopeId, panel: plot.panel, plots: plots.filter((_, index) => scopedPlots[index]?.scopeId === plot.scopeId) }
      ])).values()];
      this.syncScopeLayout();
      this.syncOptionButtons();
      return;
    }
    // Legacy keeps the scope area empty unless the circuit has explicit `o`
    // records or the user adds an element to a scope.  Do not manufacture
    // charts from passive elements: that changes both the visible layout and
    // the serialized circuit state after an otherwise no-op import.
    this.scopeGroups = [];
    this.syncScopeLayout();
    this.syncOptionButtons();
  }

  private scopeElementLabel(element: CircuitElm): string {
    if (element instanceof CapacitorElm) return "电容器";
    if (element instanceof InductorElm) return "电感器";
    if (element instanceof ResistorElm) return "电阻器";
    return element.getClassName().replace(/Elm$/, "");
  }

  private animationFrame(now: number): void {
    const elapsed = Math.min(0.1, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    if (this.running && elapsed > 0) {
      try {
        const simulationStarted = performance.now();
        const frameBudget = 1000 / this.minimumFrameRate;
        for (let index = 0; index < this.stepsPerFrame; index += 1) {
          this.runner.runCircuit(200);
          if (
            this.runner.elements.some(
              (element) =>
                element instanceof StopTriggerElm && element.stopped
            )
          ) {
            this.setRunning(false);
            break;
          }
          if (performance.now() - simulationStarted >= frameBudget) {
            break;
          }
        }
        this.errorMessage = null;
        this.recordScope();
      } catch (error) {
        this.showError(error);
        this.setRunning(false);
      }
    }
    this.render(this.running ? elapsed * 1000 : 0);
    requestAnimationFrame((time) => this.animationFrame(time));
  }

  private render(currentAnimationElapsedMs = 0): void {
    this.resizeCanvases();
    const context = this.canvas.getContext("2d");
    if (context === null) {
      throw new Error("Canvas 2D context is unavailable");
    }
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.renderer.render(
      context,
      width,
      height,
      this.runner.elements,
      this.selectedIndices,
      currentAnimationElapsedMs,
      this.currentSpeed,
      this.draft,
      this.selectionBox
    );
    if (this.hasScopes()) {
      const scopeContext = this.scopeCanvas.getContext("2d");
      if (scopeContext === null) {
        throw new Error("Scope Canvas 2D context is unavailable");
      }
      scopeContext.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
      );
      this.renderScopes(
        scopeContext,
        this.scopeCanvas.clientWidth,
        this.scopeCanvas.clientHeight
      );
    }
    this.updateStatus();
  }

  private recordScope(): void {
    for (const channel of this.scopeGroups.flatMap((group) => group.plots)) {
      channel.samples.push(channel.read());
      if (channel.samples.length > 720) {
        channel.samples.shift();
      }
    }
  }

  private renderScopes(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    context.clearRect(0, 0, width, height);
    context.fillStyle = this.renderer.whiteBackground ? "#ffffff" : "#101010";
    context.fillRect(0, 0, width, height);
    const panelCount = Math.max(1, ...this.scopeGroups.map((group) => group.panel + 1));
    const panelWidth = width / panelCount;

    for (let panel = 0; panel < panelCount; panel += 1) {
      const x = panel * panelWidth;
      context.save();
      context.beginPath();
      context.rect(x, 0, panelWidth, height);
      context.clip();
      context.strokeStyle = this.renderer.whiteBackground
        ? "#d1d5db"
        : "#333";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, height / 2);
      context.lineTo(x + panelWidth, height / 2);
      context.stroke();
      if (panel > 0) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      context.restore();
    }

    this.scopeGroups.forEach((group) => group.plots.forEach((channel, channelIndex) => {
      const panel = group.panel;
      const x = panel * panelWidth;
      context.save();
      context.beginPath();
      context.rect(x, 0, panelWidth, height);
      context.clip();
      const max = Math.max(
        1e-12,
        ...channel.samples.map((sample) => Math.abs(sample))
      );
      context.strokeStyle = channel.color;
      context.lineWidth = 1.6;
      context.beginPath();
      channel.samples.forEach((sample, sampleIndex) => {
        const sampleX =
          x +
          (sampleIndex / Math.max(channel.samples.length - 1, 1)) *
            panelWidth;
        const sampleY =
          height / 2 - (sample / max) * (height * 0.38);
        if (sampleIndex === 0) {
          context.moveTo(sampleX, sampleY);
        } else {
          context.lineTo(sampleX, sampleY);
        }
      });
      context.stroke();

      if (channelIndex === 0) {
        context.fillStyle = this.renderer.whiteBackground
          ? "#111827"
          : "#f3f4f6";
        context.font = "12px Arial";
        const label = `Max=${CircuitElm.getShortUnitText(max, channel.unit)}`;
        context.fillText(
          label,
          x + 8,
          17
        );
        context.fillText(channel.elementLabel, x + 8, 32);
      }
      context.restore();
    }));
  }

  private updateInspector(): void {
    const selected =
      this.selectedIndex === null
        ? null
        : this.runner.elements[this.selectedIndex];
    const title = this.root.querySelector<HTMLElement>("#selected-title");
    const details =
      this.root.querySelector<HTMLElement>("#selected-details");
    if (title !== null) {
      title.textContent =
        selected === null ? "未选择元件" : selected.getClassName();
    }
    if (details !== null) {
      if (selected === null) {
        details.textContent = "单击元件可查看；单击开关可切换状态";
      } else {
        const values = [
          `电压 ${CircuitElm.getVoltageText(selected.getVoltageDiff())}`,
          `电流 ${CircuitElm.getCurrentText(selected.getCurrent())}`,
          `功率 ${CircuitElm.getUnitText(selected.getPower(), "W")}`
        ];
        if (selected instanceof ThreePhaseMotorElm) {
          const rpm =
            (60 * Math.abs(selected.filteredSpeed)) / (2 * Math.PI);
          values.push(`转速 ${CircuitElm.getUnitText(rpm, "RPM")}`);
        }
        details.textContent = values.join(" · ");
      }
    }

    this.setParameterSlider(
      "resistance",
      selected instanceof ResistorElm
        ? selected.resistance
        : this.runner.elements.find(
            (element): element is ResistorElm =>
              element instanceof ResistorElm
          )?.resistance
    );
    this.setParameterSlider(
      "capacitance",
      selected instanceof CapacitorElm
        ? selected.capacitance
        : this.runner.elements.find(
            (element): element is CapacitorElm =>
              element instanceof CapacitorElm
          )?.capacitance
    );
    this.setParameterSlider(
      "inductance",
      selected instanceof InductorElm
        ? selected.inductance
        : this.runner.elements.find(
            (element): element is InductorElm =>
              element instanceof InductorElm
          )?.inductance
    );
    this.renderElementProperties(selected);
    this.syncEditMenuState();
  }

  private renderElementProperties(element: CircuitElm | null): void {
    const container = this.root.querySelector<HTMLElement>(
      "#element-properties"
    );
    if (container === null) return;
    const properties: Array<{
      key: string;
      label: string;
      value: number;
      unit: string;
    }> = [];
    if (element instanceof ResistorElm) {
      properties.push({
        key: "resistance",
        label: "电阻值",
        value: element.resistance,
        unit: "Ω"
      });
    } else if (element instanceof CapacitorElm) {
      properties.push({
        key: "capacitance",
        label: "电容量",
        value: element.capacitance,
        unit: "F"
      });
    } else if (element instanceof InductorElm) {
      properties.push({
        key: "inductance",
        label: "电感量",
        value: element.inductance,
        unit: "H"
      });
    } else if (element instanceof CurrentElm) {
      properties.push(
        {
          key: "currentValue",
          label: "电流",
          value: element.currentValue,
          unit: "A"
        },
        {
          key: "maxVoltage",
          label: "最大电压",
          value: element.maxVoltage,
          unit: "V"
        }
      );
    } else if (element instanceof AudioInputElm) {
      properties.push(
        {
          key: "audioMaxVoltage",
          label: "最大电压",
          value: element.audioMaxVoltage,
          unit: "V"
        },
        {
          key: "startPosition",
          label: "起始位置",
          value: element.startPosition,
          unit: "s"
        }
      );
    } else if (element instanceof DataInputElm) {
      properties.push(
        {
          key: "sampleLength",
          label: "采样间隔",
          value: element.sampleLength,
          unit: "s"
        },
        {
          key: "scaleFactor",
          label: "缩放系数",
          value: element.scaleFactor,
          unit: "×"
        }
      );
    } else if (element instanceof DataRecorderElm) {
      properties.push({
        key: "dataCount",
        label: "记录点数",
        value: element.dataCount,
        unit: ""
      });
    } else if (element instanceof VoltageElm) {
      properties.push(
        {
          key: "maxVoltage",
          label: "幅值",
          value: element.maxVoltage,
          unit: "V"
        },
        {
          key: "frequency",
          label: "频率",
          value: element.frequency,
          unit: "Hz"
        },
        {
          key: "bias",
          label: "偏置",
          value: element.bias,
          unit: "V"
        }
      );
    } else if (element instanceof LogicInputElm) {
      properties.push(
        {
          key: "hiV",
          label: "高电平",
          value: element.hiV,
          unit: "V"
        },
        {
          key: "loV",
          label: "低电平",
          value: element.loV,
          unit: "V"
        }
      );
    } else if (element instanceof FuseElm) {
      properties.push(
        {
          key: "i2t",
          label: "熔断 I²t",
          value: element.i2t,
          unit: "A²s"
        },
        {
          key: "resistance",
          label: "导通电阻",
          value: element.resistance,
          unit: "Ω"
        }
      );
    } else if (element instanceof LDRElm) {
      properties.push({
        key: "position",
        label: "光照位置 (0–1)",
        value: element.position,
        unit: ""
      });
    } else if (element instanceof ThermistorNTCElm) {
      properties.push(
        {
          key: "position",
          label: "温度位置 (0–1)",
          value: element.position,
          unit: ""
        },
        {
          key: "r25",
          label: "25°C 电阻",
          value: element.r25,
          unit: "Ω"
        },
        {
          key: "r50",
          label: "50°C 电阻",
          value: element.r50,
          unit: "Ω"
        }
      );
    } else if (element instanceof DelayBufferElm) {
      properties.push(
        {
          key: "delay",
          label: "传播延时",
          value: element.delay,
          unit: "s"
        },
        {
          key: "threshold",
          label: "阈值",
          value: element.threshold,
          unit: "V"
        },
        {
          key: "highVoltage",
          label: "高电平",
          value: element.highVoltage,
          unit: "V"
        }
      );
    } else if (element instanceof AnalogMuxElm) {
      properties.push(
        {
          key: "rOn",
          label: "导通电阻",
          value: element.rOn,
          unit: "Ω"
        },
        {
          key: "rOff",
          label: "关断电阻",
          value: element.rOff,
          unit: "Ω"
        },
        {
          key: "threshold",
          label: "选择阈值",
          value: element.threshold,
          unit: "V"
        }
      );
    } else if (element instanceof TimeDelayRelayElm) {
      properties.push(
        {
          key: "onDelay",
          label: "吸合延时",
          value: element.onDelay,
          unit: "s"
        },
        {
          key: "offDelay",
          label: "释放延时",
          value: element.offDelay,
          unit: "s"
        },
        {
          key: "onResistance",
          label: "触点导通电阻",
          value: element.onResistance,
          unit: "Ω"
        },
        {
          key: "offResistance",
          label: "触点关断电阻",
          value: element.offResistance,
          unit: "Ω"
        }
      );
    } else if (element instanceof ThreePhaseMotorElm) {
      properties.push(
        {
          key: "statorInductance",
          label: "定子电感",
          value: element.statorInductance,
          unit: "H"
        },
        {
          key: "rotorInductance",
          label: "转子电感",
          value: element.rotorInductance,
          unit: "H"
        },
        {
          key: "couplingCoefficient",
          label: "耦合系数",
          value:
            element.mutualInductance /
            Math.sqrt(
              element.statorInductance * element.rotorInductance
            ),
          unit: ""
        },
        {
          key: "statorResistance",
          label: "定子电阻",
          value: element.statorResistance,
          unit: "Ω"
        },
        {
          key: "rotorResistance",
          label: "转子电阻",
          value: element.rotorResistance,
          unit: "Ω"
        },
        {
          key: "friction",
          label: "摩擦系数",
          value: element.friction,
          unit: "N·m·s/rad"
        },
        {
          key: "inertia",
          label: "转动惯量",
          value: element.inertia,
          unit: "kg·m²"
        }
      );
    } else if (element instanceof TriStateElm) {
      properties.push(
        {
          key: "rOn",
          label: "导通电阻",
          value: element.rOn,
          unit: "Ω"
        },
        {
          key: "rOff",
          label: "高阻态电阻",
          value: element.rOff,
          unit: "Ω"
        },
        {
          key: "rOffGround",
          label: "下拉电阻",
          value: element.rOffGround,
          unit: "Ω"
        },
        {
          key: "highVoltage",
          label: "高电平",
          value: element.highVoltage,
          unit: "V"
        }
      );
    } else if (element instanceof DCMotorElm) {
      properties.push(
        {
          key: "inductance",
          label: "电枢电感",
          value: element.inductance,
          unit: "H"
        },
        {
          key: "resistance",
          label: "电枢电阻",
          value: element.resistance,
          unit: "Ω"
        },
        {
          key: "torqueConstant",
          label: "转矩常数",
          value: element.torqueConstant,
          unit: "Nm/A"
        },
        {
          key: "momentOfInertia",
          label: "转动惯量",
          value: element.momentOfInertia,
          unit: "kg·m²"
        },
        {
          key: "friction",
          label: "摩擦系数",
          value: element.friction,
          unit: "Nms/rad"
        },
        {
          key: "gearRatio",
          label: "齿轮比",
          value: element.gearRatio,
          unit: ""
        }
      );
    } else if (element instanceof OpAmpRealElm) {
      properties.push(
        {
          key: "slewRate",
          label: "压摆率",
          value: element.slewRate,
          unit: "V/µs"
        },
        {
          key: "currentLimit",
          label: "输出限流",
          value: element.currentLimit,
          unit: "A"
        }
      );
    } else if (element instanceof OptocouplerElm) {
      properties.push({
        key: "ctr",
        label: "电流传输比",
        value: element.ctr,
        unit: "×"
      });
    } else if (element instanceof CustomTransformerElm) {
      properties.push(
        {
          key: "inductance",
          label: "基础电感",
          value: element.inductance,
          unit: "H"
        },
        {
          key: "couplingCoef",
          label: "耦合系数",
          value: element.couplingCoef,
          unit: ""
        }
      );
    }

    const rangeControls = this.createElementRangeControls(element);
    container.replaceChildren(
      ...rangeControls,
      ...properties.map((property) => {
        const label = document.createElement("label");
        label.className = "property-row";
        const text = document.createElement("span");
        text.textContent = property.label;
        const field = document.createElement("span");
        field.className = "property-field";
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = String(property.value);
        input.dataset.elementProperty = property.key;
        const unit = document.createElement("small");
        unit.textContent = property.unit;
        field.append(input, unit);
        label.append(text, field);
        return label;
      })
    );
    if (element instanceof CustomTransformerElm) {
      const label = document.createElement("label");
      label.className = "property-row";
      const text = document.createElement("span");
      text.textContent = "绕组描述";
      const input = document.createElement("input");
      input.type = "text";
      input.value = element.description;
      input.addEventListener("change", () => {
        if (!element.parseDescription(input.value)) {
          input.setCustomValidity("绕组描述格式无效");
          input.reportValidity();
          input.value = element.description;
          return;
        }
        input.setCustomValidity("");
        this.runner.analyzed = false;
        this.commitHistory();
      });
      label.append(text, input);
      container.append(label);
    } else if (element instanceof AudioInputElm) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "audio/*";
      fileInput.hidden = true;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "property-action";
      button.textContent =
        element.data.length > 0
          ? `重新载入音频（${element.fileName}）`
          : "载入音频文件";
      button.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (file === undefined) return;
        try {
          const audioContext = new AudioContext();
          const buffer = await audioContext.decodeAudioData(
            await file.arrayBuffer()
          );
          element.loadAudioData(
            buffer.getChannelData(0),
            buffer.sampleRate,
            file.name
          );
          await audioContext.close();
          this.runner.sourceFormat = "xml";
          this.runner.analyzed = false;
          this.commitHistory();
          this.updateInspector();
        } catch (error) {
          this.showError(error);
        }
      });
      container.append(button, fileInput);
    } else if (element instanceof DataInputElm) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".txt,.csv,text/plain";
      fileInput.hidden = true;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "property-action";
      button.textContent =
        element.data.length > 0
          ? `重新载入采样文件（${element.fileName}）`
          : "载入采样文件";
      button.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (file === undefined) return;
        element.loadData(await file.text(), file.name);
        // XML can carry the actual sample data; the legacy text format
        // only stored an in-memory cache id.
        this.runner.sourceFormat = "xml";
        this.runner.analyzed = false;
        this.commitHistory();
        this.updateInspector();
      });
      container.append(button, fileInput);
    } else if (element instanceof DataRecorderElm) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "property-action";
      button.textContent = "下载记录数据";
      button.addEventListener("click", () => {
        const blob = new Blob([element.exportData()], {
          type: "text/plain;charset=utf-8"
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "circuit-data.txt";
        anchor.click();
        URL.revokeObjectURL(url);
      });
      container.append(button);
    }
  }

  private createElementRangeControls(element: CircuitElm | null): HTMLElement[] {
    if (element instanceof VarRailElm) {
      const label = document.createElement("label");
      label.className = "property-row property-range";
      const text = document.createElement("span");
      text.textContent = element.sliderText;
      const field = document.createElement("span");
      field.className = "property-field";
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "100";
      input.step = "1";
      input.value = String(element.sliderValue);
      input.dataset.elementRange = "var-rail-voltage";
      input.setAttribute("aria-label", element.sliderText);
      const output = document.createElement("output");
      output.textContent = CircuitElm.getVoltageText(
        element.bias +
          (element.sliderValue / 100) * (element.maxVoltage - element.bias)
      );
      field.append(input, output);
      label.append(text, field);
      return [label];
    }
    if (element instanceof PotElm) {
      const label = document.createElement("label");
      label.className = "property-row property-range";
      const text = document.createElement("span");
      text.textContent = element.sliderText;
      const field = document.createElement("span");
      field.className = "property-field";
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0";
      input.max = "100";
      input.step = "1";
      input.value = String(
        Math.round(((element.position - 0.005) / 0.99) * 100)
      );
      input.dataset.elementRange = "potentiometer";
      input.setAttribute("aria-label", element.sliderText);
      const output = document.createElement("output");
      output.textContent = `${Math.round(element.position * 100)}%`;
      field.append(input, output);
      label.append(text, field);
      return [label];
    }
    return [];
  }

  private setParameterSlider(
    parameter: string,
    value: number | undefined
  ): void {
    const input = this.root.querySelector<HTMLInputElement>(
      `[data-parameter="${parameter}"]`
    );
    const output = this.root.querySelector<HTMLElement>(
      `[data-parameter-value="${parameter}"]`
    );
    if (input === null || output === null) {
      return;
    }
    const disabled = value === undefined;
    input.disabled = disabled;
    input.closest("label")?.classList.toggle("disabled", disabled);
    if (disabled) {
      output.textContent = "—";
      return;
    }
    input.value = String(Math.log10(Math.max(value, 1e-15)));
    const unit =
      parameter === "resistance"
        ? "Ω"
        : parameter === "capacitance"
          ? "F"
          : "H";
    output.textContent = CircuitElm.getShortUnitText(value, unit);
  }

  private updateStatus(): void {
    const state = this.errorMessage ?? (this.running ? "运行中" : "已暂停");
    this.status.textContent =
      `纯 TypeScript · ${state} · 元件 ${this.runner.elements.length} · ` +
      `t=${CircuitElm.getTimeText(this.runner.simulation.t)}`;
  }

  private resizeCanvases(): void {
    const canvases = this.hasScopes()
      ? [this.canvas, this.scopeCanvas]
      : [this.canvas];
    for (const canvas of canvases) {
      const width = Math.max(1, Math.floor(canvas.clientWidth));
      const height = Math.max(1, Math.floor(canvas.clientHeight));
      const pixelWidth = Math.floor(width * devicePixelRatio);
      const pixelHeight = Math.floor(height * devicePixelRatio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
    }
  }

  private fitToView(): void {
    this.resizeCanvases();
    this.renderer.fit(
      this.runner.elements,
      this.canvas.clientWidth,
      this.canvas.clientHeight
    );
  }

  /**
   * Match the Edit > Center Circuit command: it recentres the existing view
   * without changing the user's zoom. `fitToView()` is reserved for initial
   * loading and viewport resize, where establishing a scale is intentional.
   */
  private centerCircuit(): void {
    this.resizeCanvases();
    const { elements } = this.runner;
    const scale = this.renderer.viewport.scale;
    if (elements.length === 0) {
      this.renderer.viewport.offsetX = this.canvas.clientWidth / 2;
      this.renderer.viewport.offsetY = this.canvas.clientHeight / 2;
      return;
    }
    const xs = elements.flatMap((element) => [element.x, element.x2]);
    const ys = elements.flatMap((element) => [element.y, element.y2]);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    this.renderer.viewport.offsetX = this.canvas.clientWidth / 2 - centerX * scale;
    this.renderer.viewport.offsetY = this.canvas.clientHeight / 2 - centerY * scale;
  }

  private setTool(tool: Tool): void {
    if (tool === "lm317") {
      tool = `subcircuit:${encodeURIComponent("~LM317-v2")}`;
    } else if (tool === "tl431") {
      tool = `subcircuit:${encodeURIComponent("~TL431")}`;
    }
    if (tool === "subcircuit-instance") {
      const preferred = this.lastDrawSubcircuitModel;
      const models = CustomCompositeModel.list();
      const preferredModel = preferred === null
        ? null
        : CustomCompositeModel.get(preferred);
      const name = preferredModel !== null && preferredModel.internal !== true
        ? preferred
        : models[models.length - 1]?.name ?? null;
      if (name === null) {
        this.showError(new Error("当前电路没有可实例化的子电路。"));
        return;
      }
      tool = `subcircuit:${encodeURIComponent(name)}`;
    }
    if (this.editDisabled && tool !== "select") {
      this.notifyEditingDisabled();
      return;
    }
    if (tool.startsWith("subcircuit:")) {
      this.lastDrawSubcircuitModel = decodeURIComponent(
        tool.slice("subcircuit:".length)
      );
      this.refreshDrawSubcircuitMenu();
    }
    this.activeTool = tool;
    this.toolButtons.forEach((button) =>
      button.classList.toggle("active", button.dataset.tool === tool)
    );
    this.canvas.style.cursor = tool === "select" ? "default" : "crosshair";
    const modeLabel =
      this.root.querySelector<HTMLElement>("#tool-mode-label");
    if (modeLabel !== null) {
      modeLabel.textContent =
        tool === "select"
          ? "模式：选择"
          : `模式：${tool.startsWith("subcircuit:")
              ? decodeURIComponent(tool.slice("subcircuit:".length))
              : COMPONENT_BY_ID.get(tool)?.label ?? tool}`;
    }
  }

  /** Keep Edit and Draw availability in sync with the legacy MenuBar. */
  private syncEditMenuState(): void {
    const selected = this.selectedIndices.size > 0;
    const selectedElements = selected
      ? [...this.selectedIndices]
          .map((index) => this.runner.elements[index])
          .filter((element): element is CircuitElm => element !== undefined)
      : this.runner.elements;
    // MouseManager evaluates the complete circuit when nothing is selected.
    const canFlipX = selectedElements.every((element) => element.canFlipX());
    const canFlipY = selectedElements.every((element) => element.canFlipY());
    const canFlipXY = selectedElements.every((element) => element.canFlipXY());
    const setDisabled = (action: string, disabled: boolean) => {
      this.root
        .querySelectorAll<HTMLButtonElement>(`[data-action="${action}"]`)
        .forEach((button) => { button.disabled = disabled; });
    };

    setDisabled("undo", this.historyIndex <= 0);
    setDisabled("redo", this.historyIndex >= this.history.length - 1);
    setDisabled("cut", !selected);
    setDisabled("copy", !selected);
    setDisabled("paste", this.clipboard.length === 0);
    setDisabled("duplicate", !selected);
    setDisabled("delete", !selected);
    setDisabled("select-all", this.runner.elements.length === 0);
    setDisabled("flip-x", !canFlipX);
    setDisabled("flip-y", !canFlipY);
    setDisabled("flip-xy", !canFlipXY);
    // CirSim only enables this legacy Tools command while at least one
    // ordinary wire can actually be replaced.  Routed wires are already in
    // their final form and therefore must not make the command look active.
    setDisabled(
      "convert-wires",
      this.editDisabled ||
        !this.runner.elements.some(
          (element) => element instanceof WireElm && !(element instanceof RoutedWireElm)
        )
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && this.closeMainMenus()) {
      event.preventDefault();
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? this.redo() : this.undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        this.redo();
      } else if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        this.fileInput.click();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        this.downloadCircuit();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        this.handleAction("new");
      } else if (event.key.toLowerCase() === "x") {
        event.preventDefault();
        this.handleAction("cut");
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        this.handleAction("copy");
      } else if (event.key.toLowerCase() === "v") {
        event.preventDefault();
        void this.pasteSelection();
      } else if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        this.handleAction("duplicate");
      } else if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        this.selectAll();
      } else if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        window.print();
      }
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      this.setRunning(!this.running);
    } else if (event.key === "/") {
      event.preventDefault();
      this.handleAction("search-component");
    } else if (event.key === "0") {
      this.zoomTo(1);
    } else if (event.key === "+" || event.key === "=") {
      this.zoomBy(1.25);
    } else if (event.key === "-" || event.key === "_") {
      this.zoomBy(0.8);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      this.deleteSelected();
    } else {
      const tool = this.toolShortcuts[event.key];
      if (tool !== undefined) {
        event.preventDefault();
        this.setTool(tool);
      }
    }
  }

  private showError(error: unknown): void {
    this.errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(error);
  }

  private notifyEditingDisabled(): void {
    this.errorMessage = "Editing disabled. Re-enable it from the Options menu.";
    this.updateStatus();
  }

  private canvasPosition(event: MouseEvent): { x: number; y: number } {
    const rectangle = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rectangle.left,
      y: event.clientY - rectangle.top
    };
  }

  private requireElement<T extends typeof Element>(
    id: string,
    constructor: T
  ): InstanceType<T> {
    const element = this.root.querySelector(`#${id}`);
    if (!(element instanceof constructor)) {
      throw new Error(`Required element #${id} was not found`);
    }
    return element as InstanceType<T>;
  }

  private static readLinkedCircuit(): string | null {
    const marker = "#circuit=";
    if (!window.location.hash.startsWith(marker)) return null;
    try {
      return decodeURIComponent(window.location.hash.slice(marker.length));
    } catch {
      return null;
    }
  }

  private static componentMenu(): string {
    const unavailableLegacyComposite = new Set<string>(
      DRAW_UNAVAILABLE_LEGACY_ITEM_IDS.filter(
        (id) => id !== "subcircuit-instance"
      )
    );
    const toolButton = (item: DrawMenuItem) =>
      `<button data-tool="${item.id}"${unavailableLegacyComposite.has(item.id)
        ? ' disabled title="原版内置复合模型尚未完成 XML 迁移"'
        : item.id === "subcircuit-instance"
          ? ' disabled title="当前电路没有可实例化的子电路"'
        : ""}><span>${item.label}</span>` +
      `${item.shortcut ? `<kbd>${item.shortcut}</kbd>` : ""}</button>`;
    const group = (
      label: string,
      buttons: string,
      extraClass = ""
    ) =>
      `<div class="component-submenu ${extraClass}">` +
      `<div class="component-submenu-label">${label}</div>` +
      `<div class="submenu-panel">${buttons}</div></div>`;
    const direct = DRAW_MENU_DIRECT_ITEMS.map(toolButton).join("");
    const groups = DRAW_MENU_GROUPS.map((menuGroup) =>
      group(menuGroup.label, menuGroup.items.map(toolButton).join(""))
    ).join("");
    const drag = group(
      "拖动",
      DRAW_DRAG_ITEMS.map(
        (item) =>
          `<button data-action="${item.action}"><span>${item.label}</span>` +
          `${item.shortcut ? `<kbd>${item.shortcut}</kbd>` : ""}</button>`
      ).join(""),
      "drag-submenu"
    );
    const subcircuits = group(
      "子电路",
      '<div id="draw-subcircuit-items" class="draw-subcircuit-items"></div>'
    );
    const extensions = group(
      "TypeScript 扩展",
      DRAW_EXTENSION_ITEMS.map(toolButton).join(""),
      "draw-extension-submenu"
    );
    return (
      direct +
      "<hr>" +
      groups +
      subcircuits +
      drag +
      "<hr>" +
      '<button class="select-drag-item" data-tool="select">' +
      "<span>选择/框选（空格或Shift-拖动）</span></button>" +
      extensions
    );
  }

  private static circuitExamplesMenu(): string {
    const root: CircuitMenuGroup = {
      label: "",
      entries: [],
      groups: new Map()
    };

    for (const example of circuitMenuEntries) {
      let current = root;
      for (const label of example.categoryPath) {
        let group = current.groups.get(label);
        if (group === undefined) {
          group = {
            label,
            entries: [],
            groups: new Map()
          };
          current.groups.set(label, group);
          current.entries.push({ kind: "group", group });
        }
        current = group;
      }
      current.entries.push({ kind: "example", example });
    }

    const renderEntries = (entries: CircuitMenuEntry[]): string =>
      entries
        .map((entry) => {
          if (entry.kind === "example") {
            return (
              `<button data-example="${entry.example.id}">` +
              `${entry.example.name}</button>`
            );
          }
          return (
            '<div class="component-submenu circuit-submenu">' +
            `<div class="component-submenu-label">${entry.group.label}</div>` +
            `<div class="submenu-panel">${renderEntries(entry.group.entries)}</div>` +
            "</div>"
          );
        })
        .join("");

    return renderEntries(root.entries);
  }

  private static toolbarIcon(name: string): string {
    // These glyphs are the exact Fontello glyphs used by legacy Toolbar.java.
    // The font is bundled with the native TypeScript app from src/assets.
    // using it avoids a visually-similar but different hand-drawn replacement.
    const legacyFontello: Record<string, string> = {
      undo: "ccw",
      redo: "cw",
      cut: "scissors",
      copy: "copy",
      paste: "paste",
      duplicate: "clone",
      search: "search",
      zoom100: "zoom-11",
      zoomIn: "zoom-in",
      zoomOut: "zoom-out"
    };
    const fontelloIcon = legacyFontello[name];
    if (fontelloIcon !== undefined) {
      return `<span class="legacy-toolbar-icon cirjsicon-${fontelloIcon}" aria-hidden="true"></span>`;
    }
    const icons: Record<string, string> = {
      undo: '<path d="M9 6H4v-5M4 6l5-5"/><path d="M4 6h9a7 7 0 1 1-6.2 10.2"/>',
      redo: '<path d="M15 6h5v-5m0 5-5-5"/><path d="M20 6h-9a7 7 0 1 0 6.2 10.2"/>',
      cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.5 7.5 11 7M8.5 16.5l11-7"/>',
      copy: '<rect x="8" y="7" width="11" height="13" rx="1"/><path d="M16 7V4H5v13h3"/>',
      paste: '<path d="M9 5h6v3H9z"/><path d="M8 6H5v15h14V6h-3"/>',
      duplicate: '<rect x="7" y="7" width="12" height="12"/><path d="M16 7V4H4v12h3"/>',
      search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
      zoom100: '<circle cx="10" cy="10" r="7"/><path d="m15.5 15.5 5 5"/><text x="10" y="12.5" text-anchor="middle">1:1</text>',
      zoomIn: '<circle cx="10" cy="10" r="7"/><path d="m15.5 15.5 5 5M7 10h6M10 7v6"/>',
      zoomOut: '<circle cx="10" cy="10" r="7"/><path d="m15.5 15.5 5 5M7 10h6"/>',
      wire: '<path d="M3 17 21 7"/><circle cx="3" cy="17" r="1.8" class="fill"/><circle cx="21" cy="7" r="1.8" class="fill"/>',
      resistor: '<path d="M1 12h4M19 12h4"/><rect x="5" y="7" width="14" height="10"/>',
      resistorUs: '<path d="M1 12h3l2-4 3 8 3-8 3 8 3-8 2 4h3"/>',
      ground: '<path d="M12 3v11M5 14h14M8 18h8M10 22h4"/>',
      capacitor: '<path d="M2 12h7M9 5v14M15 5v14M15 12h7"/>',
      inductor: '<path d="M1 12h3c0-5 5-5 5 0s5 5 5 0 5-5 5 0h4"/>',
      diode: '<path d="M2 12h5m10 0h5M7 6v12l10-6zM17 6v12"/>',
      voltage: '<path d="M12 2v6M7 8h10M9 12h6M12 12v10"/>',
      ac: '<path d="M12 2v4m0 12v4"/><circle cx="12" cy="12" r="6"/><path d="M8 12c2-4 3 4 5 0s3 4 4 0"/>',
      rail: '<path d="M12 20V9"/><text x="12" y="6" text-anchor="middle">+5V</text>',
      switch: '<path d="M2 15h5m10 0h5M7 15l10-7"/><circle cx="7" cy="15" r="1.5" class="fill"/><circle cx="17" cy="15" r="1.5" class="fill"/>',
      spdt: '<path d="M2 12h5m10-6h5m-5 12h5M7 12l10-6"/><circle cx="7" cy="12" r="1.4" class="fill"/>',
      analogSwitch: '<path d="M2 12h5m10 0h5M7 12l10-6M12 21v-6"/>',
      analogSpdt: '<path d="M1 9h5m11-5h6m-6 10h6M6 9l11-5M12 22v-8"/>',
      opamp: '<path d="M3 4v16l16-8zM19 12h3"/><text x="7" y="9">−</text><text x="7" y="18">+</text>',
      opampSwap: '<path d="M3 4v16l16-8zM19 12h3"/><text x="7" y="9">+</text><text x="7" y="18">−</text>',
      npn: '<path d="M3 12h7m0-7v14m0-10 9-5m-9 11 9 5m-3-5 3 5-5-1"/>',
      pnp: '<path d="M3 12h7m0-7v14m0-10 9-5m-9 11 9 5m-7-12-3 1 2 3"/>',
      nmos: '<path d="M3 12h5M9 5v14m4-11v8m0-7h7V3m-7 12h7v6m-7-9h7"/><path d="m15 12 3-2v4z"/>',
      pmos: '<path d="M3 12h5M9 5v14m4-11v8m0-7h7V3m-7 12h7v6m-7-9h7"/><path d="m18 12-3-2v4z"/>',
      inverter: '<path d="M2 5v14l15-7zM20 12h2"/><circle cx="18.5" cy="12" r="1.7"/>',
      and: '<path d="M3 4v16h7a8 8 0 0 0 0-16zM0 8h3M0 16h3m15-4h5"/>',
      nand: '<path d="M3 4v16h7a8 8 0 0 0 0-16zM0 8h3M0 16h3m18-4h2"/><circle cx="19.5" cy="12" r="1.7"/>',
      or: '<path d="M3 4c4 5 4 11 0 16h6c6 0 10-4 12-8-2-4-6-8-12-8zM0 8h5M0 16h5m16-4h3"/>',
      nor: '<path d="M3 4c4 5 4 11 0 16h6c6 0 10-4 12-8-2-4-6-8-12-8zM0 8h5M0 16h5m19-4h1"/><circle cx="22.5" cy="12" r="1.5"/>',
      xor: '<path d="M3 4c4 5 4 11 0 16M0 4c4 5 4 11 0 16m3-16h6c6 0 10 4 12 8-2 4-6 8-12 8H3M0 8h5M0 16h5m16-4h3"/>'
    };
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      (icons[name] ?? "") +
      "</svg>"
    );
  }

  private static toolbar(): string {
    const action = (name: string, title: string, icon: string) =>
      `<button class="tool-button" data-action="${name}" title="${title}">` +
      `${NativeCircuitApp.toolbarIcon(icon)}</button>`;
    const tool = (id: string, title: string, icon: string) =>
      `<button class="tool-button" data-tool="${id}" title="${title}">` +
      `${NativeCircuitApp.toolbarIcon(icon)}</button>`;
    const variants = (
      id: string,
      title: string,
      icon: string,
      choices: Array<[string, string, string]>
    ) =>
      `<div class="tool-variant">` +
      tool(id, title, icon) +
      `<div class="tool-palette">` +
      choices
        .map(([choiceId, choiceTitle, choiceIcon]) =>
          tool(choiceId, choiceTitle, choiceIcon)
        )
        .join("") +
      `</div></div>`;
    return [
      action("undo", "撤销", "undo"),
      action("redo", "重做", "redo"),
      action("cut", "剪切", "cut"),
      action("copy", "复制", "copy"),
      action("paste", "粘贴", "paste"),
      action("duplicate", "复制一份", "duplicate"),
      action("search-component", "查找元件", "search"),
      action("zoom-100", "缩放 100%", "zoom100"),
      action("zoom-in", "放大", "zoomIn"),
      action("zoom-out", "缩小", "zoomOut"),
      tool("wire", "导线", "wire"),
      tool("resistor", "电阻", "resistor"),
      tool("ground", "接地", "ground"),
      tool("capacitor", "电容", "capacitor"),
      tool("inductor", "电感", "inductor"),
      tool("diode", "二极管", "diode"),
      variants("voltage", "直流电压源", "voltage", [
        ["voltage", "直流电压源", "voltage"],
        ["ac-voltage", "交流电压源", "ac"]
      ]),
      tool("rail", "电源轨", "rail"),
      variants("switch", "开关", "switch", [
        ["switch", "开关", "switch"],
        ["switch-spdt", "单刀双掷开关", "spdt"],
        ["analog-switch", "模拟开关", "analogSwitch"],
        ["analog-switch-spdt", "模拟单刀双掷开关", "analogSpdt"]
      ]),
      variants("opamp", "运算放大器", "opamp", [
        ["opamp", "运算放大器（负端在上）", "opamp"],
        ["opamp-swap", "运算放大器（正端在上）", "opampSwap"]
      ]),
      variants("npn", "NPN 晶体管", "npn", [
        ["npn", "NPN 晶体管", "npn"],
        ["pnp", "PNP 晶体管", "pnp"]
      ]),
      variants("nmos", "N 沟道 MOSFET", "nmos", [
        ["nmos", "N 沟道 MOSFET", "nmos"],
        ["pmos", "P 沟道 MOSFET", "pmos"]
      ]),
      tool("inverter", "非门", "inverter"),
      variants("and-gate", "与门", "and", [
        ["and-gate", "与门", "and"],
        ["nand-gate", "与非门", "nand"],
        ["or-gate", "或门", "or"],
        ["nor-gate", "或非门", "nor"],
        ["xor-gate", "异或门", "xor"]
      ]),
      '<span id="tool-mode-label" class="tool-mode-label">模式：选择</span>'
    ].join("");
  }

  private static template(): string {
    return `
      <main class="native-app">
        <nav class="menu-bar" aria-label="主菜单">
          <details><summary>文件</summary><div class="menu-popup">
            <button data-action="new">新建空白电路 <kbd>Ctrl+N</kbd></button>
            <button data-action="open">打开文件… <kbd>Ctrl+O</kbd></button>
            <button data-action="import-text">从文本导入…</button>
            <button data-action="import-dropbox">从 Dropbox 导入…</button>
            <hr>
            <button data-action="save">另存为文件… <kbd>Ctrl+S</kbd></button>
            <button data-action="export-link">导出为链接…</button>
            <button data-action="export-text">导出为文本…</button>
            <button data-action="export-image">导出为图片…</button>
            <button data-action="copy-image">复制电路图片</button>
            <button data-action="export-svg">导出为 SVG…</button>
            <button data-action="create-subcircuit">创建子电路…</button>
            <hr>
            <button data-action="dc-analysis">查找直流工作点</button>
            <button data-action="recover">恢复自动保存</button>
            <button data-action="print">打印… <kbd>Ctrl+P</kbd></button>
            <button data-action="fullscreen">切换全屏</button>
            <hr>
            <button data-action="about">关于…</button>
          </div></details>
          <details data-menu="edit"><summary>编辑</summary><div class="menu-popup">
            <button data-action="undo">撤销 <kbd>Ctrl+Z</kbd></button>
            <button data-action="redo">重做 <kbd>Ctrl+Y</kbd></button>
            <hr>
            <button data-action="cut">剪切 <kbd>Ctrl+X</kbd></button>
            <button data-action="copy">复制 <kbd>Ctrl+C</kbd></button>
            <button data-action="paste">粘贴 <kbd>Ctrl+V</kbd></button>
            <button data-action="duplicate">复制一份 <kbd>Ctrl+D</kbd></button>
            <hr>
            <button data-action="select-all">全选 <kbd>Ctrl+A</kbd></button>
            <hr>
            <button data-action="search-component">查找元件… <kbd>/</kbd></button>
            <button data-action="fit">居中电路</button>
            <button data-action="zoom-100">缩放 100% <kbd>0</kbd></button>
            <button data-action="zoom-in">放大 <kbd>+</kbd></button>
            <button data-action="zoom-out">缩小 <kbd>-</kbd></button>
            <button data-action="flip-x">水平翻转</button>
            <button data-action="flip-y">垂直翻转</button>
            <button data-action="flip-xy">水平与垂直翻转</button>
            <details class="edit-extension-menu"><summary>扩展功能 ›</summary>
              <div class="edit-extension-popup">
                <button data-action="delete">删除 <kbd>Delete</kbd></button>
              </div>
            </details>
          </div></details>
          <details data-menu="draw"><summary>绘制</summary><div class="menu-popup component-menu">
            ${NativeCircuitApp.componentMenu()}
          </div></details>
          <details><summary>示波器</summary><div class="menu-popup scope-menu">
            <button data-action="scope-stack">全部堆叠</button>
            <button data-action="scope-unstack">全部分栏</button>
            <button data-action="scope-combine">合并曲线</button>
            <button data-action="scope-separate">分离曲线</button>
            <details class="scope-extension-menu"><summary>扩展功能 ›</summary>
              <div class="scope-extension-popup">
                <button data-action="scope-reset">清除波形</button>
                <button data-action="scope-export-csv">导出 CSV…</button>
              </div>
            </details>
          </div></details>
          <details><summary>选项</summary><div class="menu-popup option-menu">
            <button data-action="toggle-current">显示电流</button>
            <button data-action="toggle-voltage">显示电压</button>
            <button data-action="toggle-power">显示功率</button>
            <button data-action="toggle-values">显示数值</button>
            <button data-action="toggle-small-grid">小网格</button>
            <button data-action="toggle-toolbar">工具栏</button>
            <button data-action="toggle-crosshair">显示光标十字线</button>
            <button data-action="toggle-euro-resistor">欧洲电阻符号</button>
            <button data-action="toggle-iec-gates">IEC 逻辑门</button>
            <button data-action="toggle-white-background">白色背景</button>
            <button data-action="toggle-current-convention">常规电流运动</button>
            <button data-action="toggle-disable-editing">禁用编辑</button>
            <button data-action="toggle-wheel-edit">使用鼠标滚轮编辑数值</button>
            <button data-action="shortcuts">快捷键...</button>
            <button data-action="other-options">其他选项...</button>
          </div></details>
          <details data-menu="tools"><summary>工具</summary><div class="menu-popup">
            <button data-action="convert-wires">将导线转换为布线导线</button>
            <button data-action="subcircuits">子电路管理器...</button>
          </div></details>
          <details><summary>电路</summary><div class="menu-popup component-menu example-menu">
            ${NativeCircuitApp.circuitExamplesMenu()}
          </div></details>
        </nav>

        <button class="sidebar-toggle" data-action="toggle-sidebar"
          type="button" title="显示或隐藏侧栏" aria-label="显示或隐藏侧栏">☰</button>
        <section class="simulation-layout">
          <div class="workspace-column">
            <div class="tool-bar" aria-label="工具栏">
              ${NativeCircuitApp.toolbar()}
            </div>
            <div class="canvas-column">
              <div class="canvas-wrap">
                <canvas id="circuit-canvas" aria-label="电路画布"></canvas>
                <div id="native-status" class="native-status"></div>
              </div>
              <canvas id="scope-canvas" class="scope-canvas" aria-label="示波器"></canvas>
            </div>
          </div>

          <aside class="control-panel">
            <div class="run-row">
              <button data-action="reset" class="topButton">重置</button>
              <button id="run-toggle" data-action="run" class="topButton"><strong>运行</strong>&nbsp;/&nbsp;停止</button>
            </div>
            <label>仿真速度
              <input data-control="simulation-speed" type="range" min="0" max="84" value="55">
            </label>
            <label>电流动画
              <input data-control="current-speed" type="range" min="1" max="100" value="50">
            </label>
            <div class="panel-rule"></div>
            <h2 id="selected-title">未选择元件</h2>
            <p id="selected-details">单击元件可查看</p>
            <div id="element-properties"></div>
            <label>电阻 <output data-parameter-value="resistance"></output>
              <input data-parameter="resistance" type="range" min="0" max="7" step="0.01" value="3">
            </label>
            <label>电容 <output data-parameter-value="capacitance"></output>
              <input data-parameter="capacitance" type="range" min="-12" max="-2" step="0.01" value="-6">
            </label>
            <label>电感 <output data-parameter-value="inductance"></output>
              <input data-parameter="inductance" type="range" min="-6" max="3" step="0.01" value="-2">
            </label>
            <div class="native-note">
              纯 TypeScript 求解器<br>
              拖动画线或移动元件，滚轮缩放<br>
              右键或 Alt 拖动画布
            </div>
          </aside>
        </section>
      </main>

      <div id="element-context-menu" class="context-menu" hidden>
        <button data-action="edit-selected">编辑属性…</button>
        <button data-action="scope-selected">在示波器中查看</button>
        <hr>
        <button data-action="cut">剪切</button>
        <button data-action="copy">复制</button>
        <button data-action="duplicate">复制一份</button>
        <button data-action="delete">删除</button>
        <hr>
        <button data-action="swap-terminals">交换端点</button>
        <button data-action="flip-x">水平翻转</button>
        <button data-action="flip-y">垂直翻转</button>
        <button data-action="split-wire">拆分导线</button>
      </div>

      <dialog id="element-edit-dialog"
        class="settings-dialog element-edit-dialog">
        <form id="element-edit-form" class="settings-dialog-body">
          <header>
            <div>
              <h2 id="element-edit-title">编辑属性</h2>
              <p id="element-edit-subtitle"></p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <div id="element-edit-fields" class="element-edit-fields"></div>
          <p id="element-edit-error" class="dialog-error" role="alert"></p>
          <footer>
            <span class="footer-spacer"></span>
            <button type="button" data-dialog-close>取消</button>
            <button type="submit" class="primary">确定</button>
          </footer>
        </form>
      </dialog>

      <input id="circuit-file" type="file" accept=".txt,.circuit,text/plain" hidden>
      <dialog id="circuit-text-dialog">
        <form method="dialog" class="text-dialog">
          <header><h2 id="dialog-title"></h2></header>
          <textarea id="circuit-text" spellcheck="false"></textarea>
          <footer>
            <button type="button" data-dialog-close>取消</button>
            <button type="button" id="dialog-apply" class="primary">载入</button>
          </footer>
        </form>
      </dialog>
      <dialog id="example-dialog" class="example-dialog">
        <div class="example-dialog-body">
          <header>
            <div>
              <h2>内置电路示例</h2>
              <p>${circuitExamples.length} 个示例全部由 TypeScript 解析和仿真</p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <input id="example-search" type="search" placeholder="搜索名称或文件名…" autocomplete="off">
          <div id="example-list" class="example-list"></div>
        </div>
      </dialog>
      <dialog id="component-search-dialog" class="example-dialog">
        <div class="example-dialog-body">
          <header>
            <div>
              <h2>查找元件</h2>
              <p>搜索后单击元件，即可进入绘制模式</p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <input id="component-search" type="search" placeholder="搜索名称、类别或类型…" autocomplete="off">
          <div id="component-list" class="example-list"></div>
        </div>
      </dialog>
      <dialog id="shortcut-dialog" class="settings-dialog">
        <div class="settings-dialog-body shortcut-dialog-body">
          <header>
            <div>
              <h2>编辑快捷键</h2>
              <p>每个绘制命令可指定一个区分大小写的字符。</p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <div class="settings-scroll">
            <table class="shortcut-table">
              <thead><tr><th>命令</th><th>快捷键</th></tr></thead>
              <tbody id="shortcut-table-body"></tbody>
            </table>
          </div>
          <p id="shortcut-error" class="dialog-error" role="alert"></p>
          <footer>
            <button type="button" id="shortcut-reset">恢复默认</button>
            <span class="footer-spacer"></span>
            <button type="button" data-dialog-close>取消</button>
            <button type="button" id="shortcut-apply" class="primary">确定</button>
          </footer>
        </div>
      </dialog>
      <dialog id="subcircuit-dialog" class="settings-dialog">
        <div class="settings-dialog-body">
          <header>
            <div>
              <h2>Subcircuit Manager</h2>
              <p>管理当前电路中随文件载入的自定义子电路定义。</p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <select id="subcircuit-list" class="subcircuit-list" size="8"
            aria-label="子电路列表"></select>
          <p id="subcircuit-empty">当前电路没有自定义子电路。</p>
          <footer>
            <button type="button" id="subcircuit-delete" class="danger">删除</button>
            <span class="footer-spacer"></span>
            <button type="button" data-dialog-close>完成</button>
          </footer>
        </div>
      </dialog>
      <dialog id="subcircuit-create-dialog" class="settings-dialog">
        <form method="dialog" class="settings-dialog-body">
          <header>
            <div>
              <h2>创建子电路</h2>
              <p id="subcircuit-create-description"></p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <label>子电路名称
            <input id="subcircuit-name" type="text" required autocomplete="off">
          </label>
          <p>外部引脚来自“标注节点”元件；每个标注节点必须连接到电路。</p>
          <p id="subcircuit-create-error" class="dialog-error" role="alert"></p>
          <footer>
            <button type="button" data-dialog-close>取消</button>
            <button type="button" id="subcircuit-create" class="primary">创建</button>
          </footer>
        </form>
      </dialog>
      <dialog id="options-dialog" class="settings-dialog">
        <form id="options-form" class="settings-dialog-body">
          <header>
            <div>
              <h2>其他选项</h2>
              <p>仿真精度、数值显示、颜色和输入行为。</p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <div class="settings-grid settings-scroll">
            <fieldset>
              <legend>仿真</legend>
              <label>最大时间步长 (s)
                <input id="option-max-time-step" type="number" min="1e-15"
                  step="any" required>
              </label>
              <label>最小时间步长 (s)
                <input id="option-min-time-step" type="number" min="1e-15"
                  step="any" required>
              </label>
              <label>矩阵求解器
                <select id="option-solver">
                  <option value="0">自动</option>
                  <option value="1">稠密 LU</option>
                  <option value="2">稀疏 CSC LU</option>
                </select>
              </label>
              <label class="check-row">
                <input id="option-adjust-time-step" type="checkbox">
                自动调整时间步长
              </label>
              <label class="check-row">
                <input id="option-auto-dc" type="checkbox">
                重置时自动求直流工作点
              </label>
            </fieldset>
            <fieldset>
              <legend>显示与输入</legend>
              <label>电压颜色范围 (V)
                <input id="option-voltage-range" type="number" min="1e-12"
                  step="any" required>
              </label>
              <label>短格式小数位
                <input id="option-short-digits" type="number" min="0" max="12"
                  step="1" required>
              </label>
              <label>长格式小数位
                <input id="option-long-digits" type="number" min="0" max="16"
                  step="1" required>
              </label>
              <label>最低目标帧率
                <input id="option-min-frame-rate" type="number" min="1" max="240"
                  step="1" required>
              </label>
              <label>鼠标滚轮灵敏度
                <input id="option-wheel-sensitivity" type="number" min="0.1"
                  max="5" step="0.1" required>
              </label>
            </fieldset>
            <fieldset class="color-settings">
              <legend>颜色</legend>
              <label>正电压 <input id="option-positive-color" type="color"></label>
              <label>负电压 <input id="option-negative-color" type="color"></label>
              <label>中性 <input id="option-neutral-color" type="color"></label>
              <label>选中 <input id="option-selection-color" type="color"></label>
              <label>电流 <input id="option-current-color" type="color"></label>
              <button type="button" id="options-reset-colors">恢复默认颜色</button>
            </fieldset>
          </div>
          <footer>
            <button type="button" id="open-modification-setup">界面扩展设置…</button>
            <span class="footer-spacer"></span>
            <button type="button" data-dialog-close>取消</button>
            <button type="button" id="options-apply" class="primary">应用</button>
          </footer>
        </form>
      </dialog>
      <dialog id="modification-dialog" class="settings-dialog">
        <form id="modification-form" class="settings-dialog-body">
          <header>
            <div>
              <h2>Modification Setup</h2>
              <p>桌面界面布局与运行行为设置。</p>
            </div>
            <button type="button" data-dialog-close aria-label="关闭">×</button>
          </header>
          <div class="settings-grid settings-scroll">
            <fieldset>
              <legend>界面</legend>
              <label>UI 缩放
                <input id="mod-ui-scale" type="range" min="0.5" max="3"
                  step="0.1">
              </label>
              <label>顶部菜单栏
                <select id="mod-menu-size">
                  <option value="standard">标准</option>
                  <option value="small">紧凑</option>
                </select>
              </label>
              <label class="check-row">
                <input id="mod-show-mode" type="checkbox">
                显示工具模式标签
              </label>
            </fieldset>
            <fieldset>
              <legend>运行/重置按钮</legend>
              <label>主题
                <select id="mod-button-theme">
                  <option value="default">默认</option>
                  <option value="classic">经典</option>
                </select>
              </label>
              <label>运行时图标
                <select id="mod-run-icon">
                  <option value="text">文字（暂停/运行）</option>
                  <option value="pause">暂停</option>
                  <option value="stop">停止</option>
                </select>
              </label>
              <label class="check-row">
                <input id="mod-hide-buttons" type="checkbox">
                隐藏运行和重置按钮
              </label>
            </fieldset>
            <fieldset>
              <legend>侧栏</legend>
              <label class="check-row">
                <input id="mod-overlay-sidebar" type="checkbox">
                侧栏覆盖在画布上
              </label>
              <label class="check-row">
                <input id="mod-animate-sidebar" type="checkbox">
                启用侧栏动画
              </label>
              <label>动画时长 (ms)
                <input id="mod-sidebar-duration" type="number" min="0"
                  max="5000" step="10" required>
              </label>
              <label>速度曲线
                <select id="mod-sidebar-curve">
                  <option value="ease">ease</option>
                  <option value="linear">linear</option>
                  <option value="ease-in">ease-in</option>
                  <option value="ease-out">ease-out</option>
                  <option value="ease-in-out">ease-in-out</option>
                </select>
              </label>
              <label class="check-row">
                <input id="mod-show-sidebar" type="checkbox">
                启动时显示侧栏
              </label>
            </fieldset>
            <fieldset>
              <legend>其他</legend>
              <label class="check-row">
                <input id="mod-pause-unfocused" type="checkbox">
                窗口失去焦点时暂停仿真
              </label>
            </fieldset>
          </div>
          <footer>
            <span class="footer-spacer"></span>
            <button type="button" data-dialog-close>取消</button>
            <button type="button" id="modification-apply" class="primary">应用</button>
          </footer>
        </form>
      </dialog>
    `;
  }
}
