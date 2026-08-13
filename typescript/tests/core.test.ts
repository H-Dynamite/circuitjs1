import {
  ACRailElm,
  AMElm,
  AndGateElm,
  AntennaElm,
  CapacitorElm,
  CircuitElm,
  CircuitLoader,
  CircuitMatrix,
  CircuitNode,
  CircuitRunner,
  ClockElm,
  CustomLogicModel,
  DMatrixSparseCSC,
  ElementFactory,
  GroundElm,
  Inductor,
  InductorElm,
  InverterElm,
  JfetElm,
  FMElm,
  CurrentElm,
  Diode,
  DiodeElm,
  DiodeModel,
  Locale,
  LogicInputElm,
  LogicOutputElm,
  MosfetElm,
  NandGateElm,
  NorGateElm,
  OpAmpElm,
  OrGateElm,
  Point,
  ProbeElm,
  QueryParameters,
  RailElm,
  Rectangle,
  ResistorElm,
  SimulationManager,
  SparseLU,
  StringTokenizer,
  SwitchElm,
  TextElm,
  TransistorElm,
  TransistorModel,
  VarRailElm,
  VoltageElm,
  VoltageSource,
  WireElm,
  XorGateElm,
  XMLDeserializer,
  XMLSerializer,
  ZenerElm
} from "../src/core";
import { describe, expect, it } from "vitest";

function clone(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

describe("SimulationManager dense solver", () => {
  it("factors and solves a nonsingular system", () => {
    const matrix = [
      [3, 2, -1],
      [2, -2, 4],
      [-1, 0.5, -1]
    ];
    const rightSide = [1, -2, 0];
    const pivot = [0, 0, 0];
    const factored = clone(matrix);

    expect(SimulationManager.lu_factor_dense(factored, 3, pivot)).toBe(true);
    SimulationManager.lu_solve_dense(factored, 3, pivot, rightSide);
    [1, -2, -2].forEach((expected, index) => {
      expect(rightSide[index]).toBeCloseTo(expected);
    });
  });

  it("rejects a matrix containing a zero row", () => {
    const singular = [
      [1, 2],
      [0, 0]
    ];
    expect(
      SimulationManager.lu_factor_dense(singular, 2, [0, 0])
    ).toBe(false);
  });

  it("inverts a matrix in place", () => {
    const matrix = [
      [4, 7],
      [2, 6]
    ];
    SimulationManager.invertMatrix(matrix, 2);
    expect(matrix[0][0]).toBeCloseTo(0.6);
    expect(matrix[0][1]).toBeCloseTo(-0.7);
    expect(matrix[1][0]).toBeCloseTo(-0.2);
    expect(matrix[1][1]).toBeCloseTo(0.4);
  });
});

describe("sparse matrix and SparseLU", () => {
  it("preserves compressed-column values and mutation methods", () => {
    const dense = [
      [10, 0, 2],
      [0, 3, 0],
      [4, 0, 5]
    ];
    const sparse = DMatrixSparseCSC.convert(
      dense,
      DMatrixSparseCSC.EPS
    );

    expect(sparse.getNonZeroLength()).toBe(5);
    expect(sparse.get(2, 0)).toBe(4);
    expect(sparse.get(0, 1, 99)).toBe(99);
    sparse.set(1, 0, 7);
    expect(sparse.get(1, 0)).toBe(7);
    sparse.remove(1, 0);
    expect(sparse.get(1, 0)).toBe(0);
    expect(
      Array.from(sparse).map(({ row, col, value }) => [row, col, value])
    ).toEqual([
      [0, 0, 10],
      [2, 0, 4],
      [1, 1, 3],
      [0, 2, 2],
      [2, 2, 5]
    ]);
  });

  it("matches the dense solver for a sparse circuit matrix", () => {
    const original = [
      [10, -2, 0, 0],
      [-2, 9, -3, 0],
      [0, -3, 8, -1],
      [0, 0, -1, 7]
    ];
    const expected = [1, 2, 3, 4];
    const rightSide = original.map((row) =>
      row.reduce(
        (sum, value, column) => sum + value * expected[column],
        0
      )
    );

    const solver = new SparseLU();
    expect(
      solver.setA(
        DMatrixSparseCSC.convert(original, DMatrixSparseCSC.EPS)
      )
    ).toBe(true);
    const result = Array<number>(4).fill(0);
    solver.solve(rightSide, result);
    result.forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index]);
    });
  });

  it("uses the sparse dispatch path without changing method names", () => {
    const matrix = new CircuitMatrix(3);
    matrix.matrix = [
      [4, 0, 1],
      [0, 5, 0],
      [1, 0, 3]
    ];
    matrix.sparseLU = new SparseLU();
    const rightSide = [10, 10, 8];
    expect(
      SimulationManager.lu_factor(
        matrix.matrix,
        matrix.size,
        matrix.permute,
        matrix
      )
    ).toBe(true);
    SimulationManager.lu_solve(
      matrix.matrix,
      matrix.size,
      matrix.permute,
      rightSide,
      matrix
    );
    rightSide.forEach((value) => expect(value).toBeCloseTo(2));
  });
});

describe("SimulationManager matrix stamps", () => {
  it("solves a stamped resistor and current source using Ohm's law", () => {
    const circuitMatrix = new CircuitMatrix(1);
    const node = new CircuitNode();
    node.index = 1;
    node.row = 1;
    node.matrix = circuitMatrix;

    const simulation = new SimulationManager();
    simulation.stampResistor(node, CircuitNode.ground, 1000);
    simulation.stampCurrentSource(CircuitNode.ground, node, 0.005);
    expect(circuitMatrix.matrix[0][0]).toBeCloseTo(0.001);
    expect(circuitMatrix.rightSide[0]).toBeCloseTo(0.005);

    const pivot = [0];
    expect(
      SimulationManager.lu_factor_dense(circuitMatrix.matrix, 1, pivot)
    ).toBe(true);
    SimulationManager.lu_solve_dense(
      circuitMatrix.matrix,
      1,
      pivot,
      circuitMatrix.rightSide
    );
    expect(circuitMatrix.rightSide[0]).toBeCloseTo(5);
  });

  it("preserves voltage source matrix orientation", () => {
    const matrix = new CircuitMatrix(2);
    const node = new CircuitNode();
    node.index = 1;
    node.row = 1;
    node.matrix = matrix;
    const source = new VoltageSource();
    source.row = 2;
    source.matrix = matrix;
    source.setNodes(CircuitNode.ground, node);

    new SimulationManager().stampVoltageSource(source, 9);
    expect(matrix.matrix[1][0]).toBe(1);
    expect(matrix.matrix[0][1]).toBe(-1);
    expect(matrix.rightSide[1]).toBe(9);
  });
});

describe("portable utility classes", () => {
  it("ports Point and Rectangle behavior", () => {
    const point = new Point(2, 3, 4);
    const copy = new Point(point);
    expect(copy.equals(point)).toBe(true);
    copy.move(5, -1);
    expect(copy.equals(new Point(7, 2, 4))).toBe(true);

    const first = new Rectangle(0, 0, 10, 10);
    const second = new Rectangle(5, 5, 10, 5);
    expect(first.contains(2, 2)).toBe(true);
    expect(first.intersects(second)).toBe(true);
    expect(first.union(second).equals(new Rectangle(0, 0, 15, 10))).toBe(
      true
    );
  });

  it("parses locale catalogs and query parameters", () => {
    Locale.localizationMap = Locale.processLocale(
      '"Voltage"="电压"\n"Resistance"="电阻"\n'
    );
    expect(Locale.LS("Voltage")).toBe("电压");
    expect(Locale.LS("Untranslated~")).toBe("Untranslated");
    expect(Locale.convertUnicodeEscapes("\\u03a9")).toBe("Ω");

    const query = new QueryParameters(
      "?running=false&editable=1&name=A%20B"
    );
    expect(query.getBooleanValue("running", true)).toBe(false);
    expect(query.getBooleanValue("editable", false)).toBe(true);
    expect(query.getValue("name")).toBe("A B");
  });
});

describe("legacy circuit text format", () => {
  it("matches Java StringTokenizer delimiter behavior", () => {
    const tokenizer = new StringTokenizer(
      "  alpha+beta\tgamma  ",
      " +\t\n\r\f"
    );
    expect(tokenizer.countTokens()).toBe(3);
    expect(tokenizer.toArray()).toEqual(["alpha", "beta", "gamma"]);

    const delimiters = new StringTokenizer("A,+B", ",+", true);
    expect(delimiters.toArray()).toEqual(["A", ",", "+", "B"]);
  });

  it("round-trips CustomLogicModel escaped tokens", () => {
    const original = "A + B = C\n# note & flag\\path";
    expect(
      CustomLogicModel.unescape(CustomLogicModel.escape(original))
    ).toBe(original);
    expect(CustomLogicModel.escape("")).toBe("\\0");
    expect(CustomLogicModel.unescape("\\0")).toBe("");
  });

  it("parses the original LRC text format without losing element data", () => {
    const source = [
      "$ 1 0.000005 10.20027730826997 50 5 43 5e-11",
      "r 176 80 384 80 0 10",
      "s 384 80 448 80 0 1 false",
      "w 176 80 176 352 0",
      "c 384 352 176 352 0 0.000015 -9.86 -10",
      "l 384 80 384 352 0 1 0.03 0",
      "v 448 352 448 80 0 0 40 5 0 0 0.5",
      "r 384 352 448 352 0 100",
      "o 4 64 0 4099 20 0.05 0 2 4 3",
      "38 3 0 0.000001 0.000101 Capacitance",
      "h 1 4 3"
    ].join("\n");

    const document = new CircuitLoader().readCircuit(source);
    expect(document.format).toBe("text");
    if (document.format !== "text") {
      throw new Error("expected a text circuit");
    }

    expect(document.errors).toEqual([]);
    expect(document.options).toEqual({
      flags: 1,
      maxTimeStep: 0.000005,
      iterationSpeed: 10.20027730826997,
      currentSpeed: 50,
      voltageRange: 5,
      powerBrightness: 43,
      minTimeStep: 5e-11
    });
    expect(document.flags.showCurrentDots).toBe(true);
    expect(document.records.filter((record) => record.kind === "element"))
      .toHaveLength(7);
    expect(document.records.some((record) => record.kind === "scope")).toBe(
      true
    );
    expect(
      document.records.some((record) => record.kind === "adjustable")
    ).toBe(true);
    expect(document.records.some((record) => record.kind === "hint")).toBe(
      true
    );

    const resistor = document.records.find(
      (record) => record.kind === "element" && record.type === "r"
    );
    expect(resistor).toMatchObject({
      dumpType: "r".charCodeAt(0),
      x1: 176,
      y1: 80,
      x2: 384,
      y2: 80,
      flags: 0,
      arguments: ["10"]
    });
  });
});

describe("XML circuit format", () => {
  it("parses circuit options and classifies XML records", () => {
    const source = [
      '<cir f="65" ts="0.000005" ic="10.2" cb="50" pb="43" vr="5" mts="5e-11" st="2">',
      '  <r x="176 80 384 80" f="0" r="10"/>',
      '  <o e="0" y="64"/>',
      '  <dm nm="default" f="0"/>',
      '  <adj e="0" min="1" max="100"/>',
      '  <h t="1" i1="4" i2="3"/>',
      "</cir>"
    ].join("\n");

    const circuit = new CircuitLoader().readCircuit(source);
    expect(circuit.format).toBe("xml");
    if (circuit.format !== "xml") {
      throw new Error("expected an XML circuit");
    }

    expect(circuit.options).toEqual({
      flags: 65,
      maxTimeStep: 0.000005,
      iterationSpeed: 10.2,
      currentSpeed: 50,
      powerBrightness: 43,
      voltageRange: 5,
      minTimeStep: 5e-11,
      solverType: 2
    });
    expect(circuit.records.map((record) => record.kind)).toEqual([
      "element",
      "scope",
      "model",
      "adjustable",
      "hint"
    ]);
    expect(circuit.records[0]).toMatchObject({
      tagName: "r",
      attributes: { x: "176 80 384 80", f: "0", r: "10" }
    });
  });

  it("preserves the Java XML double-escape contract", () => {
    const document = globalThis.document.implementation.createDocument(
      "",
      "cir"
    );
    const root = document.documentElement;
    XMLSerializer.dumpAttr(root, "label", 'A & B "quoted"');
    const output = XMLSerializer.prettyPrint(document);
    expect(output).toContain(
      'label="A &amp;amp; B &amp;quot;quoted&amp;quot;"'
    );

    const deserializer = new XMLDeserializer();
    deserializer.readCircuit(output);
    expect(deserializer.parseStringAttr("label", null)).toBe(
      'A & B "quoted"'
    );
    expect(deserializer.parseDoubleArray("1, 2.5, -3e-2")).toEqual([
      1,
      2.5,
      -0.03
    ]);
  });
});

describe("CircuitElm and passive elements", () => {
  it("preserves base geometry, units and resistor behavior", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const resistor = new ResistorElm(
      16,
      32,
      80,
      32,
      0,
      new StringTokenizer("100")
    );
    resistor.setPoints();
    resistor.volts[0] = 5;
    resistor.volts[1] = 0;
    resistor.calculateCurrent();

    expect(resistor.dn).toBe(64);
    expect(resistor.lead1).toEqual(new Point(32, 32));
    expect(resistor.lead2).toEqual(new Point(64, 32));
    expect(resistor.getCurrent()).toBeCloseTo(0.05);
    expect(resistor.getPower()).toBeCloseTo(0.25);
    expect(resistor.dump()).toBe("r 16 32 80 32 0 100");
    expect(CircuitElm.getUnitText(0.001, "A")).toBe("1 mA");
    expect(CircuitElm.getShortUnitText(1e-6, "F")).toBe("1μF");
  });

  it("stamps the capacitor trapezoidal companion model", () => {
    const simulation = new SimulationManager();
    simulation.timeStep = 1e-3;
    CircuitElm.initClass(simulation);
    CircuitElm.setDcAnalysis(false);

    const capacitor = new CapacitorElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("0.000001 2 0")
    );
    capacitor.setPoints();
    expect(capacitor.lead1).toEqual(new Point(28, 0));
    expect(capacitor.lead2).toEqual(new Point(36, 0));
    const matrix = new CircuitMatrix(1);
    const node = new CircuitNode();
    node.row = 1;
    node.matrix = matrix;
    capacitor.setNode(0, node);
    capacitor.setNode(1, CircuitNode.ground);
    capacitor.stamp();

    expect(capacitor.compResistance).toBeCloseTo(500);
    expect(matrix.matrix[0][0]).toBeCloseTo(0.002);
    capacitor.startIteration();
    expect(capacitor.curSourceValue).toBeCloseTo(-0.004);
    capacitor.doStep();
    expect(matrix.rightSide[0]).toBeCloseTo(0.004);
  });

  it("ports linear and saturating inductor companion behavior", () => {
    const simulation = new SimulationManager();
    simulation.timeStep = 1e-3;
    CircuitElm.initClass(simulation);

    const inductor = new InductorElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("1 0 0 0")
    );
    const matrix = new CircuitMatrix(1);
    const node = new CircuitNode();
    node.row = 1;
    node.matrix = matrix;
    inductor.setNode(0, node);
    inductor.setNode(1, CircuitNode.ground);
    inductor.stamp();

    expect(inductor.ind.compResistance).toBeCloseTo(2000);
    expect(matrix.matrix[0][0]).toBeCloseTo(0.0005);
    inductor.setPoints();
    expect(inductor.lead1.equals(inductor.point1)).toBe(false);
    expect(inductor.lead2.equals(inductor.point2)).toBe(false);

    const saturating = new Inductor(simulation);
    saturating.setup(10, 0, 0, 2);
    expect(saturating.calcEffectiveInductance(0)).toBe(10);
    expect(saturating.calcEffectiveInductance(2)).toBe(5);
    expect(saturating.calcEffectiveInductance(6)).toBe(1);
    expect(saturating.nonLinear()).toBe(true);
  });

  it("preserves bus wire bit topology and values", () => {
    const wire = new WireElm(0, 0, 32, 0, 0, new StringTokenizer(""));
    wire.setPoints();
    wire.setBusWidth(4);
    wire.volts[0] = 5;
    wire.volts[1] = 0;
    wire.volts[2] = 5;
    wire.volts[3] = 5;

    expect(wire.getPostCount()).toBe(8);
    expect(wire.getBusValue()).toBe(13);
    expect(wire.getConnection(0, 4)).toBe(true);
    expect(wire.getConnection(0, 5)).toBe(false);
    expect(wire.getPost(2)).toEqual(new Point(0, 0, 2));
    expect(wire.getConnectedPost(2)).toEqual(new Point(32, 0, 2));

    wire.setWireCurrent(2, 0.25);
    expect(wire.getCurrentIntoNode(2)).toBe(-0.25);
    expect(wire.getCurrentIntoNode(6)).toBe(0.25);
  });
});

describe("sources, switches and migrated element factory", () => {
  it("instantiates every element in the original LRC example", () => {
    const source = [
      "$ 1 0.000005 10.2 50 5 43 5e-11",
      "r 176 80 384 80 0 10",
      "s 384 80 448 80 0 1 false",
      "w 176 80 176 352 0",
      "c 384 352 176 352 0 0.000015 -9.86 -10",
      "l 384 80 384 352 0 1 0.03 0",
      "v 448 352 448 80 0 0 40 5 0 0 0.5",
      "r 384 352 448 352 0 100"
    ].join("\n");
    const document = new CircuitLoader().readCircuit(source);
    if (document.format !== "text") {
      throw new Error("expected a text circuit");
    }

    const factory = new ElementFactory();
    const elements = document.records
      .filter((record) => record.kind === "element")
      .map((record) => factory.createFromRecord(record));
    expect(elements.every((element) => element !== null)).toBe(true);
    expect(elements.map((element) => element?.getClassName())).toEqual([
      "ResistorElm",
      "SwitchElm",
      "WireElm",
      "CapacitorElm",
      "InductorElm",
      "VoltageElm",
      "ResistorElm"
    ]);
  });

  it("stamps and solves an independent DC voltage source", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const voltage = new VoltageElm(
      0,
      0,
      32,
      0,
      0,
      new StringTokenizer("0 40 5 0 0 0.5")
    );
    const matrix = new CircuitMatrix(2);
    const node = new CircuitNode();
    node.row = 1;
    node.matrix = matrix;
    voltage.setNode(0, CircuitNode.ground);
    voltage.setNode(1, node);
    const source = new VoltageSource();
    source.row = 2;
    source.matrix = matrix;
    voltage.setVoltageSource(0, source);
    voltage.stamp();

    expect(matrix.rightSide[1]).toBe(5);
    expect(
      SimulationManager.lu_factor_dense(
        matrix.matrix,
        2,
        matrix.permute
      )
    ).toBe(true);
    SimulationManager.lu_solve_dense(
      matrix.matrix,
      2,
      matrix.permute,
      matrix.rightSide
    );
    expect(matrix.rightSide[0]).toBeCloseTo(5);
  });

  it("calculates source waveforms using the simulation time", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const voltage = new VoltageElm(
      0,
      0,
      32,
      0,
      0,
      new StringTokenizer("1 10 2 1 0 0.5")
    );
    simulation.t = 0;
    expect(voltage.getVoltage()).toBeCloseTo(1);
    simulation.t = 0.025;
    expect(voltage.getVoltage()).toBeCloseTo(3);
    expect(voltage.getRmsMultiplier()).toBeCloseTo(1 / Math.sqrt(2));

    voltage.waveform = VoltageElm.WF_SQUARE;
    voltage.dutyCycle = 0.25;
    simulation.t = 0;
    expect(voltage.getVoltage()).toBe(3);
    simulation.t = 0.04;
    expect(voltage.getVoltage()).toBe(-1);
  });

  it("preserves the original source-symbol lead geometry", () => {
    const battery = new VoltageElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("0 40 5 0 0 0.5")
    );
    battery.setPoints();
    expect(CircuitElm.distance(battery.lead1, battery.lead2)).toBeCloseTo(8);

    const circularSource = new VoltageElm(
      0,
      0,
      64,
      0,
      VoltageElm.FLAG_CIRCLE_SYMBOL,
      new StringTokenizer("0 40 5 0 0 0.5")
    );
    circularSource.setPoints();
    expect(
      CircuitElm.distance(circularSource.lead1, circularSource.lead2)
    ).toBeCloseTo(34);

    const rail = new RailElm(
      0,
      32,
      0,
      0,
      0,
      new StringTokenizer("0 40 5 0 0 0.5")
    );
    rail.setPoints();
    expect(CircuitElm.distance(rail.lead1, rail.point2)).toBeCloseTo(17);
  });

  it("preserves current source and switch electrical state", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const current = new CurrentElm(
      0,
      0,
      32,
      0,
      0,
      new StringTokenizer("0.02 0")
    );
    const matrix = new CircuitMatrix(1);
    const node = new CircuitNode();
    node.row = 1;
    node.matrix = matrix;
    current.setNode(0, CircuitNode.ground);
    current.setNode(1, node);
    current.stamp();
    expect(matrix.rightSide[0]).toBeCloseTo(0.02);
    expect(current.getCurrent()).toBeCloseTo(0.02);

    const openSwitch = new SwitchElm(
      0,
      0,
      32,
      0,
      0,
      new StringTokenizer("1 false")
    );
    expect(openSwitch.getConnection(0, 1)).toBe(false);
    expect(openSwitch.isWireEquivalent()).toBe(false);
    openSwitch.toggle();
    expect(openSwitch.getConnection(0, 1)).toBe(true);
    expect(openSwitch.isRemovableWire()).toBe(true);
    expect(openSwitch.dump()).toBe("s 0 0 32 0 0 0 false");
  });
});

describe("native digital logic elements", () => {
  it("registers the original logic and gate dump types", () => {
    const factory = new ElementFactory();
    const create = (type: string, argumentsText: string) =>
      factory.create(
        type,
        0,
        0,
        64,
        0,
        0,
        new StringTokenizer(argumentsText)
      );

    expect(create("L", "1 false 5 0")).toBeInstanceOf(LogicInputElm);
    expect(create("M", "2.5")).toBeInstanceOf(LogicOutputElm);
    expect(create("I", "0.5 5")).toBeInstanceOf(InverterElm);
    expect(create("150", "2 0 5")).toBeInstanceOf(AndGateElm);
    expect(create("151", "2 0 5")).toBeInstanceOf(NandGateElm);
    expect(create("152", "2 0 5")).toBeInstanceOf(OrGateElm);
    expect(create("153", "2 0 5")).toBeInstanceOf(NorGateElm);
    expect(create("154", "2 0 5")).toBeInstanceOf(XorGateElm);
  });

  it("runs a two-input AND gate and reacts to an input toggle", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "L 0 0 32 0 0 1 false 5 0",
        "L 0 32 32 32 0 1 false 5 0",
        "w 0 0 64 0 0",
        "w 0 32 64 32 0",
        "150 64 16 128 16 0 2 0 5",
        "M 128 16 160 16 0 2.5"
      ].join("\n")
    );
    runner.simulation.solverType = SimulationManager.SOLVER_SPARSE;

    runner.runCircuit();
    runner.runCircuit();
    const firstInput = runner.getElm(0) as LogicInputElm;
    const output = runner.getElm(5) as LogicOutputElm;
    expect(output.getLogicValue()).toBe("H");
    expect(output.volts[0]).toBeCloseTo(5);

    firstInput.toggle();
    runner.runCircuit();
    runner.runCircuit();
    expect(output.getLogicValue()).toBe("L");
    expect(output.volts[0]).toBeCloseTo(0);
  });

  it("preserves inverter slew behavior and gate serialization", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "L 0 0 32 0 0 0 false 5 0",
        "I 0 0 64 0 0 0.5 5",
        "M 64 0 96 0 0 2.5"
      ].join("\n")
    );
    runner.runCircuit();
    runner.runCircuit();

    const inverter = runner.getElm(1) as InverterElm;
    expect(inverter.volts[1]).toBeCloseTo(5);

    const gate = new AndGateElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("3 5 5 1e-9")
    );
    gate.setPoints();
    expect(gate.dump()).toBe("150 0 0 64 0 0 3 5 5 1e-9");
    expect(gate.getPostCount()).toBe(4);
  });
});

describe("annotations and probes", () => {
  it("round-trips escaped text without adding electrical nodes", () => {
    const text = new TextElm(
      16,
      32,
      80,
      32,
      TextElm.FLAG_ESCAPE,
      new StringTokenizer("18 First\\sline\\nSecond\\sline")
    );
    text.setPoints();

    expect(text.lines).toEqual(["First line", "Second line"]);
    expect(text.getPostCount()).toBe(0);
    expect(text.dump()).toBe(
      "x 16 32 80 32 4 18 First\\sline\\nSecond\\sline"
    );
  });

  it("loads a probe as a finite-resistance voltmeter", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 0 0 0 1000",
        "p 0 64 0 0 3 0 0 10000000",
        "x 24 32 88 32 4 16 Output\\sprobe"
      ].join("\n")
    );
    runner.runCircuit();
    const probe = runner.getElm(2) as ProbeElm;

    expect(probe.getVoltageDiff()).toBeCloseTo(5);
    expect(probe.getCurrent()).toBeCloseTo(5e-7);
    expect(probe.getDisplayValue()).toBe("5V");
    expect(runner.getElm(3)).toBeInstanceOf(TextElm);
  });
});

describe("diodes and zener models", () => {
  it("preserves legacy forward-drop and zener model calculations", () => {
    const diodeModel = DiodeModel.getModelWithParameters(0.805904783, 0);
    const zenerModel = DiodeModel.getModelWithParameters(
      0.805904783,
      5.6
    );
    const simulation = new SimulationManager();
    const diode = new Diode(simulation);

    diode.setup(diodeModel);
    expect(diode.calculateCurrent(diodeModel.fwdrop)).toBeCloseTo(1, 7);

    diode.setup(zenerModel);
    expect(diode.calculateCurrent(-5.6)).toBeCloseTo(-0.005, 7);
  });

  it("stamps the nonlinear companion and calculates element current", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const diode = new DiodeElm(
      0,
      0,
      32,
      0,
      0,
      new StringTokenizer("")
    );
    const matrix = new CircuitMatrix(1);
    const node = new CircuitNode();
    node.row = 1;
    node.matrix = matrix;
    diode.setNode(0, node);
    diode.setNode(1, CircuitNode.ground);
    diode.stamp();
    diode.volts[0] = 0.7;
    diode.volts[1] = 0;
    diode.doStep();
    diode.calculateCurrent();

    expect(matrix.matrix[0][0]).toBeGreaterThan(0);
    expect(Number.isFinite(matrix.rightSide[0])).toBe(true);
    expect(diode.getCurrent()).toBeGreaterThan(0);
    expect(simulation.converged).toBe(false);
  });

  it("loads diode and zener records through the explicit factory", () => {
    const source = [
      "$ 1 0.000005 10.2 50 5 43 5e-11",
      "d 0 0 32 0 0",
      "z 32 0 64 0 1 0.805904783 5.6"
    ].join("\n");
    const document = new CircuitLoader().readCircuit(source);
    if (document.format !== "text") {
      throw new Error("expected a text circuit");
    }

    const factory = new ElementFactory();
    const elements = document.records
      .filter((record) => record.kind === "element")
      .map((record) => factory.createFromRecord(record));
    expect(elements[0]).toBeInstanceOf(DiodeElm);
    expect(elements[1]).toBeInstanceOf(ZenerElm);
    expect((elements[1] as ZenerElm).model?.breakdownVoltage).toBe(5.6);
  });
});

describe("ground and rail topology", () => {
  it("preserves shared-ground wire equivalence", () => {
    GroundElm.resetNodeList();
    const first = new GroundElm(
      0,
      0,
      0,
      16,
      0,
      new StringTokenizer("2")
    );
    const second = new GroundElm(
      64,
      0,
      64,
      16,
      0,
      new StringTokenizer("")
    );
    first.setPoints();
    second.setPoints();

    expect(first.getPostCount()).toBe(1);
    expect(first.symbolType).toBe(2);
    expect(first.getConnectedPost()).toBeNull();
    expect(second.getConnectedPost()).toEqual(first.point1);
    expect(first.isWireEquivalent()).toBe(true);
    expect(first.hasGroundConnection(0)).toBe(true);
  });

  it("stamps a one-terminal DC rail against ground", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const rail = new RailElm(
      0,
      0,
      0,
      32,
      0,
      new StringTokenizer("0 40 3.3 0 0 0.5")
    );
    const matrix = new CircuitMatrix(2);
    const node = new CircuitNode();
    node.row = 1;
    node.matrix = matrix;
    rail.setNode(0, node);
    const source = new VoltageSource();
    source.row = 2;
    source.matrix = matrix;
    rail.setVoltageSource(0, source);
    rail.stamp();

    expect(rail.getPostCount()).toBe(1);
    expect(source.n1).toBe(CircuitNode.ground);
    expect(source.n2).toBe(node);
    expect(matrix.rightSide[1]).toBe(3.3);
  });

  it("creates legacy ground and rail records", () => {
    const factory = new ElementFactory();
    expect(
      factory.create("g", 0, 0, 0, 16, 0, new StringTokenizer("0"))
    ).toBeInstanceOf(GroundElm);
    expect(
      factory.create(
        "R",
        0,
        0,
        0,
        16,
        0,
        new StringTokenizer("0 40 5 0 0 0.5")
      )
    ).toBeInstanceOf(RailElm);
  });
});

describe("native TypeScript circuit runner", () => {
  it("accepts a header-only blank circuit", () => {
    const runner = CircuitRunner.fromText(
      "$ 1 0.000005 10.2 50 5 43 5e-11"
    );

    runner.analyzeCircuit();
    const result = runner.runCircuit();
    const nextResult = runner.runCircuit();

    expect(runner.elements).toHaveLength(0);
    expect(runner.nodeList).toHaveLength(1);
    expect(runner.matrix).toBeNull();
    expect(result).toEqual({
      converged: true,
      iterations: 0,
      time: 0
    });
    expect(nextResult.time).toBe(0);
    expect(runner.simulation.t).toBe(0);
  });

  it("analyzes and solves a complete source-resistor circuit", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 0 0 0 1000"
      ].join("\n")
    );
    const result = runner.runCircuit();
    const resistor = runner.getElm(1) as ResistorElm;

    expect(result.converged).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.time).toBe(0.000005);
    expect(resistor.getVoltageDiff()).toBeCloseTo(5);
    expect(resistor.getCurrent()).toBeCloseTo(0.005);
    expect(runner.nodeList).toHaveLength(2);
  });

  it("performs Newton iterations for a diode circuit", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 64 64 0 1000",
        "d 64 64 64 0 0",
        "w 64 0 0 0 0"
      ].join("\n")
    );
    const result = runner.runCircuit(200);
    const diode = runner.getElm(2) as DiodeElm;

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
    expect(diode.getVoltageDiff()).toBeGreaterThan(0.4);
    expect(diode.getVoltageDiff()).toBeLessThan(0.9);
    // Legacy SimulationManager retains the last solved nonlinear state once
    // the following doStep() reports convergence.  That deliberately leaves
    // the displayed diode current one Newton correction behind an algebraic
    // KCL recomputation; assert the original simulator's exact final state.
    expect(diode.getVoltageDiff()).toBeCloseTo(0.526852587893423, 12);
    expect(diode.getCurrent()).toBeCloseTo(0.004541784355001295, 12);
    const returnWire = runner.getElm(3) as WireElm;
    expect(Math.abs(returnWire.getCurrent())).toBeCloseTo(
      Math.abs(diode.getCurrent()),
      5
    );
  });

  it("reconstructs current through each segment of a wire chain", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 64 64 0 1000",
        "w 64 64 64 32 0",
        "w 64 32 64 0 0",
        "w 64 0 0 0 0"
      ].join("\n")
    );
    runner.runCircuit();

    const resistanceCurrent = Math.abs(
      (runner.getElm(1) as ResistorElm).getCurrent()
    );
    for (let index = 2; index <= 4; index += 1) {
      expect(
        Math.abs((runner.getElm(index) as WireElm).getCurrent())
      ).toBeCloseTo(resistanceCurrent, 9);
    }
  });

  it("solves an additional disconnected variable rail", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 5.0E-6 10.391409633455755 50 5.0 50",
        "r 256 176 256 304 0 100.0",
        "172 304 176 304 128 0 6 5.0 5.0 0.0 0.0 0.5 Voltage",
        "g 256 336 256 352 0",
        "w 256 304 256 336 1",
        "r 352 176 352 304 0 1000.0",
        "w 352 304 352 336 1",
        "g 352 336 352 352 0",
        "w 304 176 352 176 0",
        "w 256 176 304 176 0"
      ].join("\n")
    );

    runner.runCircuit();
    const copiedDocument = document.implementation.createDocument("", "cir");
    const copiedElement = copiedDocument.createElement("VarRail");
    runner.elements[1].dumpXml(copiedDocument, copiedElement);
    copiedDocument.documentElement.append(copiedElement);
    const copiedSource = new globalThis.XMLSerializer().serializeToString(
      copiedDocument
    );
    const extraRail = CircuitRunner.fromXml(copiedSource)
      .elements[0] as VarRailElm;
    extraRail.move(144, 0);
    runner.elements.push(extraRail);
    runner.analyzed = false;

    expect(() => runner.runCircuit()).not.toThrow();
    expect(runner.voltageSources).toHaveLength(1);
    expect(extraRail.volts[0]).toBeCloseTo(5);
    expect(extraRail.getCurrent()).toBe(0);
  });

  it("honors the sparse solver selection in the native runner", () => {
    const simulation = new SimulationManager();
    simulation.solverType = SimulationManager.SOLVER_SPARSE;
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 0 0 0 1000"
      ].join("\n"),
      new ElementFactory(),
      simulation
    );
    runner.runCircuit();

    expect(simulation.usingSparse).toBe(true);
    expect(runner.matrix?.sparseLU).toBeInstanceOf(SparseLU);
    expect((runner.getElm(1) as ResistorElm).getCurrent()).toBeCloseTo(
      0.005
    );
  });

  it("advances the repository's legacy LRC example natively", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.20027730826997 50 5 43 5e-11",
        "r 176 80 384 80 0 10",
        "s 384 80 448 80 0 1 false",
        "w 176 80 176 352 0",
        "c 384 352 176 352 0 0.000015 -9.86 -10",
        "l 384 80 384 352 0 1 0.03 0",
        "v 448 352 448 80 0 0 40 5 0 0 0.5",
        "r 384 352 448 352 0 100"
      ].join("\n")
    );
    let result = runner.runCircuit();
    result = runner.runCircuit();
    result = runner.runCircuit();

    expect(result.converged).toBe(true);
    expect(result.time).toBeCloseTo(0.000015);
    expect(
      runner.elements
        .filter((element) =>
          element.volts.some((voltage) => !Number.isFinite(voltage))
        )
        .map((element) => ({
          type: element.getClassName(),
          volts: element.volts
        }))
    ).toEqual([]);
  });

  it("grounds floating components created by an open switch", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 0 0 0 1000",
        "r 128 0 128 64 0 1000"
      ].join("\n")
    );

    expect(runner.runCircuit()).toMatchObject({ converged: true });
    expect(runner.unconnectedNodes.length).toBeGreaterThan(0);
  });

  it("instantiates and solves the XML circuit format natively", () => {
    const runner = CircuitRunner.fromXml(
      [
        '<cir f="1" ts="0.000005" mts="5e-11" st="1">',
        '  <v x="0 0 0 64" f="0" wf="0" maxv="5"/>',
        '  <r x="0 64 0 0" f="0" r="1000"/>',
        "</cir>"
      ].join("\n")
    );
    const result = runner.runCircuit();
    const resistor = runner.getElm(1) as ResistorElm;

    expect(result.converged).toBe(true);
    expect(resistor.getVoltageDiff()).toBeCloseTo(5);
    expect(resistor.getCurrent()).toBeCloseTo(0.005);
    expect(runner.simulation.solverType).toBe(
      SimulationManager.SOLVER_DENSE
    );
  });

  it("loads XML diode model records before their elements", () => {
    const runner = CircuitRunner.fromXml(
      [
        '<cir f="1" ts="0.000005">',
        '  <dm nm="xml-custom" f="0" is="1e-9" rs="0" n="1.5" bv="7.5"/>',
        '  <d x="0 0 32 0" f="2" mo="xml-custom"/>',
        "</cir>"
      ].join("\n")
    );
    const diode = runner.getElm(0) as DiodeElm;

    expect(diode.modelName).toBe("xml-custom");
    expect(diode.model?.saturationCurrent).toBe(1e-9);
    expect(diode.model?.breakdownVoltage).toBe(7.5);
  });
});

describe("MOSFET nonlinear model", () => {
  it("preserves the original digital MOSFET gate and P-channel bubble geometry", () => {
    const pMosfet = new MosfetElm(
      0,
      0,
      64,
      0,
      MosfetElm.FLAG_PNP |
        MosfetElm.FLAG_SHOWVT |
        MosfetElm.FLAG_DIGITAL,
      new StringTokenizer("1.5 0.02")
    );
    pMosfet.setPoints();

    expect(pMosfet.gate).toHaveLength(3);
    expect(pMosfet.gate[0]).toEqual(new Point(36, -8));
    expect(pMosfet.gate[1]).toEqual(new Point(28, 0));
    expect(pMosfet.gate[2]).toEqual(new Point(36, 8));
    expect(pMosfet.pcircle).toEqual(new Point(33, 0));
    expect(pMosfet.pcircler).toBe(3);
  });

  it("preserves cutoff, linear and saturation calculations", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const mosfet = new MosfetElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("1.5 0.02")
    );
    mosfet.setPoints();
    const matrix = new CircuitMatrix(2);
    const gate = new CircuitNode();
    gate.row = 1;
    gate.matrix = matrix;
    const drain = new CircuitNode();
    drain.row = 2;
    drain.matrix = matrix;
    mosfet.setNode(0, gate);
    mosfet.setNode(1, CircuitNode.ground);
    mosfet.setNode(2, drain);
    mosfet.stamp();
    mosfet.volts[0] = 5;
    mosfet.volts[1] = 0;
    mosfet.volts[2] = 5;
    mosfet.doStep();

    expect(mosfet.mode).toBe(1);
    expect(matrix.matrix[1][1]).toBeGreaterThan(0);
    mosfet.stepFinished();
    expect(mosfet.mode).toBe(2);
    expect(mosfet.getCurrent()).toBeCloseTo(0.122500015);
  });

  it("supports an explicit body terminal and factory creation", () => {
    const factory = new ElementFactory();
    const mosfet = factory.create(
      "f",
      0,
      0,
      64,
      0,
      MosfetElm.FLAG_BODY_DIODE | MosfetElm.FLAG_BODY_TERMINAL,
      new StringTokenizer("1.5 0.02")
    ) as MosfetElm;
    mosfet.setPoints();

    expect(mosfet).toBeInstanceOf(MosfetElm);
    expect(mosfet.getPostCount()).toBe(4);
    expect(mosfet.getPost(3)).toEqual(mosfet.body[0]);
  });
});

describe("BJT Gummel-Poon model", () => {
  it("preserves model defaults and voltage-dependent junction capacitance", () => {
    const model = TransistorModel.getDefaultModel();
    expect(model.satCur).toBe(1e-13);
    expect(model.emissionCoeffF).toBe(1);
    expect(model.betaR).toBe(1);
    expect(
      TransistorElm.calcJunctionCap(-1, 10e-12, 0.75, 0.33)
    ).toBeLessThan(10e-12);
    expect(
      TransistorElm.calcJunctionCap(0, 10e-12, 0.75, 0.33)
    ).toBe(10e-12);
  });

  it("stamps finite terminal currents while preserving KCL", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const transistor = new TransistorElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("1 0 0 100 default")
    );
    transistor.setPoints();
    const matrix = new CircuitMatrix(2);
    const base = new CircuitNode();
    base.row = 1;
    base.matrix = matrix;
    const collector = new CircuitNode();
    collector.row = 2;
    collector.matrix = matrix;
    transistor.setNode(0, base);
    transistor.setNode(1, collector);
    transistor.setNode(2, CircuitNode.ground);
    transistor.volts[0] = 0.7;
    transistor.volts[1] = 5;
    transistor.volts[2] = 0;
    transistor.lastvbe = 0.7;
    transistor.lastvbc = -4.3;
    transistor.stamp();
    transistor.doStep();

    expect(transistor.ic).toBeGreaterThan(0);
    expect(transistor.ib).toBeGreaterThan(0);
    expect(transistor.ic + transistor.ib + transistor.ie).toBeCloseTo(
      0,
      12
    );
    expect(
      matrix.matrix.flat().every((value) => Number.isFinite(value))
    ).toBe(true);
  });

  it("loads legacy transistor records through ElementFactory", () => {
    const transistor = new ElementFactory().create(
      "t",
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("1 0.65 -4.3 120 default")
    );
    expect(transistor).toBeInstanceOf(TransistorElm);
    expect((transistor as TransistorElm).beta).toBe(120);
    expect((transistor as TransistorElm).modelName).toBe("default");
  });

  it("runs a common-emitter circuit through native Newton iteration", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "v 0 0 0 64 0 0 40 5 0 0 0.5",
        "r 0 64 64 64 0 100000",
        "r 0 64 128 48 0 1000",
        "t 64 64 128 64 0 1 0.65 -4.3 100 default",
        "w 128 80 0 0 0"
      ].join("\n")
    );
    const result = runner.runCircuit(300);
    const transistor = runner.getElm(3) as TransistorElm;

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(1);
    expect(transistor.ib).toBeGreaterThan(0);
    expect(transistor.ic).toBeGreaterThan(transistor.ib);
    expect(transistor.volts[0]).toBeGreaterThan(0.5);
    expect(transistor.volts[0]).toBeLessThan(0.9);
  });
});

describe("JFET model", () => {
  it("uses the depletion threshold and gate junction diode", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const jfet = new JfetElm(
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("-4 0.00125")
    );
    jfet.setPoints();
    const matrix = new CircuitMatrix(1);
    const drain = new CircuitNode();
    drain.row = 1;
    drain.matrix = matrix;
    jfet.setNode(0, CircuitNode.ground);
    jfet.setNode(1, CircuitNode.ground);
    jfet.setNode(2, drain);
    jfet.stamp();
    jfet.volts[0] = 0;
    jfet.volts[1] = 0;
    jfet.volts[2] = 5;
    jfet.doStep();
    jfet.calculateCurrent();
    jfet.stepFinished();

    expect(jfet.vt).toBe(-4);
    expect(jfet.getCurrent()).toBeGreaterThan(0);
    expect(jfet.gateCurrent).toBeCloseTo(0, 12);
    expect(matrix.matrix[0][0]).toBeGreaterThan(0);
  });

  it("is registered under the legacy j dump type", () => {
    const element = new ElementFactory().create(
      "j",
      0,
      0,
      64,
      0,
      0,
      new StringTokenizer("-4 0.00125")
    );
    expect(element).toBeInstanceOf(JfetElm);
  });
});

describe("operational amplifier", () => {
  it("runs a native unity-gain follower", () => {
    const runner = CircuitRunner.fromText(
      [
        "$ 1 0.000005 10.2 50 5 43 5e-11",
        "R 0 16 0 32 0 0 40 1 0 0 0.5",
        "a 0 0 64 0 8 15 -15 1000000 0 0 100000",
        "w 64 0 0 -16 0"
      ].join("\n")
    );
    const result = runner.runCircuit(100);
    const opAmp = runner.getElm(1) as OpAmpElm;

    expect(result.converged).toBe(true);
    expect(opAmp.volts[1]).toBeCloseTo(1);
    expect(opAmp.volts[2]).toBeCloseTo(1, 4);
    expect(opAmp.volts[1] - opAmp.volts[0]).toBeCloseTo(
      1 / opAmp.gain,
      5
    );
  });

  it("limits open-loop output to the configured rails", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const opAmp = new OpAmpElm(
      0,
      0,
      64,
      0,
      OpAmpElm.FLAG_GAIN,
      new StringTokenizer("12 -10 1000000 0 0 100000")
    );
    opAmp.setPoints();
    const matrix = new CircuitMatrix(4);
    const minus = new CircuitNode();
    minus.row = 1;
    minus.matrix = matrix;
    const plus = new CircuitNode();
    plus.row = 2;
    plus.matrix = matrix;
    const output = new CircuitNode();
    output.row = 3;
    output.matrix = matrix;
    const source = new VoltageSource();
    source.row = 4;
    source.matrix = matrix;
    opAmp.setNode(0, minus);
    opAmp.setNode(1, plus);
    opAmp.setNode(2, output);
    opAmp.setVoltageSource(0, source);
    opAmp.volts[0] = 0;
    opAmp.volts[1] = 1;
    opAmp.stamp();
    opAmp.doStep();

    expect(matrix.rightSide[3]).toBeCloseTo(12, 6);
  });
});

describe("specialized sources", () => {
  it("preserves AC rail and digital clock defaults", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const acRail = new ACRailElm(0, 0);
    const clock = new ClockElm(0, 0);

    expect(acRail.waveform).toBe(VoltageElm.WF_AC);
    expect(acRail.maxVoltage).toBeCloseTo(120 * Math.sqrt(2));
    expect(clock.waveform).toBe(VoltageElm.WF_SQUARE);
    expect(clock.maxVoltage).toBe(2.5);
    expect(clock.bias).toBe(2.5);
    expect(clock.frequency).toBe(100);
    expect(clock.hasFlag(RailElm.FLAG_CLOCK)).toBe(true);
  });

  it("calculates AM, FM and antenna source signals", () => {
    const simulation = new SimulationManager();
    CircuitElm.initClass(simulation);
    const am = new AMElm(
      0,
      0,
      0,
      32,
      0,
      new StringTokenizer("1000 40 5")
    );
    const fm = new FMElm(
      0,
      0,
      0,
      32,
      0,
      new StringTokenizer("800 40 5 200")
    );
    const antenna = new AntennaElm(0, 0);

    simulation.t = 0.00025;
    expect(Number.isFinite(am.getVoltage())).toBe(true);
    expect(Number.isFinite(fm.getVoltage())).toBe(true);
    expect(fm.deviation).toBe(200);
    const before = antenna.fmphase;
    antenna.stepFinished();
    expect(antenna.fmphase).toBeGreaterThan(before);
    expect(Number.isFinite(antenna.getVoltage())).toBe(true);
  });

  it("registers legacy numeric modulation dump types", () => {
    const factory = new ElementFactory();
    expect(
      factory.create(
        "200",
        0,
        0,
        0,
        32,
        0,
        new StringTokenizer("1000 40 5")
      )
    ).toBeInstanceOf(AMElm);
    expect(
      factory.create(
        "201",
        0,
        0,
        0,
        32,
        0,
        new StringTokenizer("800 40 5 200")
      )
    ).toBeInstanceOf(FMElm);
  });
});
