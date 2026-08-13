import { CustomLogicModel } from "../CustomLogicModel";
import { DiodeModel } from "../DiodeModel";
import { StringTokenizer } from "../StringTokenizer";
import { DiodeElm } from "./DiodeElm";

/** Electrical/model port of ZenerElm.java. */
export class ZenerElm extends DiodeElm {
  public static lastZenerModelName = "default-zener";

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
    flags = DiodeElm.FLAG_MODEL,
    tokenizer?: StringTokenizer
  ) {
    if (tokenizer === undefined) {
      super(
        x,
        y,
        x2,
        y2,
        DiodeElm.FLAG_MODEL,
        new StringTokenizer(
          CustomLogicModel.escape(ZenerElm.lastZenerModelName)
        )
      );
      return;
    }

    if ((flags & DiodeElm.FLAG_MODEL) !== 0) {
      super(x, y, x2, y2, flags, tokenizer);
      return;
    }

    const tokens = tokenizer.toArray();
    const forwardDrop =
      (flags & DiodeElm.FLAG_FWDROP) !== 0
        ? Number(tokens.shift() ?? 0.805904783)
        : 0.805904783;
    const zenerVoltage = Number(tokens.shift() ?? 5.6);
    const model = DiodeModel.getModelWithParameters(
      forwardDrop,
      zenerVoltage
    );
    super(
      x,
      y,
      x2,
      y2,
      DiodeElm.FLAG_MODEL,
      new StringTokenizer(CustomLogicModel.escape(model.name))
    );
  }

  public override getDumpType(): number {
    return "z".charCodeAt(0);
  }
}
