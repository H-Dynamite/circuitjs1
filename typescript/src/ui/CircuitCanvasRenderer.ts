import {
  AmmeterElm,
  AndGateElm,
  AnalogSwitchElm,
  AnalogSwitch2Elm,
  AudioInputElm,
  AudioOutputElm,
  BoxElm,
  BusLogicInputElm,
  CapacitorElm,
  ChipElm,
  CircuitElm,
  CrystalElm,
  CustomTransformerElm,
  CurrentElm,
  DataInputElm,
  DataRecorderElm,
  DCMotorElm,
  DecimalDisplayElm,
  DelayBufferElm,
  DiacElm,
  DiodeElm,
  DPDTSwitchElm,
  FuseElm,
  GroundElm,
  GyratorElm,
  GateElm,
  InductorElm,
  InstructionDisplayElm,
  InverterElm,
  InvertingSchmittElm,
  JfetElm,
  LampElm,
  LDRElm,
  LEDElm,
  LabeledNodeElm,
  LineElm,
  LogicInputElm,
  LogicOutputElm,
  MemristorElm,
  MBBSwitchElm,
  MosfetElm,
  MotorProtectionSwitchElm,
  OpAmpElm,
  OpAmpRealElm,
  OptocouplerElm,
  OTAElm,
  OhmMeterElm,
  OrGateElm,
  OutputElm,
  Point,
  PotElm,
  PolarCapacitorElm,
  ProbeElm,
  RailElm,
  ResistorElm,
  RelayElm,
  RelayCoilElm,
  RelayContactElm,
  RoutedWireElm,
  ScopeElm,
  SCRElm,
  SchmittElm,
  SevenSegElm,
  StopTriggerElm,
  SparkGapElm,
  SwitchElm,
  Switch2Elm,
  SweepElm,
  TappedTransformerElm,
  TextElm,
  TestPointElm,
  ThermistorNTCElm,
  TransistorElm,
  TransformerElm,
  TransLineElm,
  ThreePhaseMotorElm,
  TriacElm,
  TriodeElm,
  TriStateElm,
  UnijunctionElm,
  VoltageElm,
  WattmeterElm,
  WireElm,
  TunnelDiodeElm,
  ZenerElm
} from "../core";

export interface CircuitViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface DraftElement {
  start: Point;
  end: Point;
}

const CURRENT_TOO_FAST = 100;

export function calculateCurrentDotAdvance(
  current: number,
  elapsedMilliseconds: number,
  currentSpeed: number
): number {
  const sliderValue = Math.min(100, Math.max(1, currentSpeed));
  const speedScale = Math.exp(sliderValue / 3.5 - 14.2);
  return current * 1.7 * elapsedMilliseconds * speedScale;
}

export function shouldDrawCurrentDots(
  current: number,
  dotPosition: number
): boolean {
  return (
    Number.isFinite(current) &&
    Number.isFinite(dotPosition) &&
    dotPosition !== 0
  );
}

export function getCurrentDotAnimationCurrent(element: CircuitElm): number {
  if (element instanceof RailElm) {
    // RailElm's MNA source current is defined from ground toward the post,
    // while its visible lead is drawn from the post toward the source label.
    return -element.getCurrent();
  }
  if (element instanceof MosfetElm) {
    return -element.ids;
  }
  if (element instanceof MotorProtectionSwitchElm) {
    return element.currents[0] ?? 0;
  }
  return element.getCurrent();
}

interface ModelBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function boundsForPoints(
  points: Array<{ x: number; y: number }>,
  padding: number
): ModelBounds {
  return {
    left: Math.min(...points.map((point) => point.x)) - padding,
    top: Math.min(...points.map((point) => point.y)) - padding,
    right: Math.max(...points.map((point) => point.x)) + padding,
    bottom: Math.max(...points.map((point) => point.y)) + padding
  };
}

export function getSwitchInteractionBounds(
  element: SwitchElm,
  padding = 0
): ModelBounds {
  if (element instanceof Switch2Elm) {
    return boundsForPoints(
      [
        element.lead1,
        ...element.swpoles.slice(0, element.throwCount)
      ],
      padding
    );
  }
  const raisedContact = {
    x: element.lead1.x + element.dpx1 * 16,
    y: element.lead1.y + element.dpy1 * 16
  };
  return boundsForPoints(
    [element.lead1, element.lead2, raisedContact],
    padding
  );
}

function isLogicInputHotZone(
  element: CircuitElm,
  model: { x: number; y: number }
): boolean {
  if (!(element instanceof LogicInputElm || element instanceof BusLogicInputElm)) {
    return false;
  }
  // Matches the legacy getSwitchRect(): the visible logic label is a 20x20
  // model-space control centred at point2, not the attached wire segment.
  return Math.abs(model.x - element.x2) <= 10 && Math.abs(model.y - element.y2) <= 10;
}

export class CircuitCanvasRenderer {
  public showCurrent = true;
  public showVoltage = true;
  public showPower = false;
  public showValues = true;
  public smallGrid = false;
  public whiteBackground = false;
  public conventionalCurrent = false;
  public europeanResistors = true;
  public iecGates = false;
  public positiveColor = "#20ff40";
  public negativeColor = "#ff2828";
  public neutralColor = "#a3a3a3";
  public selectionColor = "#38bdf8";
  public currentColor = "#ffe600";
  public crosshair: { x: number; y: number } | null = null;

  public readonly viewport: CircuitViewport = {
    scale: 1,
    offsetX: 0,
    offsetY: 0
  };

  public fit(elements: CircuitElm[], width: number, height: number): void {
    if (elements.length === 0) {
      this.viewport.scale = 1;
      this.viewport.offsetX = width / 2;
      this.viewport.offsetY = height / 2;
      return;
    }

    const xs = elements.flatMap((element) => [element.x, element.x2]);
    const ys = elements.flatMap((element) => [element.y, element.y2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const circuitWidth = Math.max(maxX - minX, 160);
    const circuitHeight = Math.max(maxY - minY, 120);
    const scale = Math.min(
      1.8,
      Math.max(
        0.45,
        Math.min(
          (Math.max(width, 320) - 140) / circuitWidth,
          (Math.max(height, 240) - 110) / circuitHeight
        )
      )
    );

    this.viewport.scale = scale;
    this.viewport.offsetX =
      (width - (minX + maxX) * scale) / 2;
    this.viewport.offsetY =
      (height - (minY + maxY) * scale) / 2;
  }

  public modelToScreen(point: Point): { x: number; y: number } {
    return {
      x: point.x * this.viewport.scale + this.viewport.offsetX,
      y: point.y * this.viewport.scale + this.viewport.offsetY
    };
  }

  public screenToModel(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.viewport.offsetX) / this.viewport.scale,
      y: (y - this.viewport.offsetY) / this.viewport.scale
    };
  }

  public zoomAt(
    screenX: number,
    screenY: number,
    factor: number
  ): void {
    const before = this.screenToModel(screenX, screenY);
    this.viewport.scale = Math.min(
      4,
      Math.max(0.25, this.viewport.scale * factor)
    );
    this.viewport.offsetX =
      screenX - before.x * this.viewport.scale;
    this.viewport.offsetY =
      screenY - before.y * this.viewport.scale;
  }

  public pan(dx: number, dy: number): void {
    this.viewport.offsetX += dx;
    this.viewport.offsetY += dy;
  }

  public hitTest(
    elements: CircuitElm[],
    screenX: number,
    screenY: number
  ): number | null {
    const model = this.screenToModel(screenX, screenY);
    const threshold = 12 / this.viewport.scale;
    let bestIndex: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    elements.forEach((element, index) => {
      if (isLogicInputHotZone(element, model)) {
        bestDistance = -1;
        bestIndex = index;
        return;
      }
      if (element instanceof SwitchElm) {
        const bounds = getSwitchInteractionBounds(
          element,
          10 / this.viewport.scale
        );
        if (
          model.x >= bounds.left &&
          model.x <= bounds.right &&
          model.y >= bounds.top &&
          model.y <= bounds.bottom
        ) {
          bestDistance = -1;
          bestIndex = index;
        }
        return;
      }
      const distance = CircuitCanvasRenderer.distanceToSegment(
        model.x,
        model.y,
        element.x,
        element.y,
        element.x2,
        element.y2
      );
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  public render(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    elements: CircuitElm[],
    selectedIndices: ReadonlySet<number>,
    currentAnimationElapsedMs: number,
    currentSpeed: number,
    draft: DraftElement | null,
    selectionBox: DraftElement | null
  ): void {
    context.clearRect(0, 0, width, height);
    context.fillStyle = this.whiteBackground ? "#ffffff" : "#050505";
    context.fillRect(0, 0, width, height);
    this.drawGrid(context, width, height);

    elements.forEach((element, index) => {
      this.drawElement(
        context,
        element,
        selectedIndices.has(index),
        currentAnimationElapsedMs,
        currentSpeed
      );
    });

    if (selectionBox !== null) {
      const start = this.modelToScreen(selectionBox.start);
      const end = this.modelToScreen(selectionBox.end);
      const left = Math.min(start.x, end.x);
      const top = Math.min(start.y, end.y);
      context.save();
      context.strokeStyle = this.selectionColor;
      context.lineWidth = 1;
      context.setLineDash([]);
      context.strokeRect(
        Math.round(left) + 0.5,
        Math.round(top) + 0.5,
        Math.round(Math.abs(end.x - start.x)),
        Math.round(Math.abs(end.y - start.y))
      );
      context.restore();
    }

    if (draft !== null) {
      const start = this.modelToScreen(draft.start);
      const end = this.modelToScreen(draft.end);
      context.save();
      context.strokeStyle = "#60a5fa";
      context.lineWidth = 2;
      context.setLineDash([6, 5]);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.restore();
    }
    if (this.crosshair !== null) {
      context.save();
      context.strokeStyle = this.whiteBackground ? "#94a3b8" : "#475569";
      context.lineWidth = 1;
      context.setLineDash([3, 3]);
      this.line(context, this.crosshair.x, 0, this.crosshair.x, height);
      this.line(context, 0, this.crosshair.y, width, this.crosshair.y);
      context.restore();
    }
  }

  private drawGrid(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    const grid = (this.smallGrid ? 8 : 16) * this.viewport.scale;
    if (grid < 9) {
      return;
    }
    const startX =
      ((this.viewport.offsetX % grid) + grid) % grid;
    const startY =
      ((this.viewport.offsetY % grid) + grid) % grid;
    context.save();
    context.fillStyle = this.whiteBackground ? "#d8dee8" : "#171717";
    for (let x = startX; x < width; x += grid) {
      for (let y = startY; y < height; y += grid) {
        context.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
    context.restore();
  }

  private drawElement(
    context: CanvasRenderingContext2D,
    element: CircuitElm,
    selected: boolean,
    currentAnimationElapsedMs: number,
    currentSpeed: number
  ): void {
    const post1 = this.modelToScreen(element.point1);
    const post2 = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const averageVoltage =
      element.volts.length === 0
        ? 0
        : element.volts.reduce((sum, value) => sum + value, 0) /
          element.volts.length;
    const color = this.showPower
      ? this.powerColor(element.getPower())
      : this.showVoltage
        ? this.voltageColor(averageVoltage)
        : this.foregroundColor();

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = selected ? 4 : 3;
    context.strokeStyle = selected ? this.selectionColor : color;
    context.fillStyle = context.strokeStyle;

    if (element instanceof RoutedWireElm) {
      this.drawRoutedWire(context, element);
    } else if (element instanceof WireElm) {
      this.drawWire(context, element, post1, post2);
    } else if (element instanceof LineElm) {
      this.line(context, post1.x, post1.y, post2.x, post2.y);
    } else if (element instanceof ScopeElm) {
      this.drawEmbeddedScope(context, element);
    } else if (element instanceof TextElm) {
      this.drawTextElement(context, element);
    } else if (element instanceof ProbeElm) {
      this.drawProbe(context, element);
    } else if (element instanceof TestPointElm) {
      this.drawTestPoint(context, element);
    } else if (element instanceof StopTriggerElm) {
      this.drawStopTrigger(context, element);
    } else if (element instanceof LogicInputElm) {
      this.drawLogicTerminal(
        context,
        element.getLogicValue(),
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof LogicOutputElm) {
      this.drawLogicTerminal(
        context,
        element.getLogicValue(),
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof OutputElm) {
      this.drawLogicTerminal(
        context,
        element.getDisplayValue(),
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof LabeledNodeElm) {
      this.drawLabeledNode(context, element);
    } else if (element instanceof AudioInputElm) {
      this.drawLogicTerminal(
        context,
        element.fileName,
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof AudioOutputElm) {
      this.drawLogicTerminal(
        context,
        element.labelNum > 1
          ? `Audio ${element.labelNum}`
          : "Audio Out",
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof DataInputElm) {
      this.drawLogicTerminal(
        context,
        element.fileName,
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof DataRecorderElm) {
      this.drawLogicTerminal(
        context,
        `REC ${element.dataFull ? element.dataCount : element.dataPointer}`,
        post1,
        this.modelToScreen(element.lead1),
        post2
      );
    } else if (element instanceof InstructionDisplayElm) {
      this.drawInstructionDisplay(context, element);
    } else if (element instanceof BusLogicInputElm) {
      this.drawBusLogicInput(context, element);
    } else if (element instanceof AmmeterElm) {
      this.drawMeterCircle(context, element, "A");
    } else if (element instanceof BoxElm) {
      this.drawBox(context, element);
    } else if (element instanceof SweepElm) {
      this.drawSweep(context, element);
    } else if (element instanceof DelayBufferElm) {
      this.drawBuffer(context, element);
    } else if (element instanceof InverterElm) {
      this.drawInverter(context, element);
    } else if (element instanceof SchmittElm) {
      this.drawSchmitt(context, element, false);
    } else if (element instanceof InvertingSchmittElm) {
      this.drawSchmitt(context, element, true);
    } else if (element instanceof GateElm) {
      this.drawGate(context, element);
    } else if (element instanceof DecimalDisplayElm) {
      this.drawDecimalDisplay(context, element);
    } else if (element instanceof SevenSegElm) {
      this.drawSevenSegmentDisplay(context, element);
    } else if (element instanceof ChipElm) {
      this.drawChip(context, element);
    } else if (element instanceof CustomTransformerElm) {
      this.drawCustomTransformer(context, element);
    } else if (element instanceof TransformerElm) {
      this.drawTransformer(context, element);
    } else if (element instanceof TappedTransformerElm) {
      this.drawTappedTransformer(context, element);
    } else if (element instanceof TransLineElm) {
      this.drawTransmissionLine(context, element);
    } else if (element instanceof RelayElm) {
      this.drawRelay(context, element);
    } else if (element instanceof RelayCoilElm) {
      this.drawRelayCoil(context, element);
    } else if (element instanceof RelayContactElm) {
      this.drawRelayContact(context, element);
    } else if (element instanceof AnalogSwitch2Elm) {
      this.drawAnalogSwitch2(context, element);
    } else if (element instanceof AnalogSwitchElm) {
      this.drawAnalogSwitch(context, element);
    } else if (element instanceof JfetElm) {
      this.drawFet(context, element, true);
    } else if (element instanceof MosfetElm) {
      this.drawFet(context, element, false);
    } else if (element instanceof TransistorElm) {
      this.drawTransistor(context, element);
    } else if (element instanceof UnijunctionElm) {
      this.drawUnijunction(context, element, selected);
    } else if (element instanceof SCRElm) {
      this.drawScr(context, element);
    } else if (element instanceof TriodeElm) {
      this.drawTriode(context, element);
    } else if (element instanceof MotorProtectionSwitchElm) {
      this.drawMotorProtectionSwitch(context, element);
    } else if (element instanceof ThreePhaseMotorElm) {
      this.drawThreePhaseMotor(
        context,
        element,
        currentAnimationElapsedMs,
        currentSpeed
      );
    } else if (element instanceof LampElm) {
      this.drawLamp(context, element);
    } else if (element instanceof DCMotorElm) {
      this.drawDcMotor(context, element);
    } else if (element instanceof CrystalElm) {
      this.drawCrystal(context, element);
    } else if (element instanceof FuseElm) {
      this.drawFuse(context, element);
    } else if (element instanceof LDRElm) {
      this.drawVariableResistor(
        context,
        element,
        `${Math.round(element.lux)} lx`
      );
    } else if (element instanceof ThermistorNTCElm) {
      this.drawVariableResistor(
        context,
        element,
        `${element.temperature} °C`
      );
    } else if (element instanceof TriStateElm) {
      this.drawTriState(context, element);
    } else if (element instanceof WattmeterElm) {
      this.drawWattmeter(context, element);
    } else if (element instanceof ResistorElm) {
      this.drawResistiveElement(
        context,
        element,
        post1,
        lead1,
        lead2,
        post2,
        selected
      );
      this.drawLabel(
        context,
        CircuitElm.getShortUnitText(element.resistance, ""),
        post1,
        post2
      );
    } else if (element instanceof MemristorElm) {
      this.drawResistiveElement(
        context,
        element,
        post1,
        lead1,
        lead2,
        post2,
        selected
      );
      this.drawLabel(
        context,
        CircuitElm.getShortUnitText(element.resistance, ""),
        post1,
        post2
      );
    } else if (element instanceof PotElm) {
      this.drawPot(context, element);
    } else if (element instanceof PolarCapacitorElm) {
      this.drawCapacitor(context, element, selected);
      this.drawPolarMark(context, post1, post2);
      this.drawLabel(
        context,
        CircuitElm.getShortUnitText(element.capacitance, "F"),
        post1,
        post2
      );
    } else if (element instanceof CapacitorElm) {
      this.drawCapacitor(context, element, selected);
      this.drawLabel(
        context,
        CircuitElm.getShortUnitText(element.capacitance, "F"),
        post1,
        post2
      );
    } else if (element instanceof InductorElm) {
      this.drawInductiveElement(
        context,
        element,
        post1,
        lead1,
        lead2,
        post2,
        selected
      );
      this.drawLabel(
        context,
        CircuitElm.getShortUnitText(element.inductance, "H"),
        post1,
        post2
      );
    } else if (element instanceof DPDTSwitchElm) {
      this.drawDpdtSwitch(context, element);
    } else if (element instanceof MBBSwitchElm) {
      this.drawMbbSwitch(context, element);
    } else if (element instanceof Switch2Elm) {
      this.drawSwitch2(context, element, selected);
    } else if (element instanceof SwitchElm) {
      this.drawSwitch(context, element, post1, lead1, lead2, post2);
    } else if (element instanceof RailElm) {
      this.drawRailSource(context, element);
    } else if (element instanceof VoltageElm) {
      this.drawVoltageSource(
        context,
        element,
        post1,
        post2,
        selected
      );
    } else if (element instanceof OhmMeterElm) {
      this.drawOhmMeter(context, element);
    } else if (element instanceof CurrentElm) {
      this.drawCurrentSource(context, post1, post2);
    } else if (element instanceof GyratorElm) {
      this.drawGyrator(context, element);
    } else if (element instanceof GroundElm) {
      this.drawGround(context, post1, post2);
    } else if (element instanceof LEDElm) {
      this.drawLed(context, element);
    } else if (element instanceof TunnelDiodeElm) {
      this.drawTunnelDiode(context, element);
    } else if (element instanceof SparkGapElm) {
      this.drawSparkGap(context, element);
    } else if (element instanceof TriacElm) {
      this.drawTriac(context, element);
    } else if (element instanceof DiacElm) {
      this.drawDiac(context, element);
    } else if (
      element instanceof DiodeElm ||
      element instanceof ZenerElm
    ) {
      this.drawDiode(
        context,
        post1,
        post2,
        element instanceof ZenerElm
      );
    } else if (element instanceof OpAmpRealElm) {
      this.drawRealOpAmp(context, element);
    } else if (element instanceof OptocouplerElm) {
      this.drawOptocoupler(context, element);
    } else if (element instanceof OpAmpElm) {
      this.drawOpAmp(context, element);
    } else if (element instanceof OTAElm) {
      this.drawOta(context, element);
    } else {
      this.drawGenericElement(context, element, post1, post2);
    }

    this.drawPosts(context, element);
    if (selected) {
      this.drawSelection(context, element);
    }
    const animationCurrent = getCurrentDotAnimationCurrent(element);
    const dotPosition = this.updateCurrentDotPosition(
      element,
      animationCurrent,
      currentAnimationElapsedMs,
      currentSpeed
    );
    if (element instanceof PotElm) {
      this.drawPotCurrentDots(
        context,
        element,
        currentAnimationElapsedMs,
        currentSpeed
      );
    } else if (element instanceof Switch2Elm) {
      this.drawSwitch2CurrentDots(
        context,
        element,
        dotPosition
      );
    } else if (element instanceof CapacitorElm) {
      this.drawCapacitorCurrentDots(
        context,
        element,
        dotPosition
      );
    } else if (element instanceof RailElm) {
      this.drawCurrentDots(
        context,
        post1,
        this.modelToScreen(element.lead1),
        -element.getCurrent(),
        dotPosition
      );
    } else if (
      element instanceof VoltageElm &&
      !(element instanceof RailElm)
    ) {
      this.drawVoltageSourceCurrentDots(
        context,
        element,
        dotPosition
      );
    } else if (element instanceof MosfetElm) {
      this.drawFetCurrentDots(
        context,
        element,
        dotPosition
      );
    } else if (element instanceof UnijunctionElm) {
      this.drawUnijunctionCurrentDots(
        context,
        element,
        currentAnimationElapsedMs,
        currentSpeed
      );
    } else if (element instanceof SCRElm) {
      this.drawScrCurrentDots(context, element, dotPosition);
    } else if (element instanceof TriodeElm) {
      this.drawTriodeCurrentDots(context, element, dotPosition);
    } else if (element instanceof MotorProtectionSwitchElm) {
      this.drawMotorProtectionCurrentDots(
        context,
        element,
        dotPosition
      );
    } else if (element instanceof TappedTransformerElm) {
      this.drawTappedTransformerCurrentDots(
        context,
        element,
        dotPosition
      );
    } else if (element instanceof ThreePhaseMotorElm) {
      // Drawn before the motor housing so dots do not show through it.
    } else if (element instanceof GyratorElm) {
      this.drawGyratorCurrentDots(context, element, dotPosition);
    } else {
      this.drawCurrentDots(
        context,
        post1,
        post2,
        element.getCurrent(),
        dotPosition
      );
    }
    context.restore();
  }

  private drawResistor(
    context: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    const { ux, uy, px, py, length } =
      CircuitCanvasRenderer.direction(start, end);
    const amplitude = Math.min(7, length / 5);
    if (this.europeanResistors) {
      context.save();
      context.translate(start.x, start.y);
      context.rotate(Math.atan2(uy, ux));
      context.strokeRect(0, -amplitude, length, amplitude * 2);
      context.restore();
      return;
    }
    context.beginPath();
    context.moveTo(start.x, start.y);
    const segments = 8;
    for (let index = 1; index < segments; index += 1) {
      const fraction = index / segments;
      const offset = index % 2 === 0 ? -amplitude : amplitude;
      context.lineTo(
        start.x + ux * length * fraction + px * offset,
        start.y + uy * length * fraction + py * offset
      );
    }
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  private drawResistiveElement(
    context: CanvasRenderingContext2D,
    element: ResistorElm | MemristorElm,
    post1: { x: number; y: number },
    lead1: { x: number; y: number },
    lead2: { x: number; y: number },
    post2: { x: number; y: number },
    selected: boolean
  ): void {
    if (selected || !this.showVoltage || this.showPower) {
      this.drawLeads(context, post1, lead1, lead2, post2);
      this.drawResistor(context, lead1, lead2);
      return;
    }

    context.save();
    context.strokeStyle = this.voltageColor(element.volts[0] ?? 0);
    this.line(context, post1.x, post1.y, lead1.x, lead1.y);
    context.strokeStyle = this.voltageColor(element.volts[1] ?? 0);
    this.line(context, lead2.x, lead2.y, post2.x, post2.y);
    const gradient = context.createLinearGradient(
      lead1.x,
      lead1.y,
      lead2.x,
      lead2.y
    );
    gradient.addColorStop(0, this.voltageColor(element.volts[0] ?? 0));
    gradient.addColorStop(1, this.voltageColor(element.volts[1] ?? 0));
    context.strokeStyle = gradient;
    this.drawResistor(context, lead1, lead2);
    context.restore();
  }

  private drawWire(
    context: CanvasRenderingContext2D,
    element: WireElm,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    this.line(context, start.x, start.y, end.x, end.y);

    let label = "";
    if (element.busWidth > 1) {
      const value = element.getBusValue();
      if (element.mustShowBusValue()) {
        label = String(value);
      }
      if (element.mustShowBusValueHex()) {
        label +=
          `${label.length > 0 ? " " : ""}0x` +
          value.toString(16).toUpperCase();
      }
    } else {
      if (element.mustShowCurrent()) {
        label = CircuitElm.getShortUnitText(
          Math.abs(element.getCurrent()),
          "A"
        );
      }
      if (element.mustShowVoltage()) {
        label +=
          `${label.length > 0 ? " " : ""}` +
          CircuitElm.getShortUnitText(element.volts[0] ?? 0, "V");
      }
    }

    if (label.length > 0) {
      this.drawLabel(context, label, start, end, 4, false);
    }
  }

  private drawVariableResistor(
    context: CanvasRenderingContext2D,
    element: LDRElm | ThermistorNTCElm,
    detail: string
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    this.drawLeads(context, first, lead1, lead2, second);
    this.drawResistor(context, lead1, lead2);
    this.drawLabel(context, detail, first, second);
  }

  private drawFuse(
    context: CanvasRenderingContext2D,
    element: FuseElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    this.drawLeads(context, first, lead1, lead2, second);
    if (!element.blown) {
      const direction = CircuitCanvasRenderer.direction(lead1, lead2);
      context.beginPath();
      context.moveTo(lead1.x, lead1.y);
      for (let index = 1; index <= 16; index += 1) {
        const fraction = index / 16;
        const offset =
          Math.sin(fraction * Math.PI * 2) *
          5 *
          this.viewport.scale;
        context.lineTo(
          lead1.x + direction.ux * direction.length * fraction +
            direction.px * offset,
          lead1.y + direction.uy * direction.length * fraction +
            direction.py * offset
        );
      }
      context.stroke();
    }
    this.drawLabel(
      context,
      element.blown ? "熔断" : "Fuse",
      first,
      second
    );
  }

  private drawOhmMeter(
    context: CanvasRenderingContext2D,
    element: OhmMeterElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const radius = Math.min(13 * this.viewport.scale, direction.length / 3);
    this.line(
      context,
      first.x,
      first.y,
      center.x - direction.ux * radius,
      center.y - direction.uy * radius
    );
    this.line(
      context,
      center.x + direction.ux * radius,
      center.y + direction.uy * radius,
      second.x,
      second.y
    );
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `bold ${Math.max(10, 14 * this.viewport.scale)}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("Ω", center.x, center.y);
    context.restore();
  }

  private drawBuffer(
    context: CanvasRenderingContext2D,
    element: DelayBufferElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const direction = CircuitCanvasRenderer.direction(lead1, lead2);
    const halfHeight = 14 * this.viewport.scale;
    this.line(context, first.x, first.y, lead1.x, lead1.y);
    this.line(context, lead2.x, lead2.y, second.x, second.y);
    context.beginPath();
    context.moveTo(
      lead1.x + direction.px * halfHeight,
      lead1.y + direction.py * halfHeight
    );
    context.lineTo(
      lead1.x - direction.px * halfHeight,
      lead1.y - direction.py * halfHeight
    );
    context.lineTo(lead2.x, lead2.y);
    context.closePath();
    context.stroke();
    this.drawLabel(
      context,
      CircuitElm.getShortUnitText(element.delay, "s"),
      first,
      second
    );
  }

  private drawTriState(
    context: CanvasRenderingContext2D,
    element: TriStateElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const control = this.modelToScreen(element.point3);
    const direction = CircuitCanvasRenderer.direction(lead1, lead2);
    const halfHeight = 15 * this.viewport.scale;
    this.line(context, first.x, first.y, lead1.x, lead1.y);
    this.line(context, lead2.x, lead2.y, second.x, second.y);
    context.beginPath();
    context.moveTo(
      lead1.x + direction.px * halfHeight,
      lead1.y + direction.py * halfHeight
    );
    context.lineTo(
      lead1.x - direction.px * halfHeight,
      lead1.y - direction.py * halfHeight
    );
    context.lineTo(lead2.x, lead2.y);
    context.closePath();
    context.stroke();
    this.line(
      context,
      control.x,
      control.y,
      (lead1.x + lead2.x) / 2,
      (lead1.y + lead2.y) / 2
    );
  }

  private drawDpdtSwitch(
    context: CanvasRenderingContext2D,
    element: DPDTSwitchElm
  ): void {
    for (let pole = 0; pole < element.poleCount; pole += 1) {
      const common = this.modelToScreen(element.getPost(pole * 3));
      const first = this.modelToScreen(element.getPost(pole * 3 + 1));
      const second = this.modelToScreen(element.getPost(pole * 3 + 2));
      const selected = element.position === 0 ? first : second;
      this.line(context, common.x, common.y, selected.x, selected.y);
      context.save();
      context.globalAlpha = 0.45;
      this.line(context, first.x, first.y, second.x, second.y);
      context.restore();
    }
  }

  private drawMbbSwitch(
    context: CanvasRenderingContext2D,
    element: MBBSwitchElm
  ): void {
    const common = this.modelToScreen(element.getPost(0));
    const first = this.modelToScreen(element.getPost(1));
    const second = this.modelToScreen(element.getPost(2));
    if (element.both || element.position === 0) {
      this.line(context, common.x, common.y, first.x, first.y);
    }
    if (element.both || element.position === 2) {
      this.line(context, common.x, common.y, second.x, second.y);
    }
  }

  private drawTestPoint(
    context: CanvasRenderingContext2D,
    element: TestPointElm
  ): void {
    const post = this.modelToScreen(element.point1);
    const label = this.modelToScreen(element.point2);
    this.line(context, post.x, post.y, label.x, label.y);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "13px Arial";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(
      `${element.label} ${CircuitElm.getShortUnitText(
        element.selectedValue,
        element.meter === TestPointElm.TP_FRQ ? "Hz" : "V"
      )}`,
      label.x + 5,
      label.y
    );
    context.restore();
  }

  private drawStopTrigger(
    context: CanvasRenderingContext2D,
    element: StopTriggerElm
  ): void {
    const post = this.modelToScreen(element.point1);
    const label = this.modelToScreen(element.point2);
    this.line(context, post.x, post.y, label.x, label.y);
    context.save();
    context.fillStyle = element.stopped
      ? "#fb7185"
      : this.foregroundColor();
    context.font = "13px Arial";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("TRIGGER", label.x + 5, label.y);
    context.restore();
  }

  private drawWattmeter(
    context: CanvasRenderingContext2D,
    element: WattmeterElm
  ): void {
    const posts = Array.from(
      { length: 4 },
      (_, index) => this.modelToScreen(element.getPost(index))
    );
    const inner = element.inner.map((point) => this.modelToScreen(point));
    for (let index = 0; index < Math.min(posts.length, inner.length); index += 1) {
      this.line(
        context,
        posts[index].x,
        posts[index].y,
        inner[index].x,
        inner[index].y
      );
    }
    const minX = Math.min(...inner.map((point) => point.x));
    const maxX = Math.max(...inner.map((point) => point.x));
    const minY = Math.min(...inner.map((point) => point.y));
    const maxY = Math.max(...inner.map((point) => point.y));
    context.strokeRect(minX, minY, Math.max(8, maxX - minX), Math.max(8, maxY - minY));
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "12px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      CircuitElm.getShortUnitText(
        element.meter === 1 ? element.avgPower : element.getPower(),
        "W"
      ),
      (minX + maxX) / 2,
      (minY + maxY) / 2
    );
    context.restore();
  }

  private drawTransistor(
    context: CanvasRenderingContext2D,
    element: TransistorElm
  ): void {
    if (element.coll.length < 2 || element.emit.length < 2) return;
    const basePost = this.modelToScreen(element.point1);
    const base = this.modelToScreen(element.base);
    const collectorPost = this.modelToScreen(element.coll[0]);
    const collector = this.modelToScreen(element.coll[1]);
    const emitterPost = this.modelToScreen(element.emit[0]);
    const emitter = this.modelToScreen(element.emit[1]);
    this.line(context, basePost.x, basePost.y, base.x, base.y);
    this.line(
      context,
      collectorPost.x,
      collectorPost.y,
      collector.x,
      collector.y
    );
    this.line(
      context,
      emitterPost.x,
      emitterPost.y,
      emitter.x,
      emitter.y
    );
    this.line(context, collector.x, collector.y, emitter.x, emitter.y);
    const from = element.pnp < 0 ? emitterPost : emitter;
    const to = element.pnp < 0 ? emitter : emitterPost;
    this.drawArrow(context, from, to, 7);
    if (element.hasFlag(TransistorElm.FLAG_CIRCLE)) {
      const center = {
        x: (base.x + collector.x + emitter.x) / 3,
        y: (base.y + collector.y + emitter.y) / 3
      };
      context.beginPath();
      context.arc(center.x, center.y, 20 * this.viewport.scale, 0, Math.PI * 2);
      context.stroke();
    }
  }

  private drawUnijunction(
    context: CanvasRenderingContext2D,
    element: UnijunctionElm,
    selected: boolean
  ): void {
    if (
      element.b1.length < 3 ||
      element.b2.length < 3 ||
      element.emitter.length < 3
    ) {
      return;
    }
    const b1 = element.b1.map((point) => this.modelToScreen(point));
    const b2 = element.b2.map((point) => this.modelToScreen(point));
    const emitter = element.emitter.map((point) =>
      this.modelToScreen(point)
    );
    const colorFor = (voltage: number) =>
      selected
        ? this.selectionColor
        : this.showVoltage
          ? this.voltageColor(voltage)
          : this.foregroundColor();

    context.strokeStyle = colorFor(element.volts[1] ?? 0);
    this.line(context, b1[0].x, b1[0].y, b1[1].x, b1[1].y);
    this.line(context, b1[1].x, b1[1].y, b1[2].x, b1[2].y);
    context.strokeStyle = colorFor(element.volts[2] ?? 0);
    this.line(context, b2[0].x, b2[0].y, b2[1].x, b2[1].y);
    this.line(context, b2[1].x, b2[1].y, b2[2].x, b2[2].y);

    const emitterColor = colorFor(element.volts[0] ?? 0);
    context.strokeStyle = emitterColor;
    context.fillStyle = emitterColor;
    this.line(
      context,
      emitter[0].x,
      emitter[0].y,
      emitter[1].x,
      emitter[1].y
    );
    this.line(
      context,
      emitter[1].x,
      emitter[1].y,
      emitter[2].x,
      emitter[2].y
    );

    const arrowDirection = CircuitCanvasRenderer.direction(
      emitter[1],
      emitter[2]
    );
    const arrowLength = 8 * this.viewport.scale;
    const arrowWidth = 3 * this.viewport.scale;
    const baseX = emitter[2].x - arrowDirection.ux * arrowLength;
    const baseY = emitter[2].y - arrowDirection.uy * arrowLength;
    context.beginPath();
    context.moveTo(emitter[2].x, emitter[2].y);
    context.lineTo(
      baseX + arrowDirection.px * arrowWidth,
      baseY + arrowDirection.py * arrowWidth
    );
    context.lineTo(
      baseX - arrowDirection.px * arrowWidth,
      baseY - arrowDirection.py * arrowWidth
    );
    context.closePath();
    context.fill();

    const channel = element.channelPolygon.map((point) =>
      this.modelToScreen(point)
    );
    if (channel.length === 4) {
      context.fillStyle = selected
        ? this.selectionColor
        : this.showPower
          ? this.powerColor(element.getPower())
          : emitterColor;
      context.beginPath();
      context.moveTo(channel[0].x, channel[0].y);
      for (let index = 1; index < channel.length; index += 1) {
        context.lineTo(channel[index].x, channel[index].y);
      }
      context.closePath();
      context.fill();
    }
  }

  private drawScr(
    context: CanvasRenderingContext2D,
    element: SCRElm
  ): void {
    const anode = this.modelToScreen(element.getPost(0));
    const cathode = this.modelToScreen(element.getPost(1));
    const gate = this.modelToScreen(element.getPost(2));
    const direction = CircuitCanvasRenderer.direction(anode, cathode);
    const center = {
      x: (anode.x + cathode.x) / 2,
      y: (anode.y + cathode.y) / 2
    };
    const halfLength = Math.min(12, direction.length / 4);
    const triangleBase = {
      x: center.x - direction.ux * halfLength,
      y: center.y - direction.uy * halfLength
    };
    const triangleTip = {
      x: center.x + direction.ux * halfLength,
      y: center.y + direction.uy * halfLength
    };

    this.line(
      context,
      anode.x,
      anode.y,
      triangleBase.x,
      triangleBase.y
    );
    this.line(
      context,
      triangleTip.x,
      triangleTip.y,
      cathode.x,
      cathode.y
    );
    context.beginPath();
    context.moveTo(
      triangleBase.x - direction.px * 10,
      triangleBase.y - direction.py * 10
    );
    context.lineTo(
      triangleBase.x + direction.px * 10,
      triangleBase.y + direction.py * 10
    );
    context.lineTo(triangleTip.x, triangleTip.y);
    context.closePath();
    context.stroke();
    this.line(
      context,
      triangleTip.x - direction.px * 12,
      triangleTip.y - direction.py * 12,
      triangleTip.x + direction.px * 12,
      triangleTip.y + direction.py * 12
    );
    const gateTarget = {
      x: triangleTip.x + direction.px * 9,
      y: triangleTip.y + direction.py * 9
    };
    this.line(context, gate.x, gate.y, gateTarget.x, gateTarget.y);
  }

  private drawTriode(
    context: CanvasRenderingContext2D,
    element: TriodeElm
  ): void {
    const plate = this.modelToScreen(element.getPost(0));
    const grid = this.modelToScreen(element.getPost(1));
    const cathode = this.modelToScreen(element.getPost(2));
    const center = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(grid, center);
    const radius = 24 * this.viewport.scale;

    context.save();
    context.strokeStyle = this.whiteBackground ? "#6b7280" : "#9ca3af";
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    const plateCenter = {
      x: center.x + direction.ux * 7,
      y: center.y + direction.uy * 7
    };
    this.line(context, plate.x, plate.y, plateCenter.x, plateCenter.y);
    this.line(
      context,
      plateCenter.x - direction.px * 11,
      plateCenter.y - direction.py * 11,
      plateCenter.x + direction.px * 11,
      plateCenter.y + direction.py * 11
    );

    const gridStart = {
      x: center.x - direction.ux * radius,
      y: center.y - direction.uy * radius
    };
    const gridEnd = {
      x: center.x - direction.ux * 5,
      y: center.y - direction.uy * 5
    };
    this.line(context, grid.x, grid.y, gridStart.x, gridStart.y);
    for (let index = 0; index < 3; index += 1) {
      const fraction = (index + 1) / 4;
      const x = gridStart.x + (gridEnd.x - gridStart.x) * fraction;
      const y = gridStart.y + (gridEnd.y - gridStart.y) * fraction;
      this.line(
        context,
        x - direction.px * 6,
        y - direction.py * 6,
        x + direction.px * 6,
        y + direction.py * 6
      );
    }

    const cathodeInside = {
      x: center.x - direction.ux * 2 - direction.px * 9,
      y: center.y - direction.uy * 2 - direction.py * 9
    };
    const cathodeBend = {
      x: center.x - direction.ux * 9 - direction.px * 15,
      y: center.y - direction.uy * 9 - direction.py * 15
    };
    this.line(
      context,
      cathode.x,
      cathode.y,
      cathodeBend.x,
      cathodeBend.y
    );
    this.line(
      context,
      cathodeBend.x,
      cathodeBend.y,
      cathodeInside.x,
      cathodeInside.y
    );
    this.line(
      context,
      cathodeInside.x - direction.px * 8,
      cathodeInside.y - direction.py * 8,
      cathodeInside.x + direction.px * 8,
      cathodeInside.y + direction.py * 8
    );
  }

  private drawMotorProtectionSwitch(
    context: CanvasRenderingContext2D,
    element: MotorProtectionSwitchElm
  ): void {
    const scale = this.viewport.scale;
    const toScreen = (x: number, y: number) =>
      this.modelToScreen({ x, y } as Point);
    const top = element.getPost(0);
    const phaseSpacing = 48;

    context.save();
    context.strokeStyle = this.whiteBackground ? "#6b7280" : "#d1d5db";
    context.setLineDash([4 * scale, 4 * scale]);
    const enclosureTopLeft = toScreen(top.x - 24, top.y + 80);
    const enclosureBottomRight = toScreen(
      top.x + phaseSpacing * 2 + 24,
      top.y + 176
    );
    context.strokeRect(
      enclosureTopLeft.x,
      enclosureTopLeft.y,
      enclosureBottomRight.x - enclosureTopLeft.x,
      enclosureBottomRight.y - enclosureTopLeft.y
    );
    context.setLineDash([]);

    for (let phase = 0; phase < 3; phase += 1) {
      const x = top.x + phase * phaseSpacing;
      const p0 = toScreen(x, top.y);
      const p32 = toScreen(x, top.y + 32);
      const p64 = toScreen(
        x - (element.blown ? 16 : 0),
        top.y + 64
      );
      const p80 = toScreen(x, top.y + 80);
      const p96 = toScreen(x, top.y + 96);
      const p112 = toScreen(x, top.y + 112);
      const p128 = toScreen(x, top.y + 128);
      const p176 = toScreen(x, top.y + 176);
      const p192 = toScreen(x, top.y + 192);
      this.line(context, p0.x, p0.y, p32.x, p32.y);
      this.line(context, p32.x, p32.y, p64.x, p64.y);
      this.line(context, p64.x, p64.y, p80.x, p80.y);

      const heatRatio = Math.max(
        0,
        Math.min(1, element.heats[phase] / element.i2t)
      );
      context.save();
      context.strokeStyle =
        heatRatio < 1 / 3
          ? context.strokeStyle
          : heatRatio < 2 / 3
            ? "#fb923c"
            : "#fef08a";
      const heaterX = p96.x - 12 * scale;
      this.line(context, p80.x, p80.y, p96.x, p96.y);
      this.line(context, p96.x, p96.y, heaterX, p96.y);
      this.line(context, heaterX, p96.y, heaterX, p112.y);
      this.line(context, heaterX, p112.y, p112.x, p112.y);
      this.line(context, p112.x, p112.y, p128.x, p128.y);
      context.restore();
      this.line(context, p176.x, p176.y, p192.x, p192.y);

      const crossY = toScreen(x, top.y + 16);
      this.line(
        context,
        crossY.x - 4 * scale,
        crossY.y - 4 * scale,
        crossY.x + 4 * scale,
        crossY.y + 4 * scale
      );
      this.line(
        context,
        crossY.x + 4 * scale,
        crossY.y - 4 * scale,
        crossY.x - 4 * scale,
        crossY.y + 4 * scale
      );

      context.save();
      context.fillStyle = this.foregroundColor();
      context.font = `italic ${Math.max(13, 22 * scale)}px serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const labelPoint = toScreen(x, top.y + 152);
      context.fillText("I >", labelPoint.x, labelPoint.y);
      context.restore();
    }

    if (element.label.length > 0) {
      context.save();
      context.fillStyle = this.foregroundColor();
      context.font = `${Math.max(10, 12 * scale)}px Arial`;
      const labelPoint = toScreen(
        top.x + phaseSpacing * 2 + 28,
        top.y + 60
      );
      context.fillText(element.label, labelPoint.x, labelPoint.y);
      context.restore();
    }
    context.restore();
  }

  private drawFet(
    context: CanvasRenderingContext2D,
    element: MosfetElm,
    junction: boolean
  ): void {
    if (element.src.length < 3 || element.drn.length < 3) return;
    const gatePost = this.modelToScreen(element.point1);
    const sourcePost = this.modelToScreen(element.src[0]);
    const source = this.modelToScreen(element.src[1]);
    const drainPost = this.modelToScreen(element.drn[0]);
    const drain = this.modelToScreen(element.drn[1]);
    const channelSource = this.modelToScreen(element.src[2]);
    const channelDrain = this.modelToScreen(element.drn[2]);
    if (junction) {
      const gateTarget =
        element instanceof JfetElm
          ? this.modelToScreen(element.gatePoint)
          : {
              x: (source.x + drain.x) / 2,
              y: (source.y + drain.y) / 2
            };
      this.line(context, sourcePost.x, sourcePost.y, source.x, source.y);
      this.line(
        context,
        source.x,
        source.y,
        channelSource.x,
        channelSource.y
      );
      this.line(context, drainPost.x, drainPost.y, drain.x, drain.y);
      this.line(
        context,
        drain.x,
        drain.y,
        channelDrain.x,
        channelDrain.y
      );
      this.line(
        context,
        gatePost.x,
        gatePost.y,
        gateTarget.x,
        gateTarget.y
      );
      const reverse = element.pnp < 0;
      this.drawArrow(
        context,
        reverse ? gateTarget : gatePost,
        reverse ? gatePost : gateTarget,
        6
      );
      return;
    }

    const selected =
      String(context.strokeStyle).toLowerCase() ===
      this.selectionColor.toLowerCase();
    const setTerminalColor = (voltage: number): void => {
      if (!selected && this.showVoltage && !this.showPower) {
        context.strokeStyle = this.voltageColor(voltage);
        context.fillStyle = context.strokeStyle;
      }
    };

    setTerminalColor(element.volts[1] ?? 0);
    this.line(context, sourcePost.x, sourcePost.y, source.x, source.y);
    setTerminalColor(element.volts[2] ?? 0);
    this.line(context, drainPost.x, drainPost.y, drain.x, drain.y);

    const segments = 6;
    const enhancement = element.vt > 0 && element.showBulk();
    for (let index = 0; index < segments; index += 1) {
      if (enhancement && (index === 1 || index === 4)) {
        continue;
      }
      const startFraction = index / segments;
      const endFraction = (index + 1) / segments;
      const start = {
        x: source.x + (drain.x - source.x) * startFraction,
        y: source.y + (drain.y - source.y) * startFraction
      };
      const end = {
        x: source.x + (drain.x - source.x) * endFraction,
        y: source.y + (drain.y - source.y) * endFraction
      };
      setTerminalColor(
        (element.volts[1] ?? 0) +
          ((element.volts[2] ?? 0) - (element.volts[1] ?? 0)) *
            startFraction
      );
      this.line(context, start.x, start.y, end.x, end.y);
    }

    setTerminalColor(element.volts[1] ?? 0);
    this.line(
      context,
      source.x,
      source.y,
      channelSource.x,
      channelSource.y
    );
    setTerminalColor(element.volts[2] ?? 0);
    this.line(
      context,
      drain.x,
      drain.y,
      channelDrain.x,
      channelDrain.y
    );

    if (element.showBulk() && element.body.length >= 2) {
      const bodyPost = this.modelToScreen(element.body[0]);
      const bodyLead = this.modelToScreen(element.body[1]);
      setTerminalColor(
        element.volts[element.bodyTerminal] ??
          element.volts[element.pnp === -1 ? 2 : 1] ??
          0
      );
      if (!element.hasBodyTerminal()) {
        const terminal = element.pnp === -1 ? drainPost : sourcePost;
        this.line(
          context,
          terminal.x,
          terminal.y,
          bodyPost.x,
          bodyPost.y
        );
      }
      this.line(
        context,
        bodyPost.x,
        bodyPost.y,
        bodyLead.x,
        bodyLead.y
      );
    }

    if (element.gate.length >= 3) {
      const gateStart = this.modelToScreen(element.gate[0]);
      const gateLead = this.modelToScreen(element.gate[1]);
      const gateEnd = this.modelToScreen(element.gate[2]);
      setTerminalColor(element.volts[0] ?? 0);
      this.line(
        context,
        gatePost.x,
        gatePost.y,
        gateLead.x,
        gateLead.y
      );
      this.line(
        context,
        gateStart.x,
        gateStart.y,
        gateEnd.x,
        gateEnd.y
      );
      if (
        element.drawDigital() &&
        element.pnp === -1 &&
        element.pcircler > 0
      ) {
        const circle = this.modelToScreen(element.pcircle);
        context.beginPath();
        context.arc(
          circle.x,
          circle.y,
          element.pcircler * this.viewport.scale,
          0,
          Math.PI * 2
        );
        context.stroke();
      }
    }

    if (element.hasFlag(MosfetElm.FLAG_SHOWVT)) {
      const labelPoint = this.modelToScreen(element.point2);
      labelPoint.x += 2 * this.viewport.scale;
      const threshold = element.vt * element.pnp;
      context.save();
      context.fillStyle = this.foregroundColor();
      context.font = `${Math.max(
        12,
        Math.min(20, 14 * this.viewport.scale)
      )}px Arial`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        Object.is(threshold, -0) ? "0" : String(threshold),
        labelPoint.x,
        labelPoint.y
      );
      context.restore();
    }
  }

  private drawFetCurrentDots(
    context: CanvasRenderingContext2D,
    element: MosfetElm,
    dotPosition: number
  ): void {
    if (element.src.length < 2 || element.drn.length < 2) {
      return;
    }
    const sourcePost = this.modelToScreen(element.src[0]);
    const source = this.modelToScreen(element.src[1]);
    const drain = this.modelToScreen(element.drn[1]);
    const drainPost = this.modelToScreen(element.drn[0]);
    const current = -element.ids;
    this.drawCurrentDots(
      context,
      sourcePost,
      source,
      current,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      source,
      drain,
      current,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      drain,
      drainPost,
      current,
      dotPosition
    );
  }

  private drawUnijunctionCurrentDots(
    context: CanvasRenderingContext2D,
    element: UnijunctionElm,
    elapsedMilliseconds: number,
    currentSpeed: number
  ): void {
    if (
      element.b1.length < 3 ||
      element.b2.length < 3 ||
      element.emitter.length < 3
    ) {
      return;
    }
    const base1Current = -element.getCurrentIntoNode(1);
    const base2Current = -element.getCurrentIntoNode(2);
    const emitterCurrent = -base1Current - base2Current;
    const currents = [emitterCurrent, base1Current, base2Current];
    for (let index = 0; index < 3; index += 1) {
      element.curcounts[index] = this.nextCurrentDotPosition(
        currents[index],
        element.curcounts[index] ?? 0,
        elapsedMilliseconds,
        currentSpeed
      );
    }
    const continuePosition = (position: number) =>
      Math.abs(position) === CURRENT_TOO_FAST ? position : position + 8;
    const b1 = element.b1.map((point) => this.modelToScreen(point));
    const b2 = element.b2.map((point) => this.modelToScreen(point));
    const emitter = element.emitter.map((point) =>
      this.modelToScreen(point)
    );
    this.drawCurrentDots(
      context,
      b1[0],
      b1[1],
      base1Current,
      element.curcounts[1]
    );
    this.drawCurrentDots(
      context,
      b1[1],
      b1[2],
      base1Current,
      continuePosition(element.curcounts[1])
    );
    this.drawCurrentDots(
      context,
      b2[0],
      b2[1],
      base2Current,
      element.curcounts[2]
    );
    this.drawCurrentDots(
      context,
      b2[1],
      b2[2],
      base2Current,
      continuePosition(element.curcounts[2])
    );
    this.drawCurrentDots(
      context,
      emitter[0],
      emitter[1],
      emitterCurrent,
      element.curcounts[0]
    );
    this.drawCurrentDots(
      context,
      emitter[1],
      emitter[2],
      emitterCurrent,
      element.curcounts[0]
    );
  }

  private drawScrCurrentDots(
    context: CanvasRenderingContext2D,
    element: SCRElm,
    dotPosition: number
  ): void {
    const anode = this.modelToScreen(element.getPost(0));
    const cathode = this.modelToScreen(element.getPost(1));
    const gate = this.modelToScreen(element.getPost(2));
    const center = {
      x: (anode.x + cathode.x) / 2,
      y: (anode.y + cathode.y) / 2
    };
    this.drawCurrentDots(
      context,
      anode,
      center,
      element.anodeCurrent,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      cathode,
      center,
      element.cathodeCurrent,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      gate,
      center,
      element.gateCurrent,
      dotPosition
    );
  }

  private drawTriodeCurrentDots(
    context: CanvasRenderingContext2D,
    element: TriodeElm,
    dotPosition: number
  ): void {
    const center = this.modelToScreen(element.point2);
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(0)),
      center,
      element.plateCurrent,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(1)),
      center,
      element.gridCurrent,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      center,
      this.modelToScreen(element.getPost(2)),
      element.cathodeCurrent,
      dotPosition
    );
  }

  private drawMotorProtectionCurrentDots(
    context: CanvasRenderingContext2D,
    element: MotorProtectionSwitchElm,
    dotPosition: number
  ): void {
    if (element.blown) return;
    for (let phase = 0; phase < 3; phase += 1) {
      const top = this.modelToScreen(element.getPost(phase * 2));
      const bottom = this.modelToScreen(
        element.getPost(phase * 2 + 1)
      );
      this.drawCurrentDots(
        context,
        top,
        bottom,
        element.currents[phase] ?? 0,
        dotPosition
      );
    }
  }

  private drawTappedTransformerCurrentDots(
    context: CanvasRenderingContext2D,
    element: TappedTransformerElm,
    dotPosition: number
  ): void {
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(0)),
      this.modelToScreen(element.getPost(1)),
      element.currents[0] ?? 0,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(2)),
      this.modelToScreen(element.getPost(3)),
      element.currents[1] ?? 0,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(3)),
      this.modelToScreen(element.getPost(4)),
      element.currents[2] ?? 0,
      dotPosition
    );
  }

  private drawThreePhaseMotorCurrentDots(
    context: CanvasRenderingContext2D,
    element: ThreePhaseMotorElm,
    elapsedMilliseconds: number,
    currentSpeed: number
  ): void {
    for (let phase = 0; phase < 3; phase += 1) {
      const current = element.coilCurrents[phase] ?? 0;
      element.curcounts[phase] = this.nextCurrentDotPosition(
        current,
        element.curcounts[phase] ?? 0,
        elapsedMilliseconds,
        currentSpeed
      );
      const dotPosition = element.curcounts[phase];
      this.drawCurrentDots(
        context,
        this.modelToScreen(element.getPost(phase * 2)),
        this.modelToScreen(element.leads[phase * 2]),
        current,
        dotPosition
      );
      this.drawCurrentDots(
        context,
        this.modelToScreen(element.leads[phase * 2 + 1]),
        this.modelToScreen(element.getPost(phase * 2 + 1)),
        current,
        dotPosition
      );
    }
  }

  private drawGyratorCurrentDots(
    context: CanvasRenderingContext2D,
    element: GyratorElm,
    dotPosition: number
  ): void {
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(0)),
      this.modelToScreen(element.getPost(2)),
      element.portCurrents[0] ?? 0,
      dotPosition
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.getPost(1)),
      this.modelToScreen(element.getPost(3)),
      element.portCurrents[1] ?? 0,
      dotPosition
    );
  }

  private drawLamp(
    context: CanvasRenderingContext2D,
    element: LampElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const radius = Math.min(16 * this.viewport.scale, direction.length * 0.28);
    const left = {
      x: center.x - direction.ux * radius,
      y: center.y - direction.uy * radius
    };
    const right = {
      x: center.x + direction.ux * radius,
      y: center.y + direction.uy * radius
    };
    this.line(context, first.x, first.y, left.x, left.y);
    this.line(context, right.x, right.y, second.x, second.y);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    const px = direction.px * radius * 0.58;
    const py = direction.py * radius * 0.58;
    const ux = direction.ux * radius * 0.58;
    const uy = direction.uy * radius * 0.58;
    this.line(
      context,
      center.x - ux - px,
      center.y - uy - py,
      center.x + ux + px,
      center.y + uy + py
    );
    this.line(
      context,
      center.x - ux + px,
      center.y - uy + py,
      center.x + ux - px,
      center.y + uy - py
    );
  }

  private drawDcMotor(
    context: CanvasRenderingContext2D,
    element: DCMotorElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const radius = Math.min(18 * this.viewport.scale, direction.length / 3);
    this.line(
      context,
      first.x,
      first.y,
      center.x - direction.ux * radius,
      center.y - direction.uy * radius
    );
    this.line(
      context,
      center.x + direction.ux * radius,
      center.y + direction.uy * radius,
      second.x,
      second.y
    );
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.save();
    context.translate(center.x, center.y);
    context.rotate(element.angle * element.gearRatio);
    for (let blade = 0; blade < 3; blade += 1) {
      context.rotate(Math.PI / 3);
      this.line(context, -radius * 0.65, 0, radius * 0.65, 0);
    }
    context.restore();
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "10px Arial";
    context.textAlign = "center";
    context.fillText("M", center.x, center.y + 4);
    context.restore();
  }

  private drawCustomTransformer(
    context: CanvasRenderingContext2D,
    element: CustomTransformerElm
  ): void {
    for (let node = 0; node < element.nodeCount; node += 1) {
      const post = this.modelToScreen(element.nodePoints[node]);
      const tap = this.modelToScreen(element.nodeTaps[node]);
      this.line(context, post.x, post.y, tap.x, tap.y);
    }
    for (let coil = 0; coil < element.coilCount; coil += 1) {
      const node = element.coilNodes[coil];
      const first = this.modelToScreen(element.nodeTaps[node]);
      const second = this.modelToScreen(element.nodeTaps[node + 1]);
      this.drawInductor(context, first, second);
    }
  }

  private drawCrystal(
    context: CanvasRenderingContext2D,
    element: CrystalElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const spacing = 10 * this.viewport.scale;
    const halfHeight = 10 * this.viewport.scale;
    const left = {
      x: center.x - direction.ux * spacing,
      y: center.y - direction.uy * spacing
    };
    const right = {
      x: center.x + direction.ux * spacing,
      y: center.y + direction.uy * spacing
    };
    this.line(context, first.x, first.y, left.x, left.y);
    this.line(context, right.x, right.y, second.x, second.y);
    for (const plate of [left, right]) {
      this.line(
        context,
        plate.x - direction.px * halfHeight,
        plate.y - direction.py * halfHeight,
        plate.x + direction.px * halfHeight,
        plate.y + direction.py * halfHeight
      );
    }
    context.strokeRect(
      center.x - direction.ux * 5 - direction.px * halfHeight * 0.72,
      center.y - direction.uy * 5 - direction.py * halfHeight * 0.72,
      Math.max(2, Math.abs(direction.ux * 10 + direction.px * halfHeight * 1.44)),
      Math.max(2, Math.abs(direction.uy * 10 + direction.py * halfHeight * 1.44))
    );
  }

  private drawPolarMark(
    context: CanvasRenderingContext2D,
    first: { x: number; y: number },
    second: { x: number; y: number }
  ): void {
    const direction = CircuitCanvasRenderer.direction(first, second);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `bold ${Math.max(10, 12 * this.viewport.scale)}px Arial`;
    context.textAlign = "center";
    context.fillText(
      "+",
      (first.x + second.x) / 2 + direction.px * 17,
      (first.y + second.y) / 2 + direction.py * 17
    );
    context.restore();
  }

  private drawOta(
    context: CanvasRenderingContext2D,
    element: OTAElm
  ): void {
    const posts = Array.from(
      { length: element.getPostCount() },
      (_, index) => this.modelToScreen(element.getPost(index))
    );
    if (posts.length < 5) return;
    const inputCenter = {
      x: (posts[0].x + posts[1].x) / 2,
      y: (posts[0].y + posts[1].y) / 2
    };
    const output = posts[4];
    const direction = CircuitCanvasRenderer.direction(inputCenter, output);
    const bodyStart = {
      x: inputCenter.x + direction.ux * 17,
      y: inputCenter.y + direction.uy * 17
    };
    const bodyEnd = {
      x: output.x - direction.ux * 24,
      y: output.y - direction.uy * 24
    };
    const halfHeight = 30 * this.viewport.scale;
    context.beginPath();
    context.moveTo(
      bodyStart.x + direction.px * halfHeight,
      bodyStart.y + direction.py * halfHeight
    );
    context.lineTo(
      bodyStart.x - direction.px * halfHeight,
      bodyStart.y - direction.py * halfHeight
    );
    context.lineTo(bodyEnd.x, bodyEnd.y);
    context.closePath();
    context.stroke();
    for (const post of posts) {
      const target =
        post === posts[4] ? bodyEnd : inputCenter;
      this.line(context, post.x, post.y, target.x, target.y);
    }
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "12px Arial";
    context.fillText("+", posts[0].x + 12, posts[0].y);
    context.fillText("−", posts[1].x + 12, posts[1].y);
    context.restore();
  }

  private drawRealOpAmp(
    context: CanvasRenderingContext2D,
    element: OpAmpRealElm
  ): void {
    const inputs = [
      this.modelToScreen(element.getPost(0)),
      this.modelToScreen(element.getPost(1))
    ];
    const output = this.modelToScreen(element.getPost(2));
    const rails = [
      this.modelToScreen(element.getPost(3)),
      this.modelToScreen(element.getPost(4))
    ];
    const leadStart = this.modelToScreen(element.lead1);
    const leadEnd = this.modelToScreen(element.lead2);
    const direction = CircuitCanvasRenderer.direction(leadStart, leadEnd);
    const halfHeight = 30 * this.viewport.scale;
    context.beginPath();
    context.moveTo(
      leadStart.x + direction.px * halfHeight,
      leadStart.y + direction.py * halfHeight
    );
    context.lineTo(
      leadStart.x - direction.px * halfHeight,
      leadStart.y - direction.py * halfHeight
    );
    context.lineTo(leadEnd.x, leadEnd.y);
    context.closePath();
    context.stroke();
    this.line(context, inputs[0].x, inputs[0].y, leadStart.x, leadStart.y);
    this.line(context, inputs[1].x, inputs[1].y, leadStart.x, leadStart.y);
    this.line(context, leadEnd.x, leadEnd.y, output.x, output.y);
    for (const rail of rails) {
      this.line(
        context,
        rail.x,
        rail.y,
        (leadStart.x + leadEnd.x) / 2,
        (leadStart.y + leadEnd.y) / 2
      );
    }
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "12px Arial";
    context.fillText("−", inputs[0].x + 8, inputs[0].y);
    context.fillText("+", inputs[1].x + 8, inputs[1].y);
    context.restore();
  }

  private drawOptocoupler(
    context: CanvasRenderingContext2D,
    element: OptocouplerElm
  ): void {
    const posts = Array.from(
      { length: 4 },
      (_, index) => this.modelToScreen(element.getPost(index))
    );
    this.line(context, posts[0].x, posts[0].y, posts[1].x, posts[1].y);
    this.line(context, posts[2].x, posts[2].y, posts[3].x, posts[3].y);
    const center = {
      x: posts.reduce((sum, post) => sum + post.x, 0) / 4,
      y: posts.reduce((sum, post) => sum + post.y, 0) / 4
    };
    const direction = CircuitCanvasRenderer.direction(posts[0], posts[2]);
    for (const offset of [-5, 5]) {
      const from = {
        x: center.x - direction.ux * 10 + direction.px * offset,
        y: center.y - direction.uy * 10 + direction.py * offset
      };
      const to = {
        x: center.x + direction.ux * 10 + direction.px * offset,
        y: center.y + direction.uy * 10 + direction.py * offset
      };
      this.line(context, from.x, from.y, to.x, to.y);
      this.drawArrow(context, from, to, 5);
    }
  }

  private drawArrow(
    context: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    size: number
  ): void {
    const direction = CircuitCanvasRenderer.direction(from, to);
    const tip = {
      x: from.x + (to.x - from.x) * 0.58,
      y: from.y + (to.y - from.y) * 0.58
    };
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(
      tip.x - direction.ux * size + direction.px * size * 0.55,
      tip.y - direction.uy * size + direction.py * size * 0.55
    );
    context.lineTo(
      tip.x - direction.ux * size - direction.px * size * 0.55,
      tip.y - direction.uy * size - direction.py * size * 0.55
    );
    context.closePath();
    context.fill();
  }

  private drawLogicTerminal(
    context: CanvasRenderingContext2D,
    value: string,
    post: { x: number; y: number },
    lead: { x: number; y: number },
    labelPoint: { x: number; y: number }
  ): void {
    this.line(context, post.x, post.y, lead.x, lead.y);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "bold 20px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(value, labelPoint.x, labelPoint.y);
    context.restore();
  }

  private drawSweep(
    context: CanvasRenderingContext2D,
    element: SweepElm
  ): void {
    const post = this.modelToScreen(element.point1);
    const lead = this.modelToScreen(element.lead1);
    const center = this.modelToScreen(element.point2);
    const radius = 17 * this.viewport.scale;
    this.line(context, post.x, post.y, lead.x, lead.y);
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    for (let index = -10; index <= 10; index += 1) {
      const x = center.x + index * this.viewport.scale;
      const phase =
        (index * Math.PI * (1 + element.frequency / element.maxF)) /
        10;
      const y = center.y + Math.sin(phase) * 8 * this.viewport.scale;
      if (index === -10) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  private drawPot(
    context: CanvasRenderingContext2D,
    element: PotElm
  ): void {
    const post1 = this.modelToScreen(element.point1);
    const post2 = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const wiperPost = this.modelToScreen(element.post3);
    const corner = this.modelToScreen(element.corner2);
    const arrow = this.modelToScreen(element.arrowPoint);
    this.drawLeads(context, post1, lead1, lead2, post2);
    this.drawResistor(context, lead1, lead2);
    this.line(context, wiperPost.x, wiperPost.y, corner.x, corner.y);
    this.line(context, corner.x, corner.y, arrow.x, arrow.y);
    const direction = CircuitCanvasRenderer.direction(corner, arrow);
    context.beginPath();
    context.moveTo(arrow.x, arrow.y);
    context.lineTo(
      arrow.x - direction.ux * 7 + direction.px * 4,
      arrow.y - direction.uy * 7 + direction.py * 4
    );
    context.lineTo(
      arrow.x - direction.ux * 7 - direction.px * 4,
      arrow.y - direction.uy * 7 - direction.py * 4
    );
    context.closePath();
    context.fill();
  }

  private drawPotCurrentDots(
    context: CanvasRenderingContext2D,
    element: PotElm,
    elapsedMilliseconds: number,
    currentSpeed: number
  ): void {
    element.curcount1 = this.nextCurrentDotPosition(
      element.current1,
      element.curcount1,
      elapsedMilliseconds,
      currentSpeed
    );
    element.curcount2 = this.nextCurrentDotPosition(
      element.current2,
      element.curcount2,
      elapsedMilliseconds,
      currentSpeed
    );
    element.curcount3 = this.nextCurrentDotPosition(
      element.current3,
      element.curcount3,
      elapsedMilliseconds,
      currentSpeed
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point1),
      this.modelToScreen(element.midpoint),
      element.current1,
      element.curcount1
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point2),
      this.modelToScreen(element.midpoint),
      element.current2,
      element.curcount2
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.post3),
      this.modelToScreen(element.corner2),
      element.current3,
      element.curcount3
    );
    const wiperOffset =
      Math.hypot(
        element.corner2.x - element.post3.x,
        element.corner2.y - element.post3.y
      ) * this.viewport.scale;
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.corner2),
      this.modelToScreen(element.midpoint),
      element.current3,
      Math.abs(element.curcount3) === CURRENT_TOO_FAST
        ? element.curcount3
        : element.curcount3 + wiperOffset
    );
  }

  private drawLabeledNode(
    context: CanvasRenderingContext2D,
    element: LabeledNodeElm
  ): void {
    const post = this.modelToScreen(element.point1);
    const lead = this.modelToScreen(element.lead1);
    const label = this.modelToScreen(element.point2);
    this.line(context, post.x, post.y, lead.x, lead.y);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "14px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (element.isRotateText() && element.x === element.x2) {
      context.translate(label.x, label.y);
      context.rotate(-Math.PI / 2);
      context.fillText(element.text, 0, 0);
    } else {
      context.fillText(element.text, label.x, label.y);
    }
    context.restore();
  }

  private drawRoutedWire(
    context: CanvasRenderingContext2D,
    element: RoutedWireElm
  ): void {
    for (
      let index = 0;
      index < element.routePoints.length - 1;
      index += 1
    ) {
      const first = this.modelToScreen(element.routePoints[index]);
      const second = this.modelToScreen(element.routePoints[index + 1]);
      this.line(context, first.x, first.y, second.x, second.y);
    }
  }

  private drawTextElement(
    context: CanvasRenderingContext2D,
    element: TextElm
  ): void {
    const position = this.modelToScreen(element.point1);
    const fontSize = Math.max(8, element.size * this.viewport.scale);
    context.save();
    context.fillStyle = "#d1d5db";
    context.strokeStyle = "#d1d5db";
    context.font = `${fontSize}px Arial`;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    element.lines.forEach((line, index) => {
      const y = position.y + index * (fontSize + 3);
      context.fillText(line, position.x, y);
      if (element.hasFlag(TextElm.FLAG_BAR)) {
        const width = context.measureText(line).width;
        this.line(
          context,
          position.x,
          y - fontSize,
          position.x + width,
          y - fontSize
        );
      }
    });
    context.restore();
  }

  private drawProbe(
    context: CanvasRenderingContext2D,
    element: ProbeElm
  ): void {
    const post1 = this.modelToScreen(element.point1);
    const post2 = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const center = {
      x: (post1.x + post2.x) / 2,
      y: (post1.y + post2.y) / 2
    };
    this.line(context, post1.x, post1.y, lead1.x, lead1.y);
    this.line(context, lead2.x, lead2.y, post2.x, post2.y);

    context.save();
    context.fillStyle = this.foregroundColor();
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (element.drawAsCircle()) {
      const radius = 12 * this.viewport.scale;
      context.beginPath();
      context.arc(center.x, center.y, radius, 0, Math.PI * 2);
      context.stroke();
      context.font = `bold ${Math.max(10, 14 * this.viewport.scale)}px Arial`;
      context.fillText("V", center.x, center.y);
    }
    if (element.mustShowVoltage()) {
      context.font = "12px Arial";
      const direction = CircuitCanvasRenderer.direction(post1, post2);
      context.fillText(
        element.getDisplayValue(),
        center.x + direction.px * (18 * this.viewport.scale),
        center.y + direction.py * (18 * this.viewport.scale)
      );
    }
    context.restore();
  }

  private drawInverter(
    context: CanvasRenderingContext2D,
    element: InverterElm
  ): void {
    const post1 = this.modelToScreen(element.point1);
    const post2 = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const direction = CircuitCanvasRenderer.direction(lead1, lead2);
    const halfHeight = 16 * this.viewport.scale;
    const bubbleRadius = Math.max(2.5, 3 * this.viewport.scale);
    const bubbleX = lead2.x - direction.ux * (bubbleRadius + 1);
    const bubbleY = lead2.y - direction.uy * (bubbleRadius + 1);
    const tipX = bubbleX - direction.ux * bubbleRadius;
    const tipY = bubbleY - direction.uy * bubbleRadius;

    this.line(context, post1.x, post1.y, lead1.x, lead1.y);
    context.beginPath();
    context.moveTo(
      lead1.x + direction.px * halfHeight,
      lead1.y + direction.py * halfHeight
    );
    context.lineTo(
      lead1.x - direction.px * halfHeight,
      lead1.y - direction.py * halfHeight
    );
    context.lineTo(tipX, tipY);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
    context.stroke();
    this.line(
      context,
      bubbleX + direction.ux * bubbleRadius,
      bubbleY + direction.uy * bubbleRadius,
      post2.x,
      post2.y
    );
  }

  private drawGate(
    context: CanvasRenderingContext2D,
    element: GateElm
  ): void {
    for (let index = 0; index < element.inputCount; index += 1) {
      const post = this.modelToScreen(element.inPosts[index]);
      const gate = this.modelToScreen(element.inGates[index]);
      this.line(context, post.x, post.y, gate.x, gate.y);
      if (element.hasFlag(GateElm.FLAG_INVERT_INPUTS)) {
        context.beginPath();
        context.arc(gate.x, gate.y, 3 * this.viewport.scale, 0, Math.PI * 2);
        context.stroke();
      }
    }

    const start = this.modelToScreen(element.lead1);
    const bodyEndPoint = element.interpPoint(
      element.point1,
      element.point2,
      element.dn === 0 ? 0.5 : 0.5 + element.ww / element.dn
    );
    const bodyEnd = this.modelToScreen(bodyEndPoint);
    const output = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(start, bodyEnd);
    const halfHeight = Math.max(
      8,
      element.hs2 * this.viewport.scale
    );
    const bodyLength = direction.length;
    const angle = Math.atan2(direction.uy, direction.ux);

    context.save();
    context.translate(start.x, start.y);
    context.rotate(angle);
    context.beginPath();
    if (this.iecGates) {
      context.rect(0, -halfHeight, bodyLength, halfHeight * 2);
    } else if (element instanceof AndGateElm) {
      context.moveTo(0, -halfHeight);
      context.lineTo(bodyLength * 0.5, -halfHeight);
      context.bezierCurveTo(
        bodyLength * 0.82,
        -halfHeight,
        bodyLength,
        -halfHeight * 0.5,
        bodyLength,
        0
      );
      context.bezierCurveTo(
        bodyLength,
        halfHeight * 0.5,
        bodyLength * 0.82,
        halfHeight,
        bodyLength * 0.5,
        halfHeight
      );
      context.lineTo(0, halfHeight);
      context.closePath();
    } else if (element instanceof OrGateElm) {
      context.moveTo(0, -halfHeight);
      context.quadraticCurveTo(
        bodyLength * 0.35,
        0,
        0,
        halfHeight
      );
      context.quadraticCurveTo(
        bodyLength * 0.65,
        halfHeight,
        bodyLength,
        0
      );
      context.quadraticCurveTo(
        bodyLength * 0.65,
        -halfHeight,
        0,
        -halfHeight
      );
      context.closePath();
    } else {
      context.rect(0, -halfHeight, bodyLength, halfHeight * 2);
    }
    context.stroke();

    if (this.iecGates) {
      context.fillStyle = this.foregroundColor();
      context.font = `bold ${Math.max(10, 12 * this.viewport.scale)}px Arial`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const symbol =
        element.getGateName() === "AND" || element.getGateName() === "NAND"
          ? "&"
          : element.getGateName() === "XOR" ||
              element.getGateName() === "XNOR"
            ? "=1"
            : "≥1";
      context.fillText(symbol, bodyLength / 2, 0);
    }

    if (!this.iecGates && element.getGateName() === "XOR") {
      context.beginPath();
      context.moveTo(-5, -halfHeight);
      context.quadraticCurveTo(
        bodyLength * 0.25,
        0,
        -5,
        halfHeight
      );
      context.stroke();
    }
    context.restore();

    if (element.isInverting()) {
      const bubbleRadius = Math.max(2.5, 3 * this.viewport.scale);
      const bubbleCenter = {
        x: bodyEnd.x + direction.ux * (bubbleRadius + 1),
        y: bodyEnd.y + direction.uy * (bubbleRadius + 1)
      };
      context.beginPath();
      context.arc(
        bubbleCenter.x,
        bubbleCenter.y,
        bubbleRadius,
        0,
        Math.PI * 2
      );
      context.stroke();
      this.line(
        context,
        bubbleCenter.x + direction.ux * bubbleRadius,
        bubbleCenter.y + direction.uy * bubbleRadius,
        output.x,
        output.y
      );
    } else {
      this.line(context, bodyEnd.x, bodyEnd.y, output.x, output.y);
    }
  }

  private drawEmbeddedScope(
    context: CanvasRenderingContext2D,
    element: ScopeElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const left = Math.min(first.x, second.x);
    const top = Math.min(first.y, second.y);
    const width = Math.max(24, Math.abs(second.x - first.x));
    const height = Math.max(18, Math.abs(second.y - first.y));
    context.strokeRect(left, top, width, height);
    context.save();
    context.strokeStyle = "#334155";
    context.lineWidth = 1;
    this.line(context, left, top + height / 2, left + width, top + height / 2);
    this.line(context, left + width / 2, top, left + width / 2, top + height);
    context.fillStyle = "#64748b";
    context.font = "10px Consolas, monospace";
    context.textAlign = "center";
    context.fillText("SCOPE", left + width / 2, top + height / 2 - 5);
    context.restore();
  }

  private drawDecimalDisplay(
    context: CanvasRenderingContext2D,
    element: DecimalDisplayElm
  ): void {
    this.drawChip(context, element);
    const center = {
      x:
        ((element.bodyLeft + element.bodyRight) / 2) *
          this.viewport.scale +
        this.viewport.offsetX,
      y:
        ((element.bodyTop + element.bodyBottom) / 2) *
          this.viewport.scale +
        this.viewport.offsetY
    };
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `bold ${Math.max(14, 22 * this.viewport.scale)}px monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(element.getDisplayValue(), center.x, center.y + 12);
    context.restore();
  }

  private drawSevenSegmentDisplay(
    context: CanvasRenderingContext2D,
    element: SevenSegElm
  ): void {
    this.drawChip(context, element);
    const topLeft = {
      x: element.bodyLeft * this.viewport.scale + this.viewport.offsetX,
      y: element.bodyTop * this.viewport.scale + this.viewport.offsetY
    };
    const bottomRight = {
      x: element.bodyRight * this.viewport.scale + this.viewport.offsetX,
      y: element.bodyBottom * this.viewport.scale + this.viewport.offsetY
    };
    const centerX = (topLeft.x + bottomRight.x) / 2 + 8 * this.viewport.scale;
    const centerY = (topLeft.y + bottomRight.y) / 2;
    const halfWidth = Math.min(
      18 * this.viewport.scale,
      Math.abs(bottomRight.x - topLeft.x) * 0.22
    );
    const halfHeight = Math.min(
      30 * this.viewport.scale,
      Math.abs(bottomRight.y - topLeft.y) * 0.34
    );
    const lit = element.getLitSegments();
    const segments = [
      [-halfWidth, -halfHeight, halfWidth, -halfHeight],
      [halfWidth, -halfHeight, halfWidth, 0],
      [halfWidth, 0, halfWidth, halfHeight],
      [-halfWidth, halfHeight, halfWidth, halfHeight],
      [-halfWidth, 0, -halfWidth, halfHeight],
      [-halfWidth, -halfHeight, -halfWidth, 0],
      [-halfWidth, 0, halfWidth, 0]
    ];
    context.save();
    context.lineWidth = Math.max(2, 4 * this.viewport.scale);
    context.lineCap = "round";
    segments.forEach((segment, index) => {
      context.strokeStyle = lit[index] ? "#ef4444" : "#3f1515";
      this.line(
        context,
        centerX + segment[0],
        centerY + segment[1],
        centerX + segment[2],
        centerY + segment[3]
      );
    });
    context.restore();
  }

  private drawTransformer(
    context: CanvasRenderingContext2D,
    element: TransformerElm
  ): void {
    if (element.ptEnds.length < 4) return;
    for (let index = 0; index < 4; index += 1) {
      const end = this.modelToScreen(element.ptEnds[index]);
      const coil = this.modelToScreen(element.ptCoil[index]);
      this.line(context, end.x, end.y, coil.x, coil.y);
    }
    this.drawInductor(
      context,
      this.modelToScreen(element.ptCoil[0]),
      this.modelToScreen(element.ptCoil[2])
    );
    this.drawInductor(
      context,
      this.modelToScreen(element.ptCoil[1]),
      this.modelToScreen(element.ptCoil[3])
    );
    context.save();
    context.strokeStyle = "#94a3b8";
    context.lineWidth = Math.max(2, 2 * this.viewport.scale);
    this.line(
      context,
      this.modelToScreen(element.ptCore[0]).x,
      this.modelToScreen(element.ptCore[0]).y,
      this.modelToScreen(element.ptCore[2]).x,
      this.modelToScreen(element.ptCore[2]).y
    );
    this.line(
      context,
      this.modelToScreen(element.ptCore[1]).x,
      this.modelToScreen(element.ptCore[1]).y,
      this.modelToScreen(element.ptCore[3]).x,
      this.modelToScreen(element.ptCore[3]).y
    );
    context.restore();
  }

  private drawTransmissionLine(
    context: CanvasRenderingContext2D,
    element: TransLineElm
  ): void {
    if (element.posts.length < 4 || element.inner.length < 4) return;
    context.save();
    context.fillStyle = "#1f2937";
    const inner0 = this.modelToScreen(element.inner[0]);
    const inner3 = this.modelToScreen(element.inner[3]);
    const left = Math.min(inner0.x, inner3.x);
    const top = Math.min(inner0.y, inner3.y);
    context.fillRect(
      left,
      top,
      Math.max(2, Math.abs(inner3.x - inner0.x)),
      Math.max(2, Math.abs(inner3.y - inner0.y))
    );
    context.restore();
    for (let index = 0; index < 4; index += 1) {
      const post = this.modelToScreen(element.posts[index]);
      const inner = this.modelToScreen(element.inner[index]);
      this.line(context, post.x, post.y, inner.x, inner.y);
    }
    this.line(
      context,
      this.modelToScreen(element.inner[0]).x,
      this.modelToScreen(element.inner[0]).y,
      this.modelToScreen(element.inner[1]).x,
      this.modelToScreen(element.inner[1]).y
    );
    this.line(
      context,
      this.modelToScreen(element.inner[2]).x,
      this.modelToScreen(element.inner[2]).y,
      this.modelToScreen(element.inner[3]).x,
      this.modelToScreen(element.inner[3]).y
    );
  }

  private drawRelay(
    context: CanvasRenderingContext2D,
    element: RelayElm
  ): void {
    for (let pole = 0; pole < element.poleCountValue; pole += 1) {
      const posts = element.swposts[pole];
      const contacts = element.swpoles[pole];
      if (posts === undefined || contacts === undefined) continue;
      for (let index = 0; index < 3; index += 1) {
        const post = this.modelToScreen(posts[index]);
        const contact = this.modelToScreen(contacts[index]);
        this.line(context, post.x, post.y, contact.x, contact.y);
      }
      const selected = this.modelToScreen(
        contacts[1 + Math.min(element.iPosition, 1)]
      );
      const common = this.modelToScreen(contacts[0]);
      this.line(context, common.x, common.y, selected.x, selected.y);
    }
    if (element.coilPosts.length === 2 && element.coilLeads.length === 2) {
      this.line(
        context,
        this.modelToScreen(element.coilPosts[0]).x,
        this.modelToScreen(element.coilPosts[0]).y,
        this.modelToScreen(element.coilLeads[0]).x,
        this.modelToScreen(element.coilLeads[0]).y
      );
      this.drawInductor(
        context,
        this.modelToScreen(element.coilLeads[0]),
        this.modelToScreen(element.coilLeads[1])
      );
      this.line(
        context,
        this.modelToScreen(element.coilLeads[1]).x,
        this.modelToScreen(element.coilLeads[1]).y,
        this.modelToScreen(element.coilPosts[1]).x,
        this.modelToScreen(element.coilPosts[1]).y
      );
    }
  }

  private drawRelayCoil(
    context: CanvasRenderingContext2D,
    element: RelayCoilElm
  ): void {
    if (element.coilPosts.length < 2 || element.coilLeads.length < 2) return;
    const firstPost = this.modelToScreen(element.coilPosts[0]);
    const firstLead = this.modelToScreen(element.coilLeads[0]);
    const secondLead = this.modelToScreen(element.coilLeads[1]);
    const secondPost = this.modelToScreen(element.coilPosts[1]);
    this.line(context, firstPost.x, firstPost.y, firstLead.x, firstLead.y);
    this.drawInductor(context, firstLead, secondLead);
    this.line(context, secondLead.x, secondLead.y, secondPost.x, secondPost.y);
    this.drawLabel(context, element.label, firstPost, secondPost);
  }

  private drawRelayContact(
    context: CanvasRenderingContext2D,
    element: RelayContactElm
  ): void {
    if (element.swposts.length < 2 || element.swpoles.length < 2) return;
    for (let index = 0; index < 2; index += 1) {
      const post = this.modelToScreen(element.swposts[index]);
      const pole = this.modelToScreen(element.swpoles[index]);
      this.line(context, post.x, post.y, pole.x, pole.y);
    }
    const common = this.modelToScreen(element.swpoles[0]);
    const target = this.modelToScreen(
      element.iPosition === 0
        ? element.swpoles[1]
        : element.swpoles[2]
    );
    this.line(context, common.x, common.y, target.x, target.y);
    this.drawLabel(
      context,
      element.label,
      this.modelToScreen(element.swposts[0]),
      this.modelToScreen(element.swposts[1])
    );
  }

  private drawChip(
    context: CanvasRenderingContext2D,
    element: ChipElm
  ): void {
    const topLeft = {
      x:
        element.bodyLeft * this.viewport.scale +
        this.viewport.offsetX,
      y:
        element.bodyTop * this.viewport.scale +
        this.viewport.offsetY
    };
    const bottomRight = {
      x:
        element.bodyRight * this.viewport.scale +
        this.viewport.offsetX,
      y:
        element.bodyBottom * this.viewport.scale +
        this.viewport.offsetY
    };
    context.strokeRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );

    context.save();
    context.font = `${Math.max(8, 10 * element.csize * this.viewport.scale)}px Arial`;
    context.fillStyle = this.foregroundColor();
    context.textBaseline = "middle";
    for (const pin of element.pins) {
      const post = this.modelToScreen(pin.post);
      const stub = this.modelToScreen(pin.stub);
      const text = this.modelToScreen(pin.textloc);
      this.line(context, post.x, post.y, stub.x, stub.y);
      if (pin.clock) {
        const direction = CircuitCanvasRenderer.direction(post, stub);
        context.beginPath();
        context.moveTo(
          stub.x + direction.px * 5,
          stub.y + direction.py * 5
        );
        context.lineTo(
          stub.x + direction.ux * 6,
          stub.y + direction.uy * 6
        );
        context.lineTo(
          stub.x - direction.px * 5,
          stub.y - direction.py * 5
        );
        context.stroke();
      }
      if (pin.bubble) {
        context.beginPath();
        context.arc(stub.x, stub.y, 3 * this.viewport.scale, 0, Math.PI * 2);
        context.stroke();
      }
      if (pin.text.length > 0) {
        context.textAlign =
          pin.side === ChipElm.SIDE_W
            ? "left"
            : pin.side === ChipElm.SIDE_E
              ? "right"
              : "center";
        const offsetX =
          pin.side === ChipElm.SIDE_W
            ? 4
            : pin.side === ChipElm.SIDE_E
              ? -4
              : 0;
        const offsetY =
          pin.side === ChipElm.SIDE_N
            ? 8
            : pin.side === ChipElm.SIDE_S
              ? -8
              : 0;
        context.fillText(
          pin.text,
          text.x + offsetX,
          text.y + offsetY
        );
        if (pin.lineOver) {
          const width = context.measureText(pin.text).width;
          this.line(
            context,
            text.x - width / 2,
            text.y - 7,
            text.x + width / 2,
            text.y - 7
          );
        }
      }
    }
    context.textAlign = "center";
    context.fillText(
      element.getChipName(),
      (topLeft.x + bottomRight.x) / 2,
      (topLeft.y + bottomRight.y) / 2
    );
    context.restore();
  }

  private drawAnalogSwitch(
    context: CanvasRenderingContext2D,
    element: AnalogSwitchElm
  ): void {
    const post1 = this.modelToScreen(element.point1);
    const post2 = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const controlPost = this.modelToScreen(element.point3);
    const controlLead = this.modelToScreen(element.lead3);
    const direction = CircuitCanvasRenderer.direction(lead1, lead2);
    this.drawLeads(context, post1, lead1, lead2, post2);
    const lift = element.open ? 16 * this.viewport.scale : 0;
    this.line(
      context,
      lead1.x,
      lead1.y,
      lead2.x + direction.px * lift,
      lead2.y + direction.py * lift
    );
    this.line(
      context,
      controlPost.x,
      controlPost.y,
      controlLead.x,
      controlLead.y
    );
  }

  private drawAnalogSwitch2(
    context: CanvasRenderingContext2D,
    element: AnalogSwitch2Elm
  ): void {
    const commonPost = this.modelToScreen(element.point1);
    const commonLead = this.modelToScreen(element.lead1);
    this.line(
      context,
      commonPost.x,
      commonPost.y,
      commonLead.x,
      commonLead.y
    );
    for (let index = 0; index < 2; index += 1) {
      const pole = this.modelToScreen(element.swpoles[index]);
      const post = this.modelToScreen(element.swposts[index]);
      this.line(context, pole.x, pole.y, post.x, post.y);
    }
    const selected = this.modelToScreen(
      element.swpoles[element.open ? 1 : 0]
    );
    this.line(
      context,
      commonLead.x,
      commonLead.y,
      selected.x,
      selected.y
    );
    const control = this.modelToScreen(element.ctlPoint);
    const center = this.modelToScreen(
      element.interpPoint(element.lead1, element.lead2, 0.5)
    );
    this.line(context, control.x, control.y, center.x, center.y);
  }

  private drawLed(
    context: CanvasRenderingContext2D,
    element: LEDElm
  ): void {
    const post1 = this.modelToScreen(element.point1);
    const post2 = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.ledLead1);
    const lead2 = this.modelToScreen(element.ledLead2);
    const center = this.modelToScreen(element.ledCenter);
    const radius = 12 * this.viewport.scale;
    this.line(context, post1.x, post1.y, lead1.x, lead1.y);
    this.line(context, lead2.x, lead2.y, post2.x, post2.y);
    context.save();
    context.strokeStyle = "#9ca3af";
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    const brightness = element.getBrightness();
    context.fillStyle = `rgb(${Math.round(
      255 * element.colorR * brightness
    )}, ${Math.round(255 * element.colorG * brightness)}, ${Math.round(
      255 * element.colorB * brightness
    )})`;
    context.beginPath();
    context.arc(
      center.x,
      center.y,
      Math.max(1, radius - 4 * this.viewport.scale),
      0,
      Math.PI * 2
    );
    context.fill();
    context.restore();
  }

  private drawCapacitor(
    context: CanvasRenderingContext2D,
    element: CapacitorElm,
    selected: boolean
  ): void {
    const start = this.modelToScreen(element.point1);
    const end = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const { px, py } =
      CircuitCanvasRenderer.direction(start, end);
    const plate = 12 * this.viewport.scale;
    const drawTerminal = (
      post: { x: number; y: number },
      lead: { x: number; y: number },
      voltage: number
    ) => {
      if (!selected && this.showVoltage && !this.showPower) {
        context.strokeStyle = this.voltageColor(voltage);
      }
      this.line(context, post.x, post.y, lead.x, lead.y);
      this.line(
        context,
        lead.x - px * plate,
        lead.y - py * plate,
        lead.x + px * plate,
        lead.y + py * plate
      );
    };

    context.save();
    drawTerminal(start, lead1, element.volts[0] ?? 0);
    drawTerminal(end, lead2, element.volts[1] ?? 0);
    context.restore();
  }

  private drawInductor(
    context: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    const { uy, ux, length } =
      CircuitCanvasRenderer.direction(start, end);
    const modelScale = Math.max(this.viewport.scale, 1e-6);
    const turns = Math.max(1, Math.ceil(length / (11 * modelScale)));
    const turnLength = length / turns;
    const radius = turnLength / 2;
    context.save();
    context.translate(start.x, start.y);
    context.rotate(Math.atan2(uy, ux));
    for (let index = 0; index < turns; index += 1) {
      context.beginPath();
      context.arc(
        turnLength * index + radius,
        0,
        radius,
        Math.PI,
        Math.PI * 2
      );
      context.stroke();
    }
    context.restore();
  }

  private drawInductiveElement(
    context: CanvasRenderingContext2D,
    element: InductorElm,
    post1: { x: number; y: number },
    lead1: { x: number; y: number },
    lead2: { x: number; y: number },
    post2: { x: number; y: number },
    selected: boolean
  ): void {
    if (selected || !this.showVoltage || this.showPower) {
      this.drawLeads(context, post1, lead1, lead2, post2);
      this.drawInductor(context, lead1, lead2);
      return;
    }

    context.save();
    context.strokeStyle = this.voltageColor(element.volts[0] ?? 0);
    this.line(context, post1.x, post1.y, lead1.x, lead1.y);
    context.strokeStyle = this.voltageColor(element.volts[1] ?? 0);
    this.line(context, lead2.x, lead2.y, post2.x, post2.y);
    const gradient = context.createLinearGradient(
      lead1.x,
      lead1.y,
      lead2.x,
      lead2.y
    );
    gradient.addColorStop(0, this.voltageColor(element.volts[0] ?? 0));
    gradient.addColorStop(1, this.voltageColor(element.volts[1] ?? 0));
    context.strokeStyle = gradient;
    this.drawInductor(context, lead1, lead2);
    context.restore();
  }

  private drawSwitch(
    context: CanvasRenderingContext2D,
    element: SwitchElm,
    post1: { x: number; y: number },
    lead1: { x: number; y: number },
    lead2: { x: number; y: number },
    post2: { x: number; y: number }
  ): void {
    this.drawLeads(context, post1, lead1, lead2, post2);
    const { ux, uy, px, py, length } =
      CircuitCanvasRenderer.direction(lead1, lead2);
    const lift = element.position === 0 ? 0 : Math.min(18, length / 2);
    this.line(
      context,
      lead1.x,
      lead1.y,
      lead2.x + px * lift - ux * (element.position === 0 ? 0 : 4),
      lead2.y + py * lift - uy * (element.position === 0 ? 0 : 4)
    );
  }

  private drawSwitch2(
    context: CanvasRenderingContext2D,
    element: Switch2Elm,
    selected: boolean
  ): void {
    const commonPost = this.modelToScreen(element.point1);
    const commonPole = this.modelToScreen(element.lead1);
    context.save();
    if (!selected && this.showVoltage && !this.showPower) {
      context.strokeStyle = this.voltageColor(element.volts[0] ?? 0);
    }
    this.line(
      context,
      commonPost.x,
      commonPost.y,
      commonPole.x,
      commonPole.y
    );
    for (let index = 0; index < element.throwCount; index += 1) {
      const pole = this.modelToScreen(element.swpoles[index]);
      const post = this.modelToScreen(element.swposts[index]);
      if (!selected && this.showVoltage && !this.showPower) {
        context.strokeStyle = this.voltageColor(
          element.volts[index + 1] ?? 0
        );
      }
      this.line(context, pole.x, pole.y, post.x, post.y);
    }
    const target = this.modelToScreen(
      element.swpoles[element.position] ?? element.lead2
    );
    context.strokeStyle = selected
      ? this.selectionColor
      : this.foregroundColor();
    this.line(
      context,
      commonPole.x,
      commonPole.y,
      target.x,
      target.y
    );
    context.restore();
  }

  private drawSwitch2CurrentDots(
    context: CanvasRenderingContext2D,
    element: Switch2Elm,
    dotPosition: number
  ): void {
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point1),
      this.modelToScreen(element.lead1),
      element.getCurrent(),
      dotPosition
    );
    if (element.isOpenPosition()) return;
    const pole = element.swpoles[element.position];
    const post = element.swposts[element.position];
    if (pole === undefined || post === undefined) return;
    this.drawCurrentDots(
      context,
      this.modelToScreen(pole),
      this.modelToScreen(post),
      element.getCurrent(),
      dotPosition
    );
  }

  private drawCapacitorCurrentDots(
    context: CanvasRenderingContext2D,
    element: CapacitorElm,
    dotPosition: number
  ): void {
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point1),
      this.modelToScreen(element.lead1),
      element.getCurrent(),
      dotPosition
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point2),
      this.modelToScreen(element.lead2),
      -element.getCurrent(),
      -dotPosition
    );
  }

  private drawVoltageSource(
    context: CanvasRenderingContext2D,
    element: VoltageElm,
    start: { x: number; y: number },
    end: { x: number; y: number },
    selected: boolean
  ): void {
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const { ux, uy, px, py } =
      CircuitCanvasRenderer.direction(start, end);
    context.save();
    if (!selected && this.showVoltage && !this.showPower) {
      context.strokeStyle = this.voltageColor(element.volts[0] ?? 0);
    }
    this.line(context, start.x, start.y, lead1.x, lead1.y);
    if (!selected && this.showVoltage && !this.showPower) {
      context.strokeStyle = this.voltageColor(element.volts[1] ?? 0);
    }
    this.line(context, lead2.x, lead2.y, end.x, end.y);

    if (
      element.waveform === VoltageElm.WF_DC &&
      !element.hasFlag(VoltageElm.FLAG_CIRCLE_SYMBOL)
    ) {
      const shortHalf = 10 * this.viewport.scale;
      const longHalf = 16 * this.viewport.scale;
      this.line(
        context,
        lead1.x - px * shortHalf,
        lead1.y - py * shortHalf,
        lead1.x + px * shortHalf,
        lead1.y + py * shortHalf
      );
      this.line(
        context,
        lead2.x - px * longHalf,
        lead2.y - py * longHalf,
        lead2.x + px * longHalf,
        lead2.y + py * longHalf
      );
      context.restore();
      return;
    }

    const radius = 17 * this.viewport.scale;
    const centerX = (lead1.x + lead2.x) / 2;
    const centerY = (lead1.y + lead2.y) / 2;
    context.strokeStyle = selected
      ? this.selectionColor
      : this.showPower
        ? this.powerColor(element.getPower())
        : "#8c8c8c";
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    if (element.waveform === VoltageElm.WF_DC) {
      const signHalf = 4 * this.viewport.scale;
      const minusX = lead1.x + (lead2.x - lead1.x) * 0.26;
      const minusY = lead1.y + (lead2.y - lead1.y) * 0.26;
      const plusX = lead1.x + (lead2.x - lead1.x) * 0.74;
      const plusY = lead1.y + (lead2.y - lead1.y) * 0.74;
      this.line(
        context,
        minusX - px * signHalf,
        minusY - py * signHalf,
        minusX + px * signHalf,
        minusY + py * signHalf
      );
      this.line(
        context,
        plusX - px * signHalf,
        plusY - py * signHalf,
        plusX + px * signHalf,
        plusY + py * signHalf
      );
      this.line(
        context,
        plusX - ux * signHalf,
        plusY - uy * signHalf,
        plusX + ux * signHalf,
        plusY + uy * signHalf
      );
    } else {
      this.drawVoltageWaveform(
        context,
        element.waveform,
        centerX,
        centerY,
        element.dutyCycle
      );
      this.drawVoltageSourceMarker(context, element);
    }
    context.restore();
    this.drawVoltageSourceValue(context, element, start, end);
  }

  private drawVoltageSourceMarker(
    context: CanvasRenderingContext2D,
    element: VoltageElm
  ): void {
    const marker =
      element.bias > 0 ||
      (element.bias === 0 && element.waveform === VoltageElm.WF_PULSE)
        ? "+"
        : "*";
    if (element.dn === 0) return;
    const markerPoint = element.interpPoint(
      element.point1,
      element.point2,
      (element.dn / 2 + 21) / element.dn,
      10 * element.dsign
    );
    const point = this.modelToScreen(markerPoint);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `${Math.max(10, 13 * this.viewport.scale)}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(marker, point.x, point.y);
    context.restore();
  }

  private drawVoltageSourceValue(
    context: CanvasRenderingContext2D,
    element: VoltageElm,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    if (
      element.waveform === VoltageElm.WF_DC ||
      element.waveform === VoltageElm.WF_NOISE
    ) {
      return;
    }
    const showVoltage = element.hasFlag(VoltageElm.FLAG_SHOW_VOLTAGE);
    const showFrequency = this.showValues;
    if (!showVoltage && !showFrequency) return;
    const values: string[] = [];
    if (showVoltage) {
      values.push(
        CircuitElm.getShortUnitText(
          element.bias === 0
            ? element.maxVoltage
            : element.bias + element.maxVoltage,
          "V"
        )
      );
    }
    if (showFrequency) {
      values.push(CircuitElm.getShortUnitText(element.frequency, "Hz"));
    }

    const direction = CircuitCanvasRenderer.direction(start, end);
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const offsetX = Math.abs(direction.uy * 4 * this.viewport.scale);
    const offsetY = -direction.ux * 17 * this.viewport.scale;
    const fontSize = Math.max(10, 13 * this.viewport.scale);
    const label = values.join(" ");
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `${fontSize}px Arial`;
    context.textBaseline = "alphabetic";
    const width = context.measureText(label).width;
    if (offsetX < 0.5) {
      context.textAlign = "center";
      context.fillText(label, centerX, centerY - Math.abs(offsetY) - 2);
    } else {
      context.textAlign = "left";
      context.fillText(
        label,
        centerX - width - offsetX - 2,
        centerY + offsetY + fontSize / 2
      );
    }
    context.restore();
  }

  private drawVoltageSourceCurrentDots(
    context: CanvasRenderingContext2D,
    element: VoltageElm,
    dotPosition: number
  ): void {
    const isPlainBattery =
      element.waveform === VoltageElm.WF_DC &&
      !element.hasFlag(VoltageElm.FLAG_CIRCLE_SYMBOL);
    if (isPlainBattery) {
      this.drawCurrentDots(
        context,
        this.modelToScreen(element.point1),
        this.modelToScreen(element.point2),
        element.getCurrent(),
        dotPosition
      );
      return;
    }
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point1),
      this.modelToScreen(element.lead1),
      element.getCurrent(),
      dotPosition
    );
    this.drawCurrentDots(
      context,
      this.modelToScreen(element.point2),
      this.modelToScreen(element.lead2),
      -element.getCurrent(),
      -dotPosition
    );
  }

  private drawRailSource(
    context: CanvasRenderingContext2D,
    element: RailElm
  ): void {
    const post = this.modelToScreen(element.point1);
    const lead = this.modelToScreen(element.lead1);
    const center = this.modelToScreen(element.point2);
    this.line(context, post.x, post.y, lead.x, lead.y);

    if (
      element.waveform === VoltageElm.WF_DC ||
      element.waveform === VoltageElm.WF_VAR
    ) {
      const voltage = element.getVoltage();
      let label = CircuitElm.getShortUnitText(voltage, "V");
      if (voltage > 0) label = `+${label}`;
      this.drawRailLabel(context, label, post, lead);
      return;
    }
    if (
      element.waveform === VoltageElm.WF_SQUARE &&
      element.hasFlag(RailElm.FLAG_CLOCK)
    ) {
      this.drawRailLabel(context, "CLK", post, lead);
      return;
    }

    const radius = 17 * this.viewport.scale;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    const { ux, uy, px, py } =
      CircuitCanvasRenderer.direction(post, center);
    this.drawVoltageWaveform(
      context,
      element.waveform,
      center.x,
      center.y,
      element.dutyCycle
    );
  }

  private drawRailLabel(
    context: CanvasRenderingContext2D,
    label: string,
    post: { x: number; y: number },
    lead: { x: number; y: number }
  ): void {
    const fontSize = Math.max(
      12,
      Math.min(20, 14 * this.viewport.scale)
    );
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `${fontSize}px Arial`;
    context.textBaseline = "middle";
    if (Math.abs(post.x - lead.x) < 0.5) {
      context.textAlign = "center";
      context.fillText(
        label,
        lead.x,
        lead.y + Math.sign(lead.y - post.y) * fontSize
      );
    } else {
      const direction = Math.sign(lead.x - post.x);
      context.textAlign = direction > 0 ? "left" : "right";
      context.fillText(label, lead.x + direction * 4, lead.y);
    }
    context.restore();
  }

  private drawVoltageWaveform(
    context: CanvasRenderingContext2D,
    waveform: number,
    centerX: number,
    centerY: number,
    dutyCycle: number
  ): void {
    const along = (value: number, perpendicular: number) => ({
      x: centerX + value,
      y: centerY + perpendicular
    });
    const size = 8 * this.viewport.scale;
    context.beginPath();
    if (waveform === VoltageElm.WF_AC) {
      for (let index = -10; index <= 10; index += 1) {
        const x = index * this.viewport.scale;
        const point = along(
          x,
          Math.sin((index * Math.PI) / 10) * size * 0.95
        );
        if (index === -10) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
    } else if (waveform === VoltageElm.WF_SQUARE) {
      const transition = Math.max(
        -size + 3,
        Math.min(size - 3, size * 2 * dutyCycle - size)
      );
      const points = [
        along(-size, 0),
        along(-size, -size),
        along(transition, -size),
        along(transition, size),
        along(size, size),
        along(size, 0)
      ];
      points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    } else if (waveform === VoltageElm.WF_TRIANGLE) {
      [
        along(-size, 0),
        along(-size / 2, -size),
        along(0, 0),
        along(size / 2, size),
        along(size, 0)
      ].forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    } else if (waveform === VoltageElm.WF_SAWTOOTH) {
      [
        along(-size, 0),
        along(0, -size),
        along(0, size),
        along(size, 0)
      ].forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    } else if (waveform === VoltageElm.WF_PULSE) {
      [
        along(-size, size / 2),
        along(-size, -size / 2),
        along(-size / 2, -size / 2),
        along(-size / 2, size / 2),
        along(size, size / 2)
      ].forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
    } else {
      const left = along(-size, 0);
      const right = along(size, 0);
      context.moveTo(left.x, left.y);
      context.lineTo(right.x, right.y);
    }
    context.stroke();
  }

  private drawCurrentSource(
    context: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    const { ux, uy, px, py, length } =
      CircuitCanvasRenderer.direction(start, end);
    const radius = Math.min(18, Math.max(11, length / 5));
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    this.line(
      context,
      start.x,
      start.y,
      centerX - ux * radius,
      centerY - uy * radius
    );
    this.line(
      context,
      centerX + ux * radius,
      centerY + uy * radius,
      end.x,
      end.y
    );
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    this.line(
      context,
      centerX - ux * 8,
      centerY - uy * 8,
      centerX + ux * 8,
      centerY + uy * 8
    );
    context.beginPath();
    context.moveTo(centerX + ux * 8, centerY + uy * 8);
    context.lineTo(
      centerX + ux * 2 + px * 4,
      centerY + uy * 2 + py * 4
    );
    context.lineTo(
      centerX + ux * 2 - px * 4,
      centerY + uy * 2 - py * 4
    );
    context.closePath();
    context.fill();
  }

  private drawGround(
    context: CanvasRenderingContext2D,
    post: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    this.line(context, post.x, post.y, end.x, end.y);
    const { ux, uy, px, py } =
      CircuitCanvasRenderer.direction(post, end);
    for (let index = 0; index < 3; index += 1) {
      const centerX = end.x + ux * index * 5;
      const centerY = end.y + uy * index * 5;
      const half = 12 - index * 4;
      this.line(
        context,
        centerX - px * half,
        centerY - py * half,
        centerX + px * half,
        centerY + py * half
      );
    }
  }

  private drawDiode(
    context: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    zener: boolean
  ): void {
    const { ux, uy, px, py, length } =
      CircuitCanvasRenderer.direction(start, end);
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const half = Math.min(12, length / 4);
    this.line(
      context,
      start.x,
      start.y,
      centerX - ux * half,
      centerY - uy * half
    );
    this.line(
      context,
      centerX + ux * half,
      centerY + uy * half,
      end.x,
      end.y
    );
    context.beginPath();
    context.moveTo(centerX - ux * half - px * 10, centerY - uy * half - py * 10);
    context.lineTo(centerX - ux * half + px * 10, centerY - uy * half + py * 10);
    context.lineTo(centerX + ux * half, centerY + uy * half);
    context.closePath();
    context.stroke();
    if (zener) {
      this.line(
        context,
        centerX + ux * half - px * 12 - ux * 4,
        centerY + uy * half - py * 12 - uy * 4,
        centerX + ux * half + px * 12 + ux * 4,
        centerY + uy * half + py * 12 + uy * 4
      );
    } else {
      this.line(
        context,
        centerX + ux * half - px * 12,
        centerY + uy * half - py * 12,
        centerX + ux * half + px * 12,
        centerY + uy * half + py * 12
      );
    }
  }

  private drawOpAmp(
    context: CanvasRenderingContext2D,
    element: OpAmpElm
  ): void {
    const posts = [0, 1, 2].map((index) =>
      this.modelToScreen(element.getPost(index))
    );
    context.beginPath();
    context.moveTo(posts[0].x, posts[0].y - 18);
    context.lineTo(posts[0].x, posts[0].y + 18);
    context.lineTo(posts[2].x, posts[2].y);
    context.closePath();
    context.stroke();
    context.font = "12px Arial";
    context.fillText("−", posts[0].x + 5, posts[0].y - 6);
    context.fillText("+", posts[1].x + 5, posts[1].y + 12);
  }

  private drawMeterCircle(
    context: CanvasRenderingContext2D,
    element: CircuitElm,
    label: string
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const radius = Math.min(14 * this.viewport.scale, direction.length / 3);
    this.line(
      context,
      first.x,
      first.y,
      center.x - direction.ux * radius,
      center.y - direction.uy * radius
    );
    this.line(
      context,
      center.x + direction.ux * radius,
      center.y + direction.uy * radius,
      second.x,
      second.y
    );
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `bold ${Math.max(10, 13 * this.viewport.scale)}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, center.x, center.y);
    context.restore();
  }

  private drawBox(
    context: CanvasRenderingContext2D,
    element: BoxElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    context.save();
    context.strokeStyle = this.whiteBackground ? "#64748b" : "#94a3b8";
    context.lineWidth = Math.max(1, 1.5 * this.viewport.scale);
    context.setLineDash([5, 4]);
    context.strokeRect(
      Math.min(first.x, second.x),
      Math.min(first.y, second.y),
      Math.abs(second.x - first.x),
      Math.abs(second.y - first.y)
    );
    context.restore();
  }

  private drawInstructionDisplay(
    context: CanvasRenderingContext2D,
    element: InstructionDisplayElm
  ): void {
    const point = this.modelToScreen(element.point1);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `bold ${Math.max(12, 16 * this.viewport.scale)}px Arial`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText(element.getDisplayText(), point.x + 5, point.y);
    context.restore();
  }

  private drawBusLogicInput(
    context: CanvasRenderingContext2D,
    element: BusLogicInputElm
  ): void {
    const point = this.modelToScreen(element.point1);
    const text = `0x${element.value.toString(16).toUpperCase()}`;
    const width = Math.max(30, 9 * text.length) * this.viewport.scale;
    const height = 22 * this.viewport.scale;
    context.save();
    context.fillStyle = this.whiteBackground ? "#ffffff" : "#050505";
    context.fillRect(point.x - width, point.y - height / 2, width, height);
    context.strokeRect(point.x - width, point.y - height / 2, width, height);
    context.fillStyle = this.foregroundColor();
    context.font = `${Math.max(10, 12 * this.viewport.scale)}px monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, point.x - width / 2, point.y);
    context.restore();
  }

  private drawSchmitt(
    context: CanvasRenderingContext2D,
    element: InvertingSchmittElm,
    inverting: boolean
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const lead1 = this.modelToScreen(element.lead1);
    const lead2 = this.modelToScreen(element.lead2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const halfHeight = 11 * this.viewport.scale;
    this.line(context, first.x, first.y, lead1.x, lead1.y);
    context.beginPath();
    context.moveTo(
      lead1.x - direction.px * halfHeight,
      lead1.y - direction.py * halfHeight
    );
    context.lineTo(
      lead1.x + direction.px * halfHeight,
      lead1.y + direction.py * halfHeight
    );
    context.lineTo(lead2.x, lead2.y);
    context.closePath();
    context.stroke();

    const center = {
      x: (lead1.x + lead2.x) / 2,
      y: (lead1.y + lead2.y) / 2
    };
    const glyphLength = 7 * this.viewport.scale;
    const glyphHeight = 4 * this.viewport.scale;
    const glyphStart = {
      x: center.x - direction.ux * glyphLength,
      y: center.y - direction.uy * glyphLength
    };
    this.line(
      context,
      glyphStart.x - direction.px * glyphHeight,
      glyphStart.y - direction.py * glyphHeight,
      center.x - direction.px * glyphHeight,
      center.y - direction.py * glyphHeight
    );
    this.line(
      context,
      center.x - direction.px * glyphHeight,
      center.y - direction.py * glyphHeight,
      center.x + direction.px * glyphHeight,
      center.y + direction.py * glyphHeight
    );
    this.line(
      context,
      center.x + direction.px * glyphHeight,
      center.y + direction.py * glyphHeight,
      center.x + direction.ux * glyphLength + direction.px * glyphHeight,
      center.y + direction.uy * glyphLength + direction.py * glyphHeight
    );

    if (inverting) {
      const bubbleCenter = {
        x: lead2.x + direction.ux * 4 * this.viewport.scale,
        y: lead2.y + direction.uy * 4 * this.viewport.scale
      };
      context.beginPath();
      context.arc(
        bubbleCenter.x,
        bubbleCenter.y,
        4 * this.viewport.scale,
        0,
        Math.PI * 2
      );
      context.stroke();
      this.line(
        context,
        bubbleCenter.x + direction.ux * 4 * this.viewport.scale,
        bubbleCenter.y + direction.uy * 4 * this.viewport.scale,
        second.x,
        second.y
      );
    } else {
      this.line(context, lead2.x, lead2.y, second.x, second.y);
    }
  }

  private drawTunnelDiode(
    context: CanvasRenderingContext2D,
    element: TunnelDiodeElm
  ): void {
    this.drawDiode(
      context,
      this.modelToScreen(element.point1),
      this.modelToScreen(element.point2),
      false
    );
  }

  private drawSparkGap(
    context: CanvasRenderingContext2D,
    element: SparkGapElm
  ): void {
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const gap = 7 * this.viewport.scale;
    const leftTip = {
      x: center.x - direction.ux * gap,
      y: center.y - direction.uy * gap
    };
    const rightTip = {
      x: center.x + direction.ux * gap,
      y: center.y + direction.uy * gap
    };
    this.line(context, first.x, first.y, leftTip.x, leftTip.y);
    this.line(context, rightTip.x, rightTip.y, second.x, second.y);
    for (const [tip, sign] of [
      [leftTip, -1],
      [rightTip, 1]
    ] as const) {
      context.beginPath();
      context.moveTo(tip.x, tip.y);
      context.lineTo(
        tip.x + direction.ux * sign * 9 + direction.px * 6,
        tip.y + direction.uy * sign * 9 + direction.py * 6
      );
      context.lineTo(
        tip.x + direction.ux * sign * 9 - direction.px * 6,
        tip.y + direction.uy * sign * 9 - direction.py * 6
      );
      context.closePath();
      context.stroke();
    }
  }

  private drawTriac(
    context: CanvasRenderingContext2D,
    element: TriacElm
  ): void {
    const first = this.modelToScreen(element.getPost(0));
    const second = this.modelToScreen(element.getPost(1));
    const gate = this.modelToScreen(element.getPost(2));
    const center = this.drawBidirectionalTrigger(context, first, second);
    this.line(context, gate.x, gate.y, center.x, center.y);
  }

  private drawDiac(
    context: CanvasRenderingContext2D,
    element: DiacElm
  ): void {
    this.drawBidirectionalTrigger(
      context,
      this.modelToScreen(element.point1),
      this.modelToScreen(element.point2)
    );
  }

  private drawBidirectionalTrigger(
    context: CanvasRenderingContext2D,
    first: { x: number; y: number },
    second: { x: number; y: number }
  ): { x: number; y: number } {
    const direction = CircuitCanvasRenderer.direction(first, second);
    const center = {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    };
    const half = 10 * this.viewport.scale;
    const left = {
      x: center.x - direction.ux * half,
      y: center.y - direction.uy * half
    };
    const right = {
      x: center.x + direction.ux * half,
      y: center.y + direction.uy * half
    };
    this.line(context, first.x, first.y, left.x, left.y);
    this.line(context, right.x, right.y, second.x, second.y);
    context.beginPath();
    context.moveTo(
      left.x - direction.px * 9,
      left.y - direction.py * 9
    );
    context.lineTo(
      left.x + direction.px * 9,
      left.y + direction.py * 9
    );
    context.lineTo(center.x, center.y);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(
      right.x - direction.px * 9,
      right.y - direction.py * 9
    );
    context.lineTo(
      right.x + direction.px * 9,
      right.y + direction.py * 9
    );
    context.lineTo(center.x, center.y);
    context.closePath();
    context.stroke();
    return center;
  }

  private drawTappedTransformer(
    context: CanvasRenderingContext2D,
    element: TappedTransformerElm
  ): void {
    const primaryStart = this.modelToScreen(element.getPost(0));
    const primaryEnd = this.modelToScreen(element.getPost(1));
    const secondaryStart = this.modelToScreen(element.getPost(2));
    const secondaryTap = this.modelToScreen(element.getPost(3));
    const secondaryEnd = this.modelToScreen(element.getPost(4));
    this.drawInductor(context, primaryStart, primaryEnd);
    this.drawInductor(context, secondaryStart, secondaryEnd);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.beginPath();
    context.arc(secondaryTap.x, secondaryTap.y, 3, 0, Math.PI * 2);
    context.fill();
    const primaryDirection = CircuitCanvasRenderer.direction(
      primaryStart,
      primaryEnd
    );
    const primaryMiddle = {
      x: (primaryStart.x + primaryEnd.x) / 2,
      y: (primaryStart.y + primaryEnd.y) / 2
    };
    const secondaryMiddle = {
      x: (secondaryStart.x + secondaryEnd.x) / 2,
      y: (secondaryStart.y + secondaryEnd.y) / 2
    };
    context.strokeStyle = this.whiteBackground ? "#64748b" : "#94a3b8";
    for (const offset of [-3, 3]) {
      this.line(
        context,
        primaryMiddle.x + primaryDirection.px * offset,
        primaryMiddle.y + primaryDirection.py * offset,
        secondaryMiddle.x + primaryDirection.px * offset,
        secondaryMiddle.y + primaryDirection.py * offset
      );
    }
    context.restore();
  }

  private drawThreePhaseMotor(
    context: CanvasRenderingContext2D,
    element: ThreePhaseMotorElm,
    elapsedMilliseconds: number,
    currentSpeed: number
  ): void {
    const posts = Array.from({ length: 6 }, (_, index) =>
      this.modelToScreen(element.getPost(index))
    );
    const leads = element.leads.map((lead) => this.modelToScreen(lead));
    const center = this.modelToScreen(element.motorCenter);
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    const axis = CircuitCanvasRenderer.direction(first, second);
    const radius = 37 * this.viewport.scale;
    context.save();
    context.lineWidth = 3;
    for (let index = 0; index < 6; index += 1) {
      context.strokeStyle = this.showVoltage
        ? this.voltageColor(element.volts[index] ?? 0)
        : this.foregroundColor();
      this.line(
        context,
        posts[index].x,
        posts[index].y,
        leads[index].x,
        leads[index].y
      );
    }
    this.drawThreePhaseMotorCurrentDots(
      context,
      element,
      elapsedMilliseconds,
      currentSpeed
    );

    context.fillStyle = "#a5a5a5";
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#0a0a0a";
    context.beginPath();
    context.arc(center.x, center.y, radius / 2.2, 0, Math.PI * 2);
    context.fill();

    const rotorHalfLength = 23.48 * this.viewport.scale;
    const angle = Math.round(element.angle * 300) / 300;
    context.strokeStyle = "#0a0a0a";
    context.lineWidth = 6;
    for (let arm = 0; arm < 3; arm += 1) {
      const armAngle = angle + arm * Math.PI / 3;
      const offsetX =
        rotorHalfLength *
        (axis.ux * Math.cos(armAngle) - axis.px * Math.sin(armAngle));
      const offsetY =
        rotorHalfLength *
        (axis.uy * Math.cos(armAngle) - axis.py * Math.sin(armAngle));
      this.line(
        context,
        center.x - offsetX,
        center.y - offsetY,
        center.x + offsetX,
        center.y + offsetY
      );
    }

    context.fillStyle = this.foregroundColor();
    context.font = "14px Arial";
    const vertical = Math.abs(element.dy) > Math.abs(element.dx);
    if (vertical) {
      context.textAlign = "left";
      for (let phase = 0; phase < 3; phase += 1) {
        const letter = "UVW"[phase];
        context.fillText(
          `${letter}1`,
          posts[phase * 2].x + 5,
          posts[phase * 2].y + 8
        );
        context.fillText(
          `${letter}2`,
          posts[phase * 2 + 1].x + 5,
          posts[phase * 2 + 1].y - 2
        );
      }
    } else {
      context.textAlign = "center";
      for (let phase = 0; phase < 3; phase += 1) {
        const letter = "UVW"[phase];
        context.fillText(
          `${letter}1`,
          posts[phase * 2].x + 11,
          posts[phase * 2].y - 7
        );
        context.fillText(
          `${letter}2`,
          posts[phase * 2 + 1].x - 11,
          posts[phase * 2 + 1].y - 7
        );
      }
    }
    element.filteredSpeed =
      element.filteredSpeed * 0.98 + element.speed * 0.02;
    context.restore();
  }

  private drawGyrator(
    context: CanvasRenderingContext2D,
    element: GyratorElm
  ): void {
    const posts = Array.from({ length: 4 }, (_, index) =>
      this.modelToScreen(element.getPost(index))
    );
    const center = {
      x: posts.reduce((sum, point) => sum + point.x, 0) / 4,
      y: posts.reduce((sum, point) => sum + point.y, 0) / 4
    };
    const width = Math.max(
      20,
      Math.hypot(posts[0].x - posts[1].x, posts[0].y - posts[1].y) *
        0.35
    );
    const height = Math.max(
      18,
      Math.hypot(posts[0].x - posts[2].x, posts[0].y - posts[2].y) *
        0.65
    );
    context.strokeRect(
      center.x - width / 2,
      center.y - height / 2,
      width,
      height
    );
    for (const post of posts) {
      const target = {
        x: Math.max(
          center.x - width / 2,
          Math.min(center.x + width / 2, post.x)
        ),
        y: Math.max(
          center.y - height / 2,
          Math.min(center.y + height / 2, post.y)
        )
      };
      this.line(context, post.x, post.y, target.x, target.y);
    }
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `bold ${Math.max(9, 11 * this.viewport.scale)}px Arial`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("R", center.x, center.y);
    context.restore();
  }

  private drawGenericElement(
    context: CanvasRenderingContext2D,
    element: CircuitElm,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): void {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    this.line(context, start.x, start.y, centerX - 18, centerY);
    this.line(context, centerX + 18, centerY, end.x, end.y);
    context.strokeRect(centerX - 18, centerY - 13, 36, 26);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = "10px Arial";
    context.textAlign = "center";
    context.fillText(
      element.getClassName().replace(/Elm$/, ""),
      centerX,
      centerY + 3
    );
    context.restore();
  }

  private drawLeads(
    context: CanvasRenderingContext2D,
    post1: { x: number; y: number },
    lead1: { x: number; y: number },
    lead2: { x: number; y: number },
    post2: { x: number; y: number }
  ): void {
    this.line(context, post1.x, post1.y, lead1.x, lead1.y);
    this.line(context, lead2.x, lead2.y, post2.x, post2.y);
  }

  private drawPosts(
    context: CanvasRenderingContext2D,
    element: CircuitElm
  ): void {
    context.save();
    context.fillStyle = this.foregroundColor();
    for (let index = 0; index < element.getPostCount(); index += 1) {
      const point = this.modelToScreen(element.getPost(index));
      context.beginPath();
      context.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawSelection(
    context: CanvasRenderingContext2D,
    element: CircuitElm
  ): void {
    if (element instanceof SwitchElm) {
      const interactionBounds = getSwitchInteractionBounds(element);
      const visualBounds = boundsForPoints(
        [
          element.point1,
          element.point2,
          { x: interactionBounds.left, y: interactionBounds.top },
          { x: interactionBounds.right, y: interactionBounds.bottom }
        ],
        8 / this.viewport.scale
      );
      const topLeft = this.modelToScreen(
        new Point(visualBounds.left, visualBounds.top)
      );
      const bottomRight = this.modelToScreen(
        new Point(visualBounds.right, visualBounds.bottom)
      );
      context.save();
      context.strokeStyle = this.selectionColor;
      context.lineWidth = 1;
      context.setLineDash([4, 3]);
      context.strokeRect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      );
      context.restore();
      return;
    }
    const first = this.modelToScreen(element.point1);
    const second = this.modelToScreen(element.point2);
    context.save();
    context.strokeStyle = this.selectionColor;
    context.lineWidth = 1;
    context.setLineDash([4, 3]);
    context.strokeRect(
      Math.min(first.x, second.x) - 18,
      Math.min(first.y, second.y) - 18,
      Math.abs(second.x - first.x) + 36,
      Math.abs(second.y - first.y) + 36
    );
    context.restore();
  }

  private updateCurrentDotPosition(
    element: CircuitElm,
    current: number,
    elapsedMilliseconds: number,
    currentSpeed: number
  ): number {
    element.curcount = this.nextCurrentDotPosition(
      current,
      element.curcount,
      elapsedMilliseconds,
      currentSpeed
    );
    return element.curcount;
  }

  private nextCurrentDotPosition(
    current: number,
    previousPosition: number,
    elapsedMilliseconds: number,
    currentSpeed: number
  ): number {
    if (
      !this.showCurrent ||
      elapsedMilliseconds <= 0 ||
      !Number.isFinite(current)
    ) {
      return previousPosition;
    }
    const displayedCurrent = this.conventionalCurrent ? -current : current;
    const advance = calculateCurrentDotAdvance(
      displayedCurrent,
      elapsedMilliseconds,
      currentSpeed
    );
    if (advance > 6) {
      return CURRENT_TOO_FAST;
    }
    if (advance < -6) {
      return -CURRENT_TOO_FAST;
    }
    const previous =
      Math.abs(previousPosition) === CURRENT_TOO_FAST
        ? 0
        : previousPosition;
    return previous + (advance % 8);
  }

  private drawCurrentDots(
    context: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    current: number,
    dotPosition: number
  ): void {
    if (!this.showCurrent) {
      return;
    }
    if (!shouldDrawCurrentDots(current, dotPosition)) {
      return;
    }
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length < 12) {
      return;
    }
    let phase = dotPosition;
    context.save();
    context.fillStyle = this.currentColor;
    if (Math.abs(phase) === CURRENT_TOO_FAST) {
      context.save();
      context.globalAlpha = 0.5;
      context.lineWidth = 4;
      context.strokeStyle = this.currentColor;
      this.line(context, start.x, start.y, end.x, end.y);
      context.restore();
      phase = Math.random() * 16;
    }
    phase = ((phase % 16) + 16) % 16;
    for (let distance = phase; distance < length; distance += 16) {
      const fraction = distance / length;
      const x = start.x + (end.x - start.x) * fraction;
      const y = start.y + (end.y - start.y) * fraction;
      context.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
    context.restore();
  }

  private drawLabel(
    context: CanvasRenderingContext2D,
    label: string,
    start: { x: number; y: number },
    end: { x: number; y: number },
    offset = 8,
    respectShowValues = true
  ): void {
    if (respectShowValues && !this.showValues) {
      return;
    }
    const direction = CircuitCanvasRenderer.direction(start, end);
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const scaledOffset = offset * this.viewport.scale;
    const perpendicularX = direction.uy * scaledOffset;
    const perpendicularY = -direction.ux * scaledOffset;
    const fontSize = Math.max(10, 13 * this.viewport.scale);
    context.save();
    context.fillStyle = this.foregroundColor();
    context.font = `${fontSize}px Arial`;
    context.textBaseline = "alphabetic";
    if (Math.abs(perpendicularX) < 0.5) {
      context.textAlign = "center";
      context.fillText(
        label,
        centerX,
        centerY - Math.abs(perpendicularY) - 2
      );
    } else {
      const width = context.measureText(label).width;
      let x = centerX + Math.abs(perpendicularX) + 2;
      if (start.x < end.x && start.y > end.y) {
        x = centerX - width - Math.abs(perpendicularX) - 2;
      }
      context.textAlign = "left";
      context.fillText(
        label,
        x,
        centerY + perpendicularY + fontSize / 2
      );
    }
    context.restore();
  }

  private voltageColor(voltage: number): string {
    const normalized = Math.max(
      -1,
      Math.min(1, voltage / Math.max(CircuitElm.voltageRange, 1e-12))
    );
    if (normalized > 0.02) {
      return this.mixColor(this.neutralColor, this.positiveColor, normalized);
    }
    if (normalized < -0.02) {
      return this.mixColor(
        this.neutralColor,
        this.negativeColor,
        -normalized
      );
    }
    return this.neutralColor;
  }

  private mixColor(first: string, second: string, amount: number): string {
    const parse = (value: string) => {
      const expanded =
        value.length === 4
          ? value
              .slice(1)
              .split("")
              .map((character) => character + character)
              .join("")
          : value.slice(1);
      return [0, 2, 4].map((offset) =>
        Number.parseInt(expanded.slice(offset, offset + 2), 16)
      );
    };
    const start = parse(first);
    const end = parse(second);
    const channel = (index: number) =>
      Math.round(start[index] + (end[index] - start[index]) * amount);
    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
  }

  private powerColor(power: number): string {
    const normalized = Math.min(1, Math.abs(power) / 0.5);
    const red = Math.round(100 + normalized * 155);
    const green = Math.round(100 - normalized * 75);
    return `rgb(${red}, ${green}, 48)`;
  }

  private foregroundColor(): string {
    return this.whiteBackground ? "#111827" : "#e5e7eb";
  }

  private line(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }

  private static direction(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): {
    ux: number;
    uy: number;
    px: number;
    py: number;
    length: number;
  } {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const ux = dx / length;
    const uy = dy / length;
    return { ux, uy, px: -uy, py: ux, length };
  }

  private static distanceToSegment(
    x: number,
    y: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) {
      return Math.hypot(x - x1, y - y1);
    }
    const fraction = Math.max(
      0,
      Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)
    );
    return Math.hypot(
      x - (x1 + fraction * dx),
      y - (y1 + fraction * dy)
    );
  }
}
