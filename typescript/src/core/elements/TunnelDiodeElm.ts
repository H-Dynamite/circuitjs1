import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";

/** Esaki tunnel diode with negative differential-resistance region. */
export class TunnelDiodeElm extends CircuitElm {
  public static readonly peakVoltage = 0.1;
  public static readonly peakCurrent = 4.7e-3;
  public static readonly valleyVoltage = 0.37;
  public static readonly thermalVoltage = 0.026;
  public static readonly projectedPeakVoltage = 0.525;
  public static readonly valleyCurrent = 370e-6;
  public lastVoltageDifference = 0;

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
    flags = 0,
    _tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
  }

  public override getDumpType(): number {
    return 175;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(16);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override reset(): void {
    super.reset();
    this.lastVoltageDifference = 0;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
  }

  private limitStep(voltage: number): number {
    return Math.max(
      this.lastVoltageDifference - 1,
      Math.min(this.lastVoltageDifference + 1, voltage)
    );
  }

  private currentAt(voltage: number): number {
    const peakFactor =
      TunnelDiodeElm.peakCurrent *
      Math.exp(
        -TunnelDiodeElm.projectedPeakVoltage /
          TunnelDiodeElm.thermalVoltage
      );
    const zeroOffset =
      TunnelDiodeElm.valleyCurrent *
      Math.exp(-TunnelDiodeElm.valleyVoltage);
    return (
      peakFactor *
        (Math.exp(voltage / TunnelDiodeElm.thermalVoltage) - 1) +
      TunnelDiodeElm.peakCurrent *
        (voltage / TunnelDiodeElm.peakVoltage) *
        Math.exp(1 - voltage / TunnelDiodeElm.peakVoltage) +
      TunnelDiodeElm.valleyCurrent *
        Math.exp(voltage - TunnelDiodeElm.valleyVoltage) -
      zeroOffset
    );
  }

  public override doStep(): void {
    let voltage = this.volts[0] - this.volts[1];
    if (Math.abs(voltage - this.lastVoltageDifference) > 0.01) {
      CircuitElm.sim.converged = false;
    }
    voltage = this.limitStep(voltage);
    this.lastVoltageDifference = voltage;
    const peakFactor =
      TunnelDiodeElm.peakCurrent *
      Math.exp(
        -TunnelDiodeElm.projectedPeakVoltage /
          TunnelDiodeElm.thermalVoltage
      );
    const exponential = Math.exp(
      1 - voltage / TunnelDiodeElm.peakVoltage
    );
    const conductance =
      (peakFactor *
        Math.exp(voltage / TunnelDiodeElm.thermalVoltage)) /
        TunnelDiodeElm.thermalVoltage +
      (TunnelDiodeElm.peakCurrent * exponential) /
        TunnelDiodeElm.peakVoltage -
      (TunnelDiodeElm.peakCurrent * voltage * exponential) /
        (TunnelDiodeElm.peakVoltage * TunnelDiodeElm.peakVoltage) +
      TunnelDiodeElm.valleyCurrent *
        Math.exp(voltage - TunnelDiodeElm.valleyVoltage);
    const currentSource = this.currentAt(voltage) - conductance * voltage;
    CircuitElm.sim.stampConductance(
      this.nodes[0],
      this.nodes[1],
      conductance
    );
    CircuitElm.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[1],
      currentSource
    );
  }

  public override calculateCurrent(): void {
    this.current = this.currentAt(this.volts[0] - this.volts[1]);
  }
}
