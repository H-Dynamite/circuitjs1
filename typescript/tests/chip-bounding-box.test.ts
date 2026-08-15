import { describe, expect, it } from "vitest";
import { ChipElm, JKFlipFlopElm, Rectangle, StringTokenizer } from "../src/core";

function chip(flags = 0): JKFlipFlopElm {
  const element = new JKFlipFlopElm(
    100,
    200,
    100,
    200,
    flags,
    new StringTokenizer("")
  );
  element.setPoints();
  return element;
}

describe("ChipElm legacy bounding box", () => {
  it("uses the inclusive chip body rectangle without extending to its pins", () => {
    const element = chip();

    expect(element.boundingBox).toEqual(new Rectangle(116, 184, 65, 97));
    expect(element.pins.some((pin) => pin.post.x < element.bodyLeft)).toBe(true);
    expect(element.pins.some((pin) => pin.post.x > element.bodyRight)).toBe(true);
    expect(element.boundingBox).toEqual(
      new Rectangle(
        element.bodyLeft,
        element.bodyTop,
        element.bodyRight - element.bodyLeft + 1,
        element.bodyBottom - element.bodyTop + 1
      )
    );
  });

  it("swaps the rectangular body dimensions for vertical flip-XY geometry", () => {
    const element = chip(ChipElm.FLAG_FLIP_XY);

    expect(element.boundingBox).toEqual(new Rectangle(116, 184, 97, 65));
  });

  it("keeps body bounds stable while horizontal and vertical pin flips move pins", () => {
    const ordinary = chip();
    const flipped = chip(ChipElm.FLAG_FLIP_X | ChipElm.FLAG_FLIP_Y);

    expect(flipped.boundingBox).toEqual(ordinary.boundingBox);
    expect(flipped.pins.map((pin) => pin.post)).not.toEqual(
      ordinary.pins.map((pin) => pin.post)
    );
  });

  it("uses the small chip spacing in both body dimensions", () => {
    const element = chip(ChipElm.FLAG_SMALL);

    expect(element.cspc).toBe(8);
    expect(element.cspc2).toBe(16);
    expect(element.boundingBox).toEqual(new Rectangle(108, 192, 33, 49));
  });
});
