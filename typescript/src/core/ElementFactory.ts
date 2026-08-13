import type { CircuitElementRecord } from "./CircuitLoader";
import { CircuitElm } from "./CircuitElm";
import { StringTokenizer } from "./StringTokenizer";
import type { XmlRecord } from "./XMLDeserializer";
import { XMLDeserializer } from "./XMLDeserializer";
import {
  AMElm,
  AmmeterElm,
  ADCElm,
  AnalogMuxElm,
  AnalogSwitchElm,
  AnalogSwitch2Elm,
  AndGateElm,
  AntennaElm,
  AudioInputElm,
  AudioOutputElm,
  BoxElm,
  BusLogicInputElm,
  BusSplitterElm,
  BusTransceiverElm,
  CapacitorElm,
  ComparatorElm,
  CC2Elm,
  CCCSElm,
  CCVSElm,
  DFlipFlopElm,
  DCMotorElm,
  DPDTSwitchElm,
  DelayBufferElm,
  ExtVoltageElm,
  FullAdderElm,
  FuseElm,
  HalfAdderElm,
  GyratorElm,
  CurrentElm,
  CounterElm,
  Counter2Elm,
  CrossSwitchElm,
  CrystalElm,
  CustomCompositeElm,
  CustomLogicElm,
  CustomTransformerElm,
  DiodeElm,
  DACElm,
  DarlingtonElm,
  DataInputElm,
  DataRecorderElm,
  DecimalDisplayElm,
  DeMultiplexerElm,
  DiacElm,
  GroundElm,
  InductorElm,
  InverterElm,
  InstructionDisplayElm,
  InvertingSchmittElm,
  JfetElm,
  JKFlipFlopElm,
  LatchElm,
  LampElm,
  LEDArrayElm,
  LEDElm,
  LineElm,
  FMElm,
  MosfetElm,
  MotorProtectionSwitchElm,
  MonostableElm,
  MultiplexerElm,
  LogicInputElm,
  LogicOutputElm,
  MBBSwitchElm,
  MemristorElm,
  LabeledNodeElm,
  LDRElm,
  NandGateElm,
  NorGateElm,
  OpAmpElm,
  OpAmpRealElm,
  OptocouplerElm,
  OhmMeterElm,
  OTAElm,
  OrGateElm,
  PhaseCompElm,
  PisoShiftElm,
  OutputElm,
  PotElm,
  PolarCapacitorElm,
  ProbeElm,
  NoiseElm,
  RailElm,
  RelayElm,
  RelayCoilElm,
  RelayContactElm,
  ResistorElm,
  ROMElm,
  RingCounterElm,
  RoutedWireElm,
  ScopeElm,
  SeqGenElm,
  SipoShiftElm,
  SCRElm,
  SchmittElm,
  SevenSegDecoderElm,
  SevenSegElm,
  SparkGapElm,
  SRAMElm,
  StopTriggerElm,
  SwitchElm,
  Switch2Elm,
  SweepElm,
  TappedTransformerElm,
  TextElm,
  TestPointElm,
  ThreePhaseMotorElm,
  TimerElm,
  TFlipFlopElm,
  ThermistorNTCElm,
  TimeDelayRelayElm,
  TransLineElm,
  TransformerElm,
  TriacElm,
  TriStateElm,
  TriodeElm,
  TransistorElm,
  TunnelDiodeElm,
  UnijunctionElm,
  VoltageElm,
  VaractorElm,
  VarRailElm,
  VCCSElm,
  VCVSElm,
  VCOElm,
  WattmeterElm,
  WireElm,
  XorGateElm,
  XnorGateElm,
  ZenerElm
} from "./elements";

type ElementCreator = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  flags: number,
  tokenizer: StringTokenizer
) => CircuitElm;

type XmlElementCreator = (x: number, y: number) => CircuitElm;

/**
 * Explicit TypeScript registry replacing GWT's generated
 * ElementFactoryGenerator for migrated element classes.
 */
export class ElementFactory {
  private readonly creators = new Map<string, ElementCreator>();
  private readonly xmlCreators = new Map<string, XmlElementCreator>();

  public constructor() {
    this.register("r", (...args) => new ResistorElm(...args));
    this.register("c", (...args) => new CapacitorElm(...args));
    this.register("l", (...args) => new InductorElm(...args));
    this.register("w", (...args) => new WireElm(...args));
    this.register("s", (...args) => new SwitchElm(...args));
    this.register("i", (...args) => new CurrentElm(...args));
    this.register("v", (...args) => new VoltageElm(...args));
    this.register("d", (...args) => new DiodeElm(...args));
    this.register("z", (...args) => new ZenerElm(...args));
    this.register("g", (...args) => new GroundElm(...args));
    this.register("R", (...args) => new RailElm(...args));
    this.register("f", (...args) => new MosfetElm(...args));
    this.register("t", (...args) => new TransistorElm(...args));
    this.register("j", (...args) => new JfetElm(...args));
    this.register("a", (...args) => new OpAmpElm(...args));
    this.register("n", (...args) => new NoiseElm(...args));
    this.register("A", (...args) => new AntennaElm(...args));
    this.register("200", (...args) => new AMElm(...args));
    this.register("201", (...args) => new FMElm(...args));
    this.register("L", (...args) => new LogicInputElm(...args));
    this.register("M", (...args) => new LogicOutputElm(...args));
    this.register("I", (...args) => new InverterElm(...args));
    this.register("150", (...args) => new AndGateElm(...args));
    this.register("151", (...args) => new NandGateElm(...args));
    this.register("152", (...args) => new OrGateElm(...args));
    this.register("153", (...args) => new NorGateElm(...args));
    this.register("154", (...args) => new XorGateElm(...args));
    this.register("p", (...args) => new ProbeElm(...args));
    this.register("x", (...args) => new TextElm(...args));
    this.register("O", (...args) => new OutputElm(...args));
    this.register("207", (...args) => new LabeledNodeElm(...args));
    this.register("S", (...args) => new Switch2Elm(...args));
    this.register("159", (...args) => new AnalogSwitchElm(...args));
    this.register("160", (...args) => new AnalogSwitch2Elm(...args));
    this.register("162", (...args) => new LEDElm(...args));
    this.register("172", (...args) => new VarRailElm(...args));
    this.register("170", (...args) => new SweepElm(...args));
    this.register("174", (...args) => new PotElm(...args));
    this.register("m", (...args) => new MemristorElm(...args));
    this.register("211", (...args) => new AudioOutputElm(...args));
    this.register("155", (...args) => new DFlipFlopElm(...args));
    this.register("156", (...args) => new JKFlipFlopElm(...args));
    this.register("165", (...args) => new TimerElm(...args));
    this.register("171", (...args) => new TransLineElm(...args));
    this.register("418", (...args) => new ExtVoltageElm(...args));
    this.register("179", (...args) => new CC2Elm(...args));
    this.register("178", (...args) => new RelayElm(...args));
    this.register("T", (...args) => new TransformerElm(...args));
    this.register("167", (...args) => new ADCElm(...args));
    this.register("166", (...args) => new DACElm(...args));
    this.register("164", (...args) => new CounterElm(...args));
    this.register("421", (...args) => new Counter2Elm(...args));
    this.register("163", (...args) => new RingCounterElm(...args));
    this.register("184", (...args) => new MultiplexerElm(...args));
    this.register("212", (...args) => new VCVSElm(...args));
    this.register("213", (...args) => new VCCSElm(...args));
    this.register("214", (...args) => new CCVSElm(...args));
    this.register("215", (...args) => new CCCSElm(...args));
    this.register("425", (...args) => new RelayCoilElm(...args));
    this.register("426", (...args) => new RelayContactElm(...args));
    this.register("187", (...args) => new SparkGapElm(...args));
    this.register("175", (...args) => new TunnelDiodeElm(...args));
    this.register("176", (...args) => new VaractorElm(...args));
    this.register("419", (...args) => new DecimalDisplayElm(...args));
    this.register("403", (...args) => new ScopeElm(...args));
    this.register("423", (...args) => new LineElm(...args));
    this.register("433", (...args) => new BusSplitterElm(...args));
    this.register("168", (...args) => new LatchElm(...args));
    this.register("197", (...args) => new SevenSegDecoderElm(...args));
    this.register("157", (...args) => new SevenSegElm(...args));
    this.register("b", (...args) => new BoxElm(...args));
    this.register("370", (...args) => new AmmeterElm(...args));
    this.register("412", (...args) => new CrystalElm(...args));
    this.register("436", (...args) => new ROMElm(...args));
    this.register("203", (...args) => new DiacElm(...args));
    this.register("405", (...args) => new LEDArrayElm(...args));
    this.register("430", (...args) => new CrossSwitchElm(...args));
    this.register("169", (...args) => new TappedTransformerElm(...args));
    this.register("177", (...args) => new SCRElm(...args));
    this.register("206", (...args) => new TriacElm(...args));
    this.register("173", (...args) => new TriodeElm(...args));
    this.register("208", (...args) => new CustomLogicElm(...args));
    this.register("428", (...args) => new MotorProtectionSwitchElm(...args));
    this.register("417", (...args) => new UnijunctionElm(...args));
    this.register("427", (...args) => new ThreePhaseMotorElm(...args));
    this.register("400", (...args) => new DarlingtonElm(...args));
    this.register("402", (...args) => new OTAElm(...args));
    this.register("181", (...args) => new LampElm(...args));
    this.register("196", (...args) => new FullAdderElm(...args));
    this.register("209", (...args) => new PolarCapacitorElm(...args));
    this.register("161", (...args) => new PhaseCompElm(...args));
    this.register("158", (...args) => new VCOElm(...args));
    this.register("182", (...args) => new SchmittElm(...args));
    this.register("183", (...args) => new InvertingSchmittElm(...args));
    this.register("185", (...args) => new DeMultiplexerElm(...args));
    this.register("193", (...args) => new TFlipFlopElm(...args));
    this.register("194", (...args) => new MonostableElm(...args));
    this.register("195", (...args) => new HalfAdderElm(...args));
    this.register("186", (...args) => new PisoShiftElm(...args));
    this.register("189", (...args) => new SipoShiftElm(...args));
    this.register("401", (...args) => new ComparatorElm(...args));
    this.register("431", (...args) => new XnorGateElm(...args));
    this.register("432", (...args) => new AnalogMuxElm(...args));
    this.register("422", (...args) => new DelayBufferElm(...args));
    this.register("188", (...args) => new SeqGenElm(...args));
    this.register("414", (...args) => new TimeDelayRelayElm(...args));
    this.register("404", (...args) => new FuseElm(...args));
    this.register("374", (...args) => new LDRElm(...args));
    this.register("350", (...args) => new ThermistorNTCElm(...args));
    this.register("216", (...args) => new OhmMeterElm(...args));
    this.register("180", (...args) => new TriStateElm(...args));
    this.register("429", (...args) => new DPDTSwitchElm(...args));
    this.register("416", (...args) => new MBBSwitchElm(...args));
    this.register("408", (...args) => new StopTriggerElm(...args));
    this.register("368", (...args) => new TestPointElm(...args));
    this.register("420", (...args) => new WattmeterElm(...args));
    this.register("413", (...args) => new SRAMElm(...args));
    this.register("424", (...args) => new DataInputElm(...args));
    this.register("210", (...args) => new DataRecorderElm(...args));
    this.register("411", (...args) => new AudioInputElm(...args));
    this.register("415", (...args) => new DCMotorElm(...args));
    this.register("409", (...args) => new OpAmpRealElm(...args));
    this.register("407", (...args) => new OptocouplerElm(...args));
    this.register("406", (...args) => new CustomTransformerElm(...args));
    // UI-only aliases for elements whose portable save form is XML-only.
    this.register("__routedWire", (x, y) => new RoutedWireElm(x, y));
    this.register("__busInput", (x, y) => new BusLogicInputElm(x, y));
    this.register("__busTransceiver", (...args) =>
      new BusTransceiverElm(...args)
    );
    this.register("__instruction", (x, y) =>
      new InstructionDisplayElm(x, y)
    );
    this.register("__gyrator", (x, y) => new GyratorElm(x, y));

    this.registerXml("r", (x, y) => new ResistorElm(x, y));
    this.registerXml("c", (x, y) => new CapacitorElm(x, y));
    this.registerXml("l", (x, y) => new InductorElm(x, y));
    this.registerXml("w", (x, y) => new WireElm(x, y));
    this.registerXml("s", (x, y) => new SwitchElm(x, y));
    this.registerXml("i", (x, y) => new CurrentElm(x, y));
    this.registerXml("v", (x, y) =>
      new VoltageElm(x, y, VoltageElm.WF_DC)
    );
    this.registerXml("d", (x, y) => new DiodeElm(x, y));
    this.registerXml("z", (x, y) => new ZenerElm(x, y));
    this.registerXml("g", (x, y) => new GroundElm(x, y));
    this.registerXml("R", (x, y) => new RailElm(x, y));
    this.registerXml("f", (x, y) => new MosfetElm(x, y, false));
    this.registerXml("t", (x, y) => new TransistorElm(x, y, false));
    this.registerXml("j", (x, y) => new JfetElm(x, y, false));
    this.registerXml("a", (x, y) => new OpAmpElm(x, y));
    this.registerXml("A", (x, y) => new AntennaElm(x, y));
    this.registerXml("AM", (x, y) => new AMElm(x, y));
    this.registerXml("FM", (x, y) => new FMElm(x, y));
    this.registerXml("L", (x, y) => new LogicInputElm(x, y));
    this.registerXml("M", (x, y) => new LogicOutputElm(x, y));
    this.registerXml("I", (x, y) => new InverterElm(x, y));
    this.registerXml("LogicInput", (x, y) => new LogicInputElm(x, y));
    this.registerXml("LogicOutput", (x, y) => new LogicOutputElm(x, y));
    this.registerXml("Inverter", (x, y) => new InverterElm(x, y));
    this.registerXml("And", (x, y) => new AndGateElm(x, y));
    this.registerXml("Nand", (x, y) => new NandGateElm(x, y));
    this.registerXml("Or", (x, y) => new OrGateElm(x, y));
    this.registerXml("Nor", (x, y) => new NorGateElm(x, y));
    this.registerXml("Xor", (x, y) => new XorGateElm(x, y));
    this.registerXml("p", (x, y) => new ProbeElm(x, y));
    this.registerXml("x", (x, y) => new TextElm(x, y));
    this.registerXml("Probe", (x, y) => new ProbeElm(x, y));
    this.registerXml("Text", (x, y) => new TextElm(x, y));
    this.registerXml("O", (x, y) => new OutputElm(x, y));
    this.registerXml("Output", (x, y) => new OutputElm(x, y));
    this.registerXml("ln", (x, y) => new LabeledNodeElm(x, y));
    this.registerXml("rw", (x, y) => new RoutedWireElm(x, y));
    this.registerXml("S", (x, y) => new Switch2Elm(x, y));
    this.registerXml("as", (x, y) => new AnalogSwitchElm(x, y));
    this.registerXml("as2", (x, y) => new AnalogSwitch2Elm(x, y));
    this.registerXml("LED", (x, y) => new LEDElm(x, y));
    this.registerXml("VarRail", (x, y) => new VarRailElm(x, y));
    this.registerXml("sw", (x, y) => new SweepElm(x, y));
    this.registerXml("pt", (x, y) => new PotElm(x, y));
    this.registerXml("m", (x, y) => new MemristorElm(x, y));
    this.registerXml("aout", (x, y) => new AudioOutputElm(x, y));
    this.registerXml("DFlipFlop", (x, y) => new DFlipFlopElm(x, y));
    this.registerXml("JKFlipFlop", (x, y) => new JKFlipFlopElm(x, y));
    this.registerXml("Timer", (x, y) => new TimerElm(x, y));
    this.registerXml("tl", (x, y) => new TransLineElm(x, y));
    this.registerXml("ExtVoltage", (x, y) => new ExtVoltageElm(x, y));
    this.registerXml("CC2", (x, y) => new CC2Elm(x, y));
    this.registerXml("rl", (x, y) => new RelayElm(x, y));
    this.registerXml("Transformer", (x, y) => new TransformerElm(x, y));
    this.registerXml("ADC", (x, y) => new ADCElm(x, y));
    this.registerXml("DAC", (x, y) => new DACElm(x, y));
    this.registerXml("ctr", (x, y) => new CounterElm(x, y));
    this.registerXml("ctr2", (x, y) => new Counter2Elm(x, y));
    this.registerXml("RingCounter", (x, y) => new RingCounterElm(x, y));
    this.registerXml("mux", (x, y) => new MultiplexerElm(x, y));
    this.registerXml("VCVS", (x, y) => new VCVSElm(x, y));
    this.registerXml("VCCS", (x, y) => new VCCSElm(x, y));
    this.registerXml("CCVS", (x, y) => new CCVSElm(x, y));
    this.registerXml("CCCS", (x, y) => new CCCSElm(x, y));
    this.registerXml("RelayCoil", (x, y) => new RelayCoilElm(x, y));
    this.registerXml("RelayContact", (x, y) => new RelayContactElm(x, y));
    this.registerXml("SparkGap", (x, y) => new SparkGapElm(x, y));
    this.registerXml("TunnelDiode", (x, y) => new TunnelDiodeElm(x, y));
    this.registerXml("Varactor", (x, y) => new VaractorElm(x, y));
    this.registerXml("dd", (x, y) => new DecimalDisplayElm(x, y));
    this.registerXml("Scope", (x, y) => new ScopeElm(x, y));
    this.registerXml("Line", (x, y) => new LineElm(x, y));
    this.registerXml("bs", (x, y) => new BusSplitterElm(x, y));
    this.registerXml("Latch", (x, y) => new LatchElm(x, y));
    this.registerXml("SevenSegDecoder", (x, y) =>
      new SevenSegDecoderElm(x, y)
    );
    this.registerXml("ssd", (x, y) => new SevenSegElm(x, y));
    this.registerXml("Box", (x, y) => new BoxElm(x, y));
    this.registerXml("Ammeter", (x, y) => new AmmeterElm(x, y));
    this.registerXml("cr", (x, y) => new CrystalElm(x, y));
    this.registerXml("ROM", (x, y) => new ROMElm(x, y));
    this.registerXml("Diac", (x, y) => new DiacElm(x, y));
    this.registerXml("LEDArray", (x, y) => new LEDArrayElm(x, y));
    this.registerXml("CrossSwitch", (x, y) => new CrossSwitchElm(x, y));
    this.registerXml("tt", (x, y) => new TappedTransformerElm(x, y));
    this.registerXml("SCR", (x, y) => new SCRElm(x, y));
    this.registerXml("Triac", (x, y) => new TriacElm(x, y));
    this.registerXml("Triode", (x, y) => new TriodeElm(x, y));
    this.registerXml("cl", (x, y) => new CustomLogicElm(x, y));
    this.registerXml("cc", (x, y) =>
      new CustomCompositeElm(x, y, this)
    );
    this.registerXml("MotorProtectionSwitch", (x, y) =>
      new MotorProtectionSwitchElm(x, y)
    );
    this.registerXml("Unijunction", (x, y) => new UnijunctionElm(x, y));
    this.registerXml("ThreePhaseMotor", (x, y) =>
      new ThreePhaseMotorElm(x, y)
    );
    this.registerXml("dar", (x, y) => new DarlingtonElm(x, y));
    this.registerXml("OTA", (x, y) => new OTAElm(x, y));
    this.registerXml("Lamp", (x, y) => new LampElm(x, y));
    this.registerXml("FullAdder", (x, y) => new FullAdderElm(x, y));
    this.registerXml("pc", (x, y) => new PolarCapacitorElm(x, y));
    this.registerXml("ins", (x, y) => new InstructionDisplayElm(x, y));
    this.registerXml("Gyrator", (x, y) => new GyratorElm(x, y));
    this.registerXml("bli", (x, y) => new BusLogicInputElm(x, y));
    this.registerXml("PhaseComp", (x, y) => new PhaseCompElm(x, y));
    this.registerXml("VCO", (x, y) => new VCOElm(x, y));
    this.registerXml("Schmitt", (x, y) => new SchmittElm(x, y));
    this.registerXml("InvertingSchmitt", (x, y) =>
      new InvertingSchmittElm(x, y)
    );
    this.registerXml("dmux", (x, y) => new DeMultiplexerElm(x, y));
    this.registerXml("TFlipFlop", (x, y) => new TFlipFlopElm(x, y));
    this.registerXml("Monostable", (x, y) => new MonostableElm(x, y));
    this.registerXml("HalfAdder", (x, y) => new HalfAdderElm(x, y));
    this.registerXml("PisoShift", (x, y) => new PisoShiftElm(x, y));
    this.registerXml("SipoShift", (x, y) => new SipoShiftElm(x, y));
    this.registerXml("Comparator", (x, y) => new ComparatorElm(x, y));
    this.registerXml("Xnor", (x, y) => new XnorGateElm(x, y));
    this.registerXml("AnalogMux", (x, y) => new AnalogMuxElm(x, y));
    this.registerXml("BusTransceiver", (x, y) =>
      new BusTransceiverElm(x, y)
    );
    this.registerXml("DelayBuffer", (x, y) =>
      new DelayBufferElm(x, y)
    );
    this.registerXml("SeqGen", (x, y) => new SeqGenElm(x, y));
    this.registerXml("TimeDelayRelay", (x, y) =>
      new TimeDelayRelayElm(x, y)
    );
    this.registerXml("Fuse", (x, y) => new FuseElm(x, y));
    this.registerXml("LDR", (x, y) => new LDRElm(x, y));
    this.registerXml("ThermistorNTC", (x, y) =>
      new ThermistorNTCElm(x, y)
    );
    this.registerXml("OhmMeter", (x, y) => new OhmMeterElm(x, y));
    this.registerXml("ts", (x, y) => new TriStateElm(x, y));
    this.registerXml("dpdt", (x, y) => new DPDTSwitchElm(x, y));
    this.registerXml("MBBSwitch", (x, y) => new MBBSwitchElm(x, y));
    this.registerXml("StopTrigger", (x, y) =>
      new StopTriggerElm(x, y)
    );
    this.registerXml("TestPoint", (x, y) => new TestPointElm(x, y));
    this.registerXml("Wattmeter", (x, y) => new WattmeterElm(x, y));
    this.registerXml("SRAM", (x, y) => new SRAMElm(x, y));
    this.registerXml("DataInput", (x, y) => new DataInputElm(x, y));
    this.registerXml("DataRecorder", (x, y) =>
      new DataRecorderElm(x, y)
    );
    this.registerXml("ain", (x, y) => new AudioInputElm(x, y));
    this.registerXml("DCMotor", (x, y) => new DCMotorElm(x, y));
    this.registerXml("OpAmpReal", (x, y) => new OpAmpRealElm(x, y));
    this.registerXml("Optocoupler", (x, y) =>
      new OptocouplerElm(x, y)
    );
    this.registerXml("CustomTransformer", (x, y) =>
      new CustomTransformerElm(x, y)
    );
  }

  public register(type: string, creator: ElementCreator): void {
    this.creators.set(type, creator);
  }

  public registerXml(type: string, creator: XmlElementCreator): void {
    this.xmlCreators.set(type, creator);
  }

  public create(
    type: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    flags: number,
    tokenizer: StringTokenizer
  ): CircuitElm | null {
    return (
      this.creators.get(type)?.(
        x1,
        y1,
        x2,
        y2,
        flags,
        tokenizer
      ) ?? null
    );
  }

  public createFromRecord(record: CircuitElementRecord): CircuitElm | null {
    // Older CircuitJS/Falstad files sometimes store an ASCII dump type as a
    // decimal number (for example 118 for "v" and 82 for "R").
    const normalizedType =
      /^\d+$/.test(record.type) &&
      record.dumpType > 0 &&
      record.dumpType < 127
        ? String.fromCharCode(record.dumpType)
        : record.type;
    const element = this.create(
      normalizedType,
      record.x1,
      record.y1,
      record.x2,
      record.y2,
      record.flags,
      new StringTokenizer(record.arguments.join(" "))
    );
    element?.setPoints();
    return element;
  }

  public createFromXmlRecord(record: XmlRecord): CircuitElm | null {
    if (record.kind !== "element") {
      return null;
    }
    const position = record.attributes.x?.split(" ").map(Number);
    if (
      position === undefined ||
      position.length !== 4 ||
      position.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Invalid XML position for <${record.tagName}>`);
    }
    const element = this.xmlCreators.get(record.tagName)?.(
      position[0],
      position[1]
    );
    if (element === undefined) {
      return null;
    }

    const document = globalThis.document.implementation.createDocument(
      "",
      record.tagName
    );
    const xmlElement = document.documentElement;
    for (const [name, value] of Object.entries(record.attributes)) {
      xmlElement.setAttribute(name, value);
    }
    if (record.contents !== null && record.contents.length > 0) {
      xmlElement.append(document.createTextNode(record.contents));
    }
    for (const child of record.children) {
      xmlElement.append(this.createXmlElement(document, child));
    }
    const deserializer = new XMLDeserializer();
    deserializer.parseChildElement(xmlElement);
    element.setPositionFromXml(xmlElement);
    element.undumpXml(deserializer);
    element.setPoints();
    return element;
  }

  private createXmlElement(
    document: Document,
    record: XmlRecord
  ): Element {
    const element = document.createElement(record.tagName);
    for (const [name, value] of Object.entries(record.attributes)) {
      element.setAttribute(name, value);
    }
    if (record.contents !== null && record.contents.length > 0) {
      element.append(document.createTextNode(record.contents));
    }
    for (const child of record.children) {
      element.append(this.createXmlElement(document, child));
    }
    return element;
  }
}
