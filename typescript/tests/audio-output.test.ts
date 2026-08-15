import { describe, expect, it } from "vitest";
import { AudioOutputElm, CircuitElm, SimulationManager } from "../src/core";
import { encodeAudioOutputWav } from "../src/core/elements/AudioOutputElm";

describe("AudioOutputElm playback", () => {
  it("uses chronological recent ring data and Legacy fade scaling", () => {
    CircuitElm.initClass(new SimulationManager());
    const element = new AudioOutputElm(0, 0);
    element.samplingRate = 8000;
    element.sampleStep = 1 / 8000;
    element.data = Array.from({ length: 400 }, (_, index) => index % 2 === 0 ? -1 : 1);
    element.dataPtr = 0;
    element.dataFull = true;
    const playback = element.getPlaybackSamples();
    expect(playback?.length).toBe(400);
    expect(playback?.[0]).toBe(0);
    expect(playback?.[1]).toBe(20);
    expect(playback?.[399]).toBe(8171);
    element.data = [30, 40, 10, 20];
    element.dataPtr = 2;
    expect(element.getRecordedSamples()).toEqual([10, 20, 30, 40]);
  });

  it("requires 50 ms and emits the Legacy mono PCM WAV layout", () => {
    CircuitElm.initClass(new SimulationManager());
    const element = new AudioOutputElm(0, 0);
    element.data = Array<number>(399).fill(1);
    element.dataPtr = 399;
    expect(element.createWavFile()).toBeNull();
    const wav = encodeAudioOutputWav(Int16Array.from([-2, 0x1234]), 11025);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(new TextDecoder().decode(wav.slice(38, 42))).toBe("data");
    expect(view.getUint32(4, true)).toBe(19);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(11025);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(42, true)).toBe(4);
    expect(view.getInt16(46, true)).toBe(-2);
    expect(view.getInt16(48, true)).toBe(0x1234);
  });
});
