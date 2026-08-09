import { describe, expect, it } from "vitest";
import {
  SceneChangeGate,
  suppressDetections,
  TemporalVerifier,
} from "../../public/temporal-vision.js";

const box = (xmin, ymin, xmax, ymax) => ({ xmin, ymin, xmax, ymax });
const detection = (label, score, coordinates = box(10, 10, 90, 90)) => ({
  label,
  score,
  box: coordinates,
});

describe("detection candidate filtering", () => {
  it("removes low-confidence and duplicate ambiguous boxes", () => {
    const selected = suppressDetections([
      detection("cell phone", 0.61),
      detection("cell phone", 0.92),
      detection("cell phone", 0.87, box(12, 12, 88, 88)),
      detection("person", 0.8, box(100, 5, 280, 195)),
    ], 300, 200);

    expect(selected.map(({ label }) => label)).toEqual(["cell phone", "person"]);
    expect(selected[0].score).toBe(0.92);
  });
});

describe("multi-frame temporal verification", () => {
  it("does not publish a one-frame hallucination", () => {
    const verifier = new TemporalVerifier();
    const first = verifier.update([detection("wine glass", 0.98)], 300, 200);

    expect(first.detections).toEqual([]);
    expect(first.tentativeCount).toBe(1);
  });

  it("publishes a stable person with a persistent track id", () => {
    const verifier = new TemporalVerifier();
    verifier.update([detection("person", 0.91)], 300, 200);
    const second = verifier.update([
      detection("person", 0.95, box(12, 11, 92, 91)),
    ], 300, 200);

    expect(second.detections).toHaveLength(1);
    expect(second.detections[0]).toMatchObject({ label: "person", trackId: "T-001" });
    expect(second.events).toEqual([
      { type: "entered", label: "person", trackId: "T-001" },
    ]);
  });

  it("requires three observations for commonly confused small classes", () => {
    const verifier = new TemporalVerifier();
    verifier.update([detection("cell phone", 0.9)], 300, 200);
    const second = verifier.update([detection("cell phone", 0.91)], 300, 200);
    const third = verifier.update([detection("cell phone", 0.93)], 300, 200);

    expect(second.detections).toEqual([]);
    expect(third.detections).toHaveLength(1);
  });

  it("emits an exit only after a stable track has missed three analyses", () => {
    const verifier = new TemporalVerifier();
    verifier.update([detection("person", 0.9)], 300, 200);
    verifier.update([detection("person", 0.92)], 300, 200);
    verifier.update([], 300, 200);
    verifier.update([], 300, 200);
    const removed = verifier.update([], 300, 200);

    expect(removed.detections).toEqual([]);
    expect(removed.events).toEqual([
      { type: "exited", label: "person", trackId: "T-001" },
    ]);
  });
});

describe("scene change gating", () => {
  it("skips unchanged frames but forces a periodic refresh", () => {
    const gate = new SceneChangeGate({ differenceFloor: 7, maximumSilenceMs: 1000 });
    const still = new Uint8Array([20, 20, 20, 20]);

    expect(gate.shouldAnalyze(still, 0)).toBe(true);
    expect(gate.shouldAnalyze(still, 300)).toBe(false);
    expect(gate.shouldAnalyze(still, 1100)).toBe(true);
    expect(gate.shouldAnalyze(new Uint8Array([80, 80, 80, 80]), 1200)).toBe(true);
  });
});
