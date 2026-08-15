import { readFileSync } from "node:fs";
import { CircuitLoader, ElementFactory, InverterElm, Rectangle, StringTokenizer } from "../src/core";
import { describe, expect, it } from "vitest";

function fixtureInverters(name: string): InverterElm[] {
  const document = new CircuitLoader().readCircuit(readFileSync(`src/examples/circuits/${name}`, "utf8"));
  if (document.format !== "text") throw new Error("expected text fixture");
  const factory = new ElementFactory();
  return document.records.filter((record) => record.kind === "element")
    .map((record) => factory.createFromRecord(record))
    .filter((element): element is InverterElm => element instanceof InverterElm)
    .map((element) => { element.setPoints(); return element; });
}

describe("legacy InverterElm bounding box", () => {
  it("uses the Java 16-model-unit perpendicular extent", () => {
    const horizontal = new InverterElm(576, 48, 80, 48, 0, new StringTokenizer("0.5 5"));
    horizontal.setPoints();
    expect(horizontal.boundingBox).toEqual(new Rectangle(80, 32, 497, 32));
    const vertical = new InverterElm(48, 128, 48, 272, 0, new StringTokenizer("0.5 5"));
    vertical.setPoints();
    expect(vertical.boundingBox).toEqual(new Rectangle(32, 128, 32, 145));
  });

  it("preserves decisive fixture bounds", () => {
    const mux = fixtureInverters("mux3state.txt").find((e) => e.y === 48 && e.y2 === 48);
    expect(mux?.boundingBox).toEqual(new Rectangle(80, 32, 497, 32));
    const unishift = fixtureInverters("unishiftreg.txt");
    expect(unishift.find((e) => e.y === 24)?.boundingBox).toEqual(new Rectangle(248, 8, 49, 32));
    expect(unishift.find((e) => e.y === 616)?.boundingBox).toEqual(new Rectangle(392, 600, 41, 32));
    const master = fixtureInverters("masterslaveff.txt");
    expect(master.find((e) => e.x === 48)?.boundingBox).toEqual(new Rectangle(32, 128, 32, 145));
  });
});
