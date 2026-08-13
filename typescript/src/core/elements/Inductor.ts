import { CircuitNode } from "../CircuitNode";
import { SimulationManager } from "../SimulationManager";

/** Direct electrical port of Inductor.java's companion model. */
export class Inductor {
  public static readonly FLAG_BACK_EULER = 2;

  public nodes: [CircuitNode, CircuitNode] | null = null;
  public flags = 0;
  public inductance = 0;
  public compResistance = 0;
  public current = 0;
  public curSourceValue = 0;
  public saturationCurrent = 0;

  public constructor(public readonly sim: SimulationManager) {}

  public setup(
    inductance: number,
    current: number,
    flags: number,
    saturationCurrent = 0
  ): void {
    this.inductance = inductance;
    this.current = current;
    this.flags = flags;
    this.saturationCurrent = saturationCurrent;
  }

  public isTrapezoidal(): boolean {
    return (this.flags & Inductor.FLAG_BACK_EULER) === 0;
  }

  public reset(): void {
    this.resetTo(0);
  }

  public resetTo(current: number): void {
    this.curSourceValue = current;
    this.current = current;
  }

  public calcEffectiveInductance(current: number): number {
    if (this.saturationCurrent <= 0) {
      return this.inductance;
    }
    const ratio = current / this.saturationCurrent;
    return this.inductance / (1 + ratio * ratio);
  }

  public stamp(node0: CircuitNode, node1: CircuitNode): void {
    this.nodes = [node0, node1];
    if (this.saturationCurrent > 0) {
      this.sim.stampNonLinear(node0);
      this.sim.stampNonLinear(node1);
    } else {
      this.compResistance = this.isTrapezoidal()
        ? (2 * this.inductance) / this.sim.timeStep
        : this.inductance / this.sim.timeStep;
      this.sim.stampResistor(node0, node1, this.compResistance);
    }
    this.sim.stampRightSide(node0);
    this.sim.stampRightSide(node1);
  }

  public nonLinear(): boolean {
    return this.saturationCurrent > 0;
  }

  public startIteration(voltageDifference: number): void {
    if (this.saturationCurrent > 0) {
      const effective = this.calcEffectiveInductance(this.current);
      this.compResistance = this.isTrapezoidal()
        ? (2 * effective) / this.sim.timeStep
        : effective / this.sim.timeStep;
    }
    this.curSourceValue = this.isTrapezoidal()
      ? voltageDifference / this.compResistance + this.current
      : this.current;
  }

  public calculateCurrent(voltageDifference: number): number {
    if (this.compResistance > 0) {
      this.current =
        voltageDifference / this.compResistance + this.curSourceValue;
    }
    return this.current;
  }

  public doStep(_voltageDifference: number): void {
    if (this.nodes === null) {
      throw new Error("Inductor must be stamped before doStep()");
    }
    if (this.saturationCurrent > 0) {
      this.sim.stampConductance(
        this.nodes[0],
        this.nodes[1],
        1 / this.compResistance
      );
    }
    this.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[1],
      this.curSourceValue
    );
  }
}
