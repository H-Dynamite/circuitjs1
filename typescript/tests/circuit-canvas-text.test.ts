import { describe, expect, it } from "vitest";
import {
  AndGateElm,
  CustomCompositeElm,
  ChipElm,
  ElementFactory,
  JKFlipFlopElm,
  StringTokenizer
} from "../src/core";
import { CircuitCanvasRenderer } from "../src/ui/CircuitCanvasRenderer";

type TextCall = {
  text: string;
  x: number;
  y: number;
  font: string;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
};

function textContext(): {
  context: CanvasRenderingContext2D;
  textCalls: TextCall[];
  arcCalls: number;
} {
  const textCalls: TextCall[] = [];
  let arcCalls = 0;
  const context = {
    font: "10px sans-serif",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {
      arcCalls += 1;
    },
    strokeRect() {},
    rect() {},
    translate() {},
    rotate() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    measureText(text: string) {
      const size = Number(this.font.match(/([\d.]+)px/)?.[1]) || 10;
      return { width: text.length * size } as TextMetrics;
    },
    fillText(text: string, x: number, y: number) {
      textCalls.push({
        text,
        x,
        y,
        font: this.font,
        align: this.textAlign,
        baseline: this.textBaseline
      });
    }
  } as unknown as CanvasRenderingContext2D;
  return {
    context,
    textCalls,
    get arcCalls() {
      return arcCalls;
    }
  };
}

describe("legacy canvas text contracts", () => {
  it("scales logic-terminal SansSerif text with the manually mapped viewport", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.viewport.scale = 0.5;
    const { context, textCalls } = textContext();
    const privateRenderer = renderer as unknown as {
      drawLogicTerminal(
        context: CanvasRenderingContext2D,
        value: string,
        post: { x: number; y: number },
        lead: { x: number; y: number },
        labelPoint: { x: number; y: number }
      ): void;
    };

    privateRenderer.drawLogicTerminal(
      context,
      "1",
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 30 }
    );

    expect(textCalls).toEqual([
      expect.objectContaining({
        text: "1",
        x: 20,
        y: 30,
        font: "bold 10px sans-serif",
        align: "center",
        baseline: "middle"
      })
    ]);
  });

  it("uses ChipElm's fitted alphabetic pin labels and never adds a chip title", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.viewport.scale = 0.5;
    const chip = new JKFlipFlopElm(0, 0);
    chip.setPoints();
    const { context, textCalls } = textContext();
    const privateRenderer = renderer as unknown as {
      drawChip(context: CanvasRenderingContext2D, chip: JKFlipFlopElm): void;
    };

    privateRenderer.drawChip(context, chip);

    expect(textCalls.map((call) => call.text)).toEqual(["J", "K", "Q", "Q"]);
    expect(textCalls).not.toContainEqual(
      expect.objectContaining({ text: "JK flip-flop" })
    );
    expect(textCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: "J",
          x: 10.5,
          y: 10 / 3,
          font: "normal 10px normal",
          baseline: "alphabetic"
        })
      ])
    );
  });

  it("draws only the master of a bus pin and preserves integer measureText positioning", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.viewport.scale = 0.5;
    const chip = new JKFlipFlopElm(0, 0);
    chip.pins[0].busWidth = 2;
    chip.pins[1].busWidth = 2;
    chip.pins[1].busZ = 1;
    chip.pins[1].text = "duplicate";
    chip.setPoints();
    const tracked = textContext();
    const { context, textCalls } = tracked;
    const privateRenderer = renderer as unknown as {
      drawChip(context: CanvasRenderingContext2D, chip: JKFlipFlopElm): void;
    };

    privateRenderer.drawChip(context, chip);

    expect(textCalls.map((call) => call.text)).toEqual(["J/2", "K", "Q", "Q"]);
    expect(tracked.arcCalls).toBe(0);
  });

  it("truncates label widths in model units before restoring viewport scale", () => {
    for (const { scale, measuredWidth, expectedX } of [
      { scale: 0.5, measuredWidth: 10.9, expectedX: 27 },
      { scale: 1.5, measuredWidth: 31.9, expectedX: 81 }
    ]) {
      const renderer = new CircuitCanvasRenderer();
      renderer.viewport.scale = scale;
      const chip = new JKFlipFlopElm(0, 0);
      chip.setPoints();
      const { context, textCalls } = textContext();
      context.measureText = ((text: string) =>
        ({ width: text === "Q" ? measuredWidth : 10 } as TextMetrics)) as typeof context.measureText;
      const privateRenderer = renderer as unknown as {
        drawChip(context: CanvasRenderingContext2D, chip: JKFlipFlopElm): void;
      };

      privateRenderer.drawChip(context, chip);

      expect(textCalls.filter((call) => call.text === "Q")[0].x).toBe(
        expectedX
      );
    }
  });

  it("fits long labels to one model font size at every viewport scale", () => {
    const screenFonts = [0.5, 1.5].map((scale) => {
      const renderer = new CircuitCanvasRenderer();
      renderer.viewport.scale = scale;
      const chip = new JKFlipFlopElm(0, 0);
      chip.pins[0].text = "LONG";
      chip.setPoints();
      const { context, textCalls } = textContext();
      const privateRenderer = renderer as unknown as {
        drawChip(context: CanvasRenderingContext2D, chip: JKFlipFlopElm): void;
      };

      privateRenderer.drawChip(context, chip);
      return Number(
        textCalls.find((call) => call.text === "LONG")!.font.match(
          /([\d.]+)px/
        )?.[1]
      );
    });

    expect(screenFonts).toEqual([3, 9]);
    expect(screenFonts.map((size, index) => size / [0.5, 1.5][index])).toEqual(
      [6, 6]
    );
  });

  it("uses the Legacy IEC gate text font, baseline, and unrotated gsize offset", () => {
    const renderer = new CircuitCanvasRenderer();
    renderer.iecGates = true;
    renderer.viewport.scale = 0.5;
    const gate = new AndGateElm(
      0,
      0,
      128,
      0,
      0,
      new StringTokenizer("")
    );
    gate.setPoints();
    const { context, textCalls } = textContext();
    const privateRenderer = renderer as unknown as {
      drawGate(context: CanvasRenderingContext2D, gate: AndGateElm): void;
    };

    privateRenderer.drawGate(context, gate);

    expect(textCalls).toContainEqual(
      expect.objectContaining({
        text: "&",
        font: "normal 6px sans-serif",
        align: "center",
        baseline: "middle",
        y: -6
      })
    );

    const verticalGate = new AndGateElm(
      0,
      0,
      0,
      128,
      0,
      new StringTokenizer("")
    );
    verticalGate.setPoints();
    const vertical = textContext();
    privateRenderer.drawGate(vertical.context, verticalGate);
    expect(vertical.textCalls).toContainEqual(
      expect.objectContaining({ text: "&", x: 0, y: 26 })
    );
  });

  it("draws a custom-composite model name only when f=1 requests it", () => {
    const renderer = new CircuitCanvasRenderer();
    const composite = new CustomCompositeElm(0, 0, new ElementFactory());
    composite.modelName = "visible model";
    composite.model = {
      flags: 1,
      sizeX: 2,
      sizeY: 2,
      pins: [
        {
          name: "LONG",
          node: 0,
          position: 0,
          side: ChipElm.SIDE_W,
          busWidth: 1,
          busZ: 0
        },
        {
          name: "hidden bus bit",
          node: 1,
          position: 1,
          side: ChipElm.SIDE_W,
          busWidth: 2,
          busZ: 1
        }
      ]
    } as typeof composite.model;
    renderer.viewport.scale = 0.5;
    composite.setupPins();
    composite.setPoints();
    const { context, textCalls } = textContext();
    const privateRenderer = renderer as unknown as {
      drawChip(
        context: CanvasRenderingContext2D,
        chip: CustomCompositeElm
      ): void;
    };

    privateRenderer.drawChip(context, composite);

    expect(textCalls).toContainEqual(
      expect.objectContaining({
        text: "visible model",
        align: "center",
        baseline: "middle",
        font: "normal 10px normal"
      })
    );
  });
});
