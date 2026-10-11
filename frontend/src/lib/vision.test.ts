import { describe, it, expect } from "vitest";
import { isAnalysisPacket } from "./vision";

describe("isAnalysisPacket", () => {
  it("returns false for non-object values", () => {
    expect(isAnalysisPacket(null)).toBe(false);
    expect(isAnalysisPacket(undefined)).toBe(false);
    expect(isAnalysisPacket(42)).toBe(false);
    expect(isAnalysisPacket("string")).toBe(false);
    expect(isAnalysisPacket(true)).toBe(false);
  });

  it("returns true for an empty object", () => {
    // The properties are all optional (undefined), so an empty object should pass.
    expect(isAnalysisPacket({})).toBe(true);
  });

  it("returns true for a valid partial packet", () => {
    expect(
      isAnalysisPacket({
        objects: [{ bbox: [0, 0, 10, 10], label: "person", confidence: 0.9 }],
      })
    ).toBe(true);

    expect(
      isAnalysisPacket({
        faces: [{ bbox: [0, 0, 10, 10], confidence: 0.9 }],
        narrative: "A person was detected.",
      })
    ).toBe(true);
  });

  it("returns true for a full valid AnalysisPacket", () => {
    const packet = {
      objects: [{ bbox: [0, 0, 10, 10], label: "person", confidence: 0.9 }],
      faces: [{ bbox: [0, 0, 10, 10], confidence: 0.9 }],
      narrative: "A person was detected.",
      status: "Analyzing",
      qdrant_latency_ms: 10,
      device: "Test Device",
      fps: 30,
      frame: { width: 1920, height: 1080 },
      timestamp: Date.now(),
    };
    expect(isAnalysisPacket(packet)).toBe(true);
  });

  it("returns false if objects is not an array (and not undefined)", () => {
    expect(isAnalysisPacket({ objects: "not an array" })).toBe(false);
    expect(isAnalysisPacket({ objects: {} })).toBe(false);
    expect(isAnalysisPacket({ objects: null })).toBe(false); // Because null is not undefined
  });

  it("returns false if faces is not an array (and not undefined)", () => {
    expect(isAnalysisPacket({ faces: "not an array" })).toBe(false);
    expect(isAnalysisPacket({ faces: {} })).toBe(false);
    expect(isAnalysisPacket({ faces: null })).toBe(false);
  });

  it("returns false if narrative is not a string (and not undefined)", () => {
    expect(isAnalysisPacket({ narrative: 123 })).toBe(false);
    expect(isAnalysisPacket({ narrative: {} })).toBe(false);
    expect(isAnalysisPacket({ narrative: null })).toBe(false);
  });

  it("returns false if multiple fields are invalid", () => {
    expect(
      isAnalysisPacket({
        objects: "invalid",
        faces: "invalid",
        narrative: 123,
      })
    ).toBe(false);
  });
});
