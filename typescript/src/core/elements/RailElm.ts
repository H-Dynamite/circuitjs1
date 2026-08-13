import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { VoltageElm } from "./VoltageElm";

/** One-terminal voltage-source behavior ported from RailElm.java. */
export class RailElm extends VoltageElm {
  public static readonly FLAG_CLOCK = 1;

  public constructor(x: number, y: number, waveform?: number);
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
    x2OrWaveform = VoltageElm.WF_DC,
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    if (y2 === undefined) {
      super(x, y, x2OrWaveform);
    } else {
      super(
        x,
        y,
        x2OrWaveform,
        y2,
        flags,
        tokenizer ?? new StringTokenizer("")
      );
    }
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "R".charCodeAt(0);
  }

  public override getPostCount(): number {
    return 1;
  }

  public override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 17 / this.dn
    );
  }

  public getRailText(): string | null {
    return null;
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(CircuitNode.ground, this.nodes[0]);
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override stamp(): void {
    const source = this.getVoltageSource();
    if (source === null) {
      throw new Error("Rail voltage source has not been assigned");
    }
    if (this.waveform === VoltageElm.WF_DC) {
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[0],
        source,
        this.getVoltage()
      );
    } else {
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[0],
        source
      );
    }
  }

  public override doStep(): void {
    if (this.waveform !== VoltageElm.WF_DC) {
      const source = this.getVoltageSource();
      if (source === null) {
        throw new Error("Rail voltage source has not been assigned");
      }
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[0],
        source,
        this.getVoltage()
      );
    }
  }

  public override hasGroundConnection(_node: number): boolean {
    return true;
  }
}
