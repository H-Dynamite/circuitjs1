import { describe, expect, it } from "vitest";
import {
  CircuitElm,
  CircuitLoader,
  CustomTransformerElm,
  DataInputElm,
  ElementFactory,
  FuseElm,
  SimulationManager,
  SRAMElm
} from "../src/core";

describe("extended native element ports", () => {
  it("loads stateful XML elements without a legacy runtime", () => {
    CircuitElm.initClass(new SimulationManager());
    const source = [
      '<cir f="1" ts="0.000005">',
      '  <DataInput x="0 0 0 32" f="256" sl="0.25" sf="2" name="wave">1\n2\n3</DataInput>',
      '  <Fuse x="32 0 96 0" f="0" re="0.1" i2="3.5" he="1.25" bl="true"/>',
      '  <CustomTransformer x="128 0 256 0" f="0" in="5" cc="0.998" ds="1+1:2" nc="3" ci="0.1 0.2 0.3"/>',
      '  <SRAM x="288 0 352 0" f="4" ab="4" db="4">0: A\n3: F</SRAM>',
      "</cir>"
    ].join("\n");
    const document = new CircuitLoader().readCircuit(source);
    expect(document.format).toBe("xml");
    if (document.format !== "xml") throw new Error("expected XML");

    const factory = new ElementFactory();
    const elements = document.records
      .filter((record) => record.kind === "element")
      .map((record) => factory.createFromXmlRecord(record));

    const data = elements[0] as DataInputElm;
    expect(data).toBeInstanceOf(DataInputElm);
    expect(data.data).toEqual([1, 2, 3]);
    expect(data.getVoltage()).toBe(2);
    data.timeOffset = 0.75;
    expect(data.getVoltage()).toBe(2);

    const fuse = elements[1] as FuseElm;
    expect(fuse).toBeInstanceOf(FuseElm);
    expect(fuse.resistance).toBe(0.1);
    expect(fuse.i2t).toBe(3.5);
    expect(fuse.heat).toBe(1.25);
    expect(fuse.blown).toBe(true);

    const transformer = elements[2] as CustomTransformerElm;
    expect(transformer).toBeInstanceOf(CustomTransformerElm);
    expect(transformer.description).toBe("1+1:2");
    expect(transformer.coilCount).toBe(3);
    expect(transformer.nodeCount).toBe(5);
    expect(transformer.primaryCoils).toBe(2);
    expect(transformer.coilCurrents).toEqual([0.1, 0.2, 0.3]);

    const memory = elements[3] as SRAMElm;
    expect(memory).toBeInstanceOf(SRAMElm);
    expect(memory.map.get(0)).toBe(0xa);
    expect(memory.map.get(3)).toBe(0xf);
    expect(memory.contentsToString()).toBe("0: A\n3: F");
  });

  it("round-trips extended element state through XML attributes", () => {
    CircuitElm.initClass(new SimulationManager());
    const original = new CustomTransformerElm(16, 32);
    expect(original.parseDescription("1,-1:2+2")).toBe(true);
    original.inductance = 7;
    original.couplingCoef = 0.995;
    original.coilCurrents = [0.5, -0.25, 0.125, 0.25];

    const document = globalThis.document.implementation.createDocument(
      "",
      "CustomTransformer"
    );
    const root = document.documentElement;
    original.dumpXml(document, root);
    root.setAttribute("x", "16 32 144 32");

    const parsed = new CircuitLoader().readCircuit(
      `<cir>${root.outerHTML}</cir>`
    );
    expect(parsed.format).toBe("xml");
    if (parsed.format !== "xml") throw new Error("expected XML");
    const restored = new ElementFactory().createFromXmlRecord(
      parsed.records[0]
    ) as CustomTransformerElm;

    expect(restored).toBeInstanceOf(CustomTransformerElm);
    expect(restored.description).toBe(original.description);
    expect(restored.inductance).toBe(original.inductance);
    expect(restored.couplingCoef).toBe(original.couplingCoef);
    expect(restored.coilCurrents).toEqual(original.coilCurrents);
  });
});
