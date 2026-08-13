import { describe, expect, it } from "vitest";
import { COMPONENTS } from "../src/app/NativeCircuitApp";
import {
  DRAW_MENU_DIRECT_ITEMS,
  DRAW_MENU_GROUPS
} from "../src/app/DrawMenu";
import { ElementFactory, StringTokenizer } from "../src/core";
import { circuitExamples } from "../src/examples";

describe("native component catalog", () => {
  it("constructs every exposed drawing tool", () => {
    const factory = new ElementFactory();
    const failures: string[] = [];
    for (const component of COMPONENTS) {
      try {
        const element = factory.create(
          component.type,
          32,
          32,
          128,
          32,
          component.flags ?? 0,
          new StringTokenizer(component.arguments)
        );
        expect(element, component.id).not.toBeNull();
        element?.setPoints();
      } catch (error) {
        failures.push(`${component.id}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps every drawing tool in the legacy menu hierarchy", () => {
    const menuIds = [
      ...DRAW_MENU_DIRECT_ITEMS.map((item) => item.id),
      ...DRAW_MENU_GROUPS.flatMap((group) =>
        group.items.map((item) => item.id)
      )
    ];
    expect(new Set(menuIds).size).toBe(menuIds.length);
    expect(new Set(menuIds)).toEqual(
      new Set(COMPONENTS.map((component) => component.id))
    );
  });

  it("uses the original localized names and menu paths for circuits", () => {
    expect(circuitExamples).toHaveLength(366);
    expect(
      circuitExamples.find((example) => example.id === "ohms.txt")
    ).toMatchObject({
      name: "欧姆定律",
      categoryPath: ["基础知识"]
    });
    expect(
      circuitExamples.find((example) => example.id === "rectify.txt")
    ).toMatchObject({
      name: "半波整流",
      categoryPath: ["二极管"]
    });
    expect(
      circuitExamples.find((example) => example.id === "blank.txt")
    ).toMatchObject({
      name: "空白电路",
      categoryPath: []
    });
    expect(
      circuitExamples.every((example) => example.name.trim().length > 0)
    ).toBe(true);
  });
});
