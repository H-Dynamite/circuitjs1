import { CircuitNode } from "../CircuitNode";
import { DiodeModel } from "../DiodeModel";
import { SimulationManager } from "../SimulationManager";

/** Nonlinear junction companion model ported from Diode.java. */
export class Diode {
  public static readonly vt = 0.025865;
  public static readonly vzcoef = 1 / Diode.vt;

  public nodes: [CircuitNode, CircuitNode] | null = null;
  public vscale = 0;
  public vdcoef = 0;
  public zvoltage = 0;
  public leakage = 0;
  public zoffset = 0;
  public vcrit = 0;
  public vzcrit = 0;
  public lastvoltdiff = 0;

  public constructor(public readonly sim: SimulationManager) {}

  public setup(model: DiodeModel): void {
    this.leakage = model.saturationCurrent;
    this.zvoltage = model.breakdownVoltage;
    this.vscale = model.vscale;
    this.vdcoef = model.vdcoef;
    this.vcrit =
      this.vscale *
      Math.log(this.vscale / (Math.sqrt(2) * this.leakage));
    this.vzcrit =
      Diode.vt *
      Math.log(Diode.vt / (Math.sqrt(2) * this.leakage));
    if (this.zvoltage === 0) {
      this.zoffset = 0;
    } else {
      const current = -0.005;
      this.zoffset =
        this.zvoltage -
        Math.log(-(1 + current / this.leakage)) / Diode.vzcoef;
    }
  }

  public setupForDefaultModel(): void {
    this.setup(DiodeModel.getDefaultModel());
  }

  public reset(): void {
    this.lastvoltdiff = 0;
  }

  public limitStep(newVoltage: number, oldVoltage: number): number {
    if (
      newVoltage > this.vcrit &&
      Math.abs(newVoltage - oldVoltage) > this.vscale * 2
    ) {
      if (oldVoltage > 0) {
        const argument = 1 + (newVoltage - oldVoltage) / this.vscale;
        newVoltage =
          argument > 0
            ? oldVoltage + this.vscale * Math.log(argument)
            : this.vcrit;
      } else {
        newVoltage =
          this.vscale * Math.log(newVoltage / this.vscale);
      }
      this.sim.converged = false;
    } else if (newVoltage < 0 && this.zoffset !== 0) {
      let translatedNew = -newVoltage - this.zoffset;
      const translatedOld = -oldVoltage - this.zoffset;
      if (
        translatedNew > this.vzcrit &&
        Math.abs(translatedNew - translatedOld) > Diode.vt * 2
      ) {
        if (translatedOld > 0) {
          const argument =
            1 + (translatedNew - translatedOld) / Diode.vt;
          translatedNew =
            argument > 0
              ? translatedOld + Diode.vt * Math.log(argument)
              : this.vzcrit;
        } else {
          translatedNew =
            Diode.vt * Math.log(translatedNew / Diode.vt);
        }
        this.sim.converged = false;
      }
      newVoltage = -(translatedNew + this.zoffset);
    }
    return newVoltage;
  }

  public stamp(node0: CircuitNode, node1: CircuitNode): void {
    this.nodes = [node0, node1];
    this.sim.stampNonLinear(node0);
    this.sim.stampNonLinear(node1);
  }

  public doStep(voltageDifference: number): void {
    if (this.nodes === null) {
      throw new Error("Diode must be stamped before doStep()");
    }
    if (Math.abs(voltageDifference - this.lastvoltdiff) > 0.01) {
      this.sim.converged = false;
    }
    voltageDifference = this.limitStep(
      voltageDifference,
      this.lastvoltdiff
    );
    this.lastvoltdiff = voltageDifference;

    let minimumConductance = this.leakage * 0.01;
    if (this.sim.subIterations > 100) {
      minimumConductance = Math.exp(
        -9 *
          Math.log(10) *
          (1 - this.sim.subIterations / 3000)
      );
      minimumConductance = Math.min(minimumConductance, 0.1);
    }

    let equivalentConductance: number;
    let currentSource: number;
    if (voltageDifference >= 0 || this.zvoltage === 0) {
      const exponential = Math.exp(voltageDifference * this.vdcoef);
      equivalentConductance =
        this.vdcoef * this.leakage * exponential +
        minimumConductance;
      currentSource =
        (exponential - 1) * this.leakage -
        equivalentConductance * voltageDifference;
    } else {
      equivalentConductance =
        this.leakage *
          (this.vdcoef *
            Math.exp(voltageDifference * this.vdcoef) +
            Diode.vzcoef *
              Math.exp(
                (-voltageDifference - this.zoffset) * Diode.vzcoef
              )) +
        minimumConductance;
      currentSource =
        this.leakage *
          (Math.exp(voltageDifference * this.vdcoef) -
            Math.exp(
              (-voltageDifference - this.zoffset) * Diode.vzcoef
            ) -
            1) -
        equivalentConductance * voltageDifference;
    }

    this.sim.stampConductance(
      this.nodes[0],
      this.nodes[1],
      equivalentConductance
    );
    this.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[1],
      currentSource
    );
  }

  public calculateCurrent(voltageDifference: number): number {
    if (voltageDifference >= 0 || this.zvoltage === 0) {
      return (
        this.leakage *
        (Math.exp(voltageDifference * this.vdcoef) - 1)
      );
    }
    return (
      this.leakage *
      (Math.exp(voltageDifference * this.vdcoef) -
        Math.exp(
          (-voltageDifference - this.zoffset) * Diode.vzcoef
        ) -
        1)
    );
  }
}
