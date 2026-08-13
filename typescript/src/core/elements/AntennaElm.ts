import { StringTokenizer } from "../StringTokenizer";
import { CircuitElm } from "../CircuitElm";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

export class AntennaElm extends RailElm {
  public fmphase = 0;

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
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      y2 === undefined ? x : x2,
      y2 ?? y,
      flags,
      tokenizer ??
        new StringTokenizer(
          `${VoltageElm.WF_AC} 60 5 0 0 0.5`
        )
    );
    this.waveform = VoltageElm.WF_AC;
  }

  public override getDumpType(): number {
    return "A".charCodeAt(0);
  }

  public override getVoltage(): number {
    const time = this.simulationTime();
    const fm = 3 * Math.sin(this.fmphase);
    return (
      Math.sin(2 * Math.PI * time * 3000) *
        (1.3 + Math.sin(2 * Math.PI * time * 12)) *
        3 +
      Math.sin(2 * Math.PI * time * 2710) *
        (1.3 + Math.sin(2 * Math.PI * time * 13)) *
        3 +
      Math.sin(2 * Math.PI * time * 2433) *
        (1.3 + Math.sin(2 * Math.PI * time * 14)) *
        3 +
      fm
    );
  }

  public override stepFinished(): void {
    const time = this.simulationTime();
    this.fmphase +=
      2 *
      Math.PI *
      (2200 + Math.sin(2 * Math.PI * time * 13) * 100) *
      this.simulationStep();
  }

  private simulationTime(): number {
    return CircuitElm.sim.t;
  }

  private simulationStep(): number {
    return CircuitElm.sim.timeStep;
  }
}
