import { StringTokenizer } from "./StringTokenizer";
import {
  ParsedXmlCircuit,
  XMLDeserializer
} from "./XMLDeserializer";

export interface CircuitOptions {
  flags: number;
  maxTimeStep: number;
  iterationSpeed: number;
  currentSpeed: number;
  voltageRange: number;
  powerBrightness?: number;
  minTimeStep?: number;
}

export interface CircuitFlags {
  showCurrentDots: boolean;
  smallGrid: boolean;
  showVoltage: boolean;
  showPower: boolean;
  showValues: boolean;
  adjustTimeStep: boolean;
  autoDCOnReset: boolean;
}

export interface CircuitElementRecord {
  kind: "element";
  type: string;
  dumpType: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flags: number;
  arguments: string[];
  raw: string;
  line: number;
}

export interface CircuitScopeRecord {
  kind: "scope";
  arguments: string[];
  raw: string;
  line: number;
}

export interface CircuitHintRecord {
  kind: "hint";
  hintType: number;
  item1: number;
  item2: number;
  raw: string;
  line: number;
}

export interface CircuitModelRecord {
  kind: "model" | "adjustable";
  modelType: string;
  arguments: string[];
  raw: string;
  line: number;
}

export interface CircuitIgnoredRecord {
  kind: "ignored";
  type: string;
  arguments: string[];
  raw: string;
  line: number;
}

export type CircuitRecord =
  | CircuitElementRecord
  | CircuitScopeRecord
  | CircuitHintRecord
  | CircuitModelRecord
  | CircuitIgnoredRecord;

export interface CircuitTextDocument {
  format: "text";
  options: CircuitOptions | null;
  flags: CircuitFlags;
  records: CircuitRecord[];
  errors: string[];
  source: string;
}

export type CircuitXmlDocument = ParsedXmlCircuit;

export type CircuitDocument = CircuitTextDocument | ParsedXmlCircuit;

/**
 * Portable parsing slice of CircuitLoader.java.
 *
 * UI mutation and element construction remain behind the compatibility layer;
 * this class owns the original line format and is already usable by future
 * native CircuitElm constructors.
 */
export class CircuitLoader {
  public static readonly RC_RETAIN = 1;
  public static readonly RC_NO_CENTER = 2;
  public static readonly RC_SUBCIRCUITS = 4;
  public static readonly RC_KEEP_TITLE = 8;

  public readCircuit(text: string, flags = 0): CircuitDocument {
    return this.parseCircuit(text, flags);
  }

  public parseCircuit(text: string, importFlags = 0): CircuitDocument {
    if (text.trimStart().startsWith("<")) {
      return new XMLDeserializer().readCircuit(text);
    }

    const records: CircuitRecord[] = [];
    const errors: string[] = [];
    let options: CircuitOptions | null = null;
    let circuitFlags = this.readCircuitFlags(0);
    const subcircuitsOnly =
      (importFlags & CircuitLoader.RC_SUBCIRCUITS) !== 0;
    const retain = (importFlags & CircuitLoader.RC_RETAIN) !== 0;

    const lines = text.split(/\r\n|\r|\n/);
    lines.forEach((raw, index) => {
      const lineNumber = index + 1;
      const tokenizer = new StringTokenizer(raw, " +\t\n\r\f");
      if (!tokenizer.hasMoreTokens()) {
        return;
      }

      const type = tokenizer.nextToken();
      let dumpType = type.charCodeAt(0);
      if (/^\d+$/.test(type)) {
        dumpType = Number.parseInt(type, 10);
      }

      if (subcircuitsOnly && dumpType !== ".".charCodeAt(0)) {
        return;
      }

      try {
        if (type === "o") {
          records.push({
            kind: "scope",
            arguments: tokenizer.toArray(),
            raw,
            line: lineNumber
          });
          return;
        }
        if (type === "h") {
          records.push({
            kind: "hint",
            hintType: CircuitLoader.nextInteger(tokenizer),
            item1: CircuitLoader.nextInteger(tokenizer),
            item2: CircuitLoader.nextInteger(tokenizer),
            raw,
            line: lineNumber
          });
          return;
        }
        if (type === "$") {
          const parsed = this.readOptions(tokenizer);
          if (!retain) {
            options = parsed;
            circuitFlags = this.readCircuitFlags(parsed.flags);
          } else if ((parsed.flags & 2) !== 0) {
            circuitFlags.smallGrid = true;
          }
          return;
        }
        if (type === "!" || type === "." || dumpType === 34 || dumpType === 32) {
          records.push({
            kind: "model",
            modelType: type,
            arguments: tokenizer.toArray(),
            raw,
            line: lineNumber
          });
          return;
        }
        if (dumpType === 38) {
          records.push({
            kind: "adjustable",
            modelType: type,
            arguments: tokenizer.toArray(),
            raw,
            line: lineNumber
          });
          return;
        }
        if (type === "%" || type === "?" || type === "B") {
          records.push({
            kind: "ignored",
            type,
            arguments: tokenizer.toArray(),
            raw,
            line: lineNumber
          });
          return;
        }

        records.push({
          kind: "element",
          type,
          dumpType,
          x1: CircuitLoader.nextInteger(tokenizer),
          y1: CircuitLoader.nextInteger(tokenizer),
          x2: CircuitLoader.nextInteger(tokenizer),
          y2: CircuitLoader.nextInteger(tokenizer),
          flags: CircuitLoader.nextInteger(tokenizer),
          arguments: tokenizer.toArray(),
          raw,
          line: lineNumber
        });
      } catch (error) {
        errors.push(`line ${lineNumber}: ${String(error)}`);
      }
    });

    return {
      format: "text",
      options,
      flags: circuitFlags,
      records,
      errors,
      source: text
    };
  }

  public readOptions(tokenizer: StringTokenizer): CircuitOptions {
    const flags = CircuitLoader.nextInteger(tokenizer);
    const maxTimeStep = CircuitLoader.nextNumber(tokenizer);
    const iterationSpeed = CircuitLoader.nextNumber(tokenizer);
    const currentSpeed = CircuitLoader.nextInteger(tokenizer);
    const voltageRange = CircuitLoader.nextNumber(tokenizer);
    const result: CircuitOptions = {
      flags,
      maxTimeStep,
      iterationSpeed,
      currentSpeed,
      voltageRange
    };

    if (tokenizer.hasMoreTokens()) {
      result.powerBrightness = CircuitLoader.nextInteger(tokenizer);
    }
    if (tokenizer.hasMoreTokens()) {
      result.minTimeStep = CircuitLoader.nextNumber(tokenizer);
    }
    return result;
  }

  public readCircuitFlags(flags: number): CircuitFlags {
    return {
      showCurrentDots: (flags & 1) !== 0,
      smallGrid: (flags & 2) !== 0,
      showVoltage: (flags & 4) === 0,
      showPower: (flags & 8) === 8,
      showValues: (flags & 16) === 0,
      adjustTimeStep: (flags & 64) !== 0,
      autoDCOnReset: (flags & 128) !== 0
    };
  }

  private static nextInteger(tokenizer: StringTokenizer): number {
    const token = tokenizer.nextToken();
    const value = Number.parseInt(token, 10);
    if (!Number.isFinite(value)) {
      throw new Error(`invalid integer "${token}"`);
    }
    return value;
  }

  private static nextNumber(tokenizer: StringTokenizer): number {
    const token = tokenizer.nextToken();
    const value = Number(token);
    if (!Number.isFinite(value)) {
      throw new Error(`invalid number "${token}"`);
    }
    return value;
  }
}
