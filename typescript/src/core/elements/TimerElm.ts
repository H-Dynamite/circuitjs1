import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Analog behavioral model of the 555 timer. */
export class TimerElm extends ChipElm {
  public static readonly FLAG_RESET = 2;
  public static readonly FLAG_GROUND = 4;
  public static readonly FLAG_NUMBERS = 8;
  public static readonly N_DIS = 0;
  public static readonly N_TRIG = 1;
  public static readonly N_THRES = 2;
  public static readonly N_VCC = 3;
  public static readonly N_CTL = 4;
  public static readonly N_OUT = 5;
  public static readonly N_RST = 6;
  public static readonly N_GND = 7;

  public ground: CircuitNode = CircuitNode.ground;
  public out = false;
  public triggerSuppressed = false;

  public constructor(x: number, y: number);
  public constructor(
    x: number,
    y: number,
    x2: number,
    y2: number,
    flags: number,
    tokenizer: StringTokenizer
  );
  public constructor(
    x: number,
    y: number,
    x2 = x,
    y2 = y,
    flags = TimerElm.FLAG_RESET | TimerElm.FLAG_GROUND,
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("")
    );
  }

  public override getDefaultFlags(): number {
    return TimerElm.FLAG_RESET | TimerElm.FLAG_GROUND;
  }

  public hasGroundPin(): boolean {
    return this.hasFlag(TimerElm.FLAG_GROUND);
  }

  public hasReset(): boolean {
    return this.hasFlag(TimerElm.FLAG_RESET) || this.hasGroundPin();
  }

  public usePinNames(): boolean {
    return !this.hasFlag(TimerElm.FLAG_NUMBERS);
  }

  public override setupPins(): void {
    this.sizeX = 3;
    this.sizeY = 5;
    const name = (pinName: string, number: string) =>
      this.usePinNames() ? pinName : number;
    this.pins = Array<ChipPin>(8);
    this.pins[TimerElm.N_DIS] = new ChipPin(
      1,
      ChipElm.SIDE_W,
      name("dis", "7")
    );
    this.pins[TimerElm.N_TRIG] = new ChipPin(
      3,
      ChipElm.SIDE_W,
      name("tr", "2")
    );
    this.pins[TimerElm.N_TRIG].lineOver = this.usePinNames();
    this.pins[TimerElm.N_THRES] = new ChipPin(
      4,
      ChipElm.SIDE_W,
      name("th", "6")
    );
    this.pins[TimerElm.N_VCC] = new ChipPin(
      1,
      ChipElm.SIDE_N,
      name("Vcc", "8")
    );
    this.pins[TimerElm.N_CTL] = new ChipPin(
      1,
      ChipElm.SIDE_S,
      name("ctl", "5")
    );
    this.pins[TimerElm.N_OUT] = new ChipPin(
      2,
      ChipElm.SIDE_E,
      name("out", "3")
    );
    this.pins[TimerElm.N_OUT].state = true;
    this.pins[TimerElm.N_RST] = new ChipPin(
      1,
      ChipElm.SIDE_E,
      name("rst", "4")
    );
    this.pins[TimerElm.N_RST].lineOver = this.usePinNames();
    this.pins[TimerElm.N_GND] = new ChipPin(
      2,
      ChipElm.SIDE_S,
      name("gnd", "1")
    );
  }

  public override getPostCount(): number {
    return this.hasGroundPin() ? 8 : this.hasReset() ? 7 : 6;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 165;
  }

  public override getChipName(): string {
    return "555 Timer";
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    this.ground = this.hasGroundPin()
      ? this.nodes[TimerElm.N_GND]
      : CircuitNode.ground;
    CircuitElm.sim.stampResistor(
      this.nodes[TimerElm.N_VCC],
      this.nodes[TimerElm.N_CTL],
      5000
    );
    CircuitElm.sim.stampResistor(
      this.nodes[TimerElm.N_CTL],
      this.ground,
      10000
    );
    CircuitElm.sim.stampNonLinear(this.nodes[TimerElm.N_DIS]);
    CircuitElm.sim.stampNonLinear(this.nodes[TimerElm.N_OUT]);
    CircuitElm.sim.stampNonLinear(this.nodes[TimerElm.N_VCC]);
    if (this.hasGroundPin()) {
      CircuitElm.sim.stampNonLinear(this.nodes[TimerElm.N_GND]);
    }
  }

  public override startIteration(): void {
    const groundVoltage = this.hasGroundPin()
      ? this.volts[TimerElm.N_GND]
      : 0;
    this.out =
      this.volts[TimerElm.N_OUT] >
      (this.volts[TimerElm.N_VCC] + groundVoltage) / 2;
    if (this.volts[TimerElm.N_THRES] > this.volts[TimerElm.N_CTL]) {
      this.out = false;
    }
    const triggered =
      (this.volts[TimerElm.N_CTL] + groundVoltage) / 2 >
      this.volts[TimerElm.N_TRIG];
    if (triggered || this.triggerSuppressed) {
      this.out = true;
    }
    if (
      this.hasReset() &&
      this.volts[TimerElm.N_RST] < 0.7 + groundVoltage
    ) {
      this.out = false;
      this.triggerSuppressed = triggered;
    } else {
      this.triggerSuppressed = false;
    }
  }

  public override doStep(): void {
    if (!this.out) {
      CircuitElm.sim.stampResistor(
        this.nodes[TimerElm.N_DIS],
        this.ground,
        10
      );
    }
    CircuitElm.sim.stampResistor(
      this.out ? this.nodes[TimerElm.N_VCC] : this.ground,
      this.nodes[TimerElm.N_OUT],
      1
    );
  }

  public override calculateCurrent(): void {
    const groundVoltage = this.hasGroundPin()
      ? this.volts[TimerElm.N_GND]
      : 0;
    const vccCurrent =
      (this.volts[TimerElm.N_CTL] - this.volts[TimerElm.N_VCC]) /
      5000;
    this.pins[TimerElm.N_VCC].current = vccCurrent;
    this.pins[TimerElm.N_CTL].current =
      -(this.volts[TimerElm.N_CTL] - groundVoltage) / 10000 -
      vccCurrent;
    this.pins[TimerElm.N_DIS].current = this.out
      ? 0
      : -(this.volts[TimerElm.N_DIS] - groundVoltage) / 10;
    this.pins[TimerElm.N_OUT].current = -(
      this.volts[TimerElm.N_OUT] -
      (this.out ? this.volts[TimerElm.N_VCC] : groundVoltage)
    );
    if (this.out) {
      this.pins[TimerElm.N_VCC].current -=
        this.pins[TimerElm.N_OUT].current;
    }
    if (this.hasGroundPin()) {
      this.pins[TimerElm.N_GND].current =
        (this.volts[TimerElm.N_CTL] - groundVoltage) / 10000;
      if (!this.out) {
        this.pins[TimerElm.N_GND].current +=
          (this.volts[TimerElm.N_DIS] - groundVoltage) / 10 +
          (this.volts[TimerElm.N_OUT] - groundVoltage);
      }
    }
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }
}
