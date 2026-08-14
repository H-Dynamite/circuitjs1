import { describe, expect, it } from "vitest";
import {
  CircuitRunner,
  CustomCompositeElm,
  CustomCompositeModel
} from "../src/core";

function countTags(model: NonNullable<ReturnType<typeof CustomCompositeModel.get>>) {
  return model.elements.reduce<Record<string, number>>((counts, element) => {
    counts[element.tagName] = (counts[element.tagName] ?? 0) + 1;
    return counts;
  }, {});
}

describe("legacy built-in composite regulators", () => {
  it("migrates the original internal LM317 and TL431 definitions into native XML records", () => {
    CircuitRunner.fromText("$ 1 0.000005 10.2 50 5 43");

    const lm317 = CustomCompositeModel.get("~LM317-v2");
    const tl431 = CustomCompositeModel.get("~TL431");
    expect(lm317).not.toBeNull();
    expect(tl431).not.toBeNull();
    expect(lm317?.internal).toBe(true);
    expect(tl431?.internal).toBe(true);
    expect(lm317?.pins).toEqual([
      { name: "adj", node: 2, position: 1, side: 1, busWidth: 1, busZ: 0 },
      { name: "in", node: 1, position: 0, side: 2, busWidth: 1, busZ: 0 },
      { name: "out", node: 3, position: 0, side: 3, busWidth: 1, busZ: 0 }
    ]);
    expect(tl431?.pins).toEqual([
      { name: "A", node: 2, position: 0, side: 1, busWidth: 1, busZ: 0 },
      { name: "C", node: 1, position: 0, side: 0, busWidth: 1, busZ: 0 },
      { name: "ref", node: 3, position: 1, side: 2, busWidth: 1, busZ: 0 }
    ]);
    // These counts are derived from the legacy node-list, so a shortened
    // placeholder model cannot pass as a migration.
    expect(countTags(lm317!)).toEqual({ j: 1, r: 53, c: 60, t: 27, d: 3 });
    expect(countTags(tl431!)).toEqual({ r: 21, c: 24, t: 11, d: 2 });
    expect(CustomCompositeModel.list()).not.toContain(lm317);
    expect(CustomCompositeModel.list()).not.toContain(tl431);
  });

  it("constructs each internal model through the ordinary XML <cc> path", () => {
    for (const name of ["~LM317-v2", "~TL431"]) {
      const runner = CircuitRunner.fromXml(
        `<cir ts="0.000005"><cc x="128 128 192 128" f="0" mo="${name}"/></cir>`
      );
      const instance = runner.elements[0];
      expect(instance).toBeInstanceOf(CustomCompositeElm);
      expect((instance as CustomCompositeElm).modelName).toBe(name);
      expect((instance as CustomCompositeElm).children).toHaveLength(
        name === "~LM317-v2" ? 144 : 58
      );
    }
  });
});
