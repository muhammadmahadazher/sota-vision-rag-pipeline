import { describe, expect, it } from "vitest";
import { buildLocalNarrative, normalizeWorkerDetections } from "./localVision";

describe("verified browser vision adapter", () => {
  it("preserves the worker's stable track id", () => {
    expect(normalizeWorkerDetections([
      {
        label: " Person ",
        score: 0.91,
        box: { xmin: 10, ymin: 10, xmax: 90, ymax: 90 },
        trackId: "T-042",
        observations: 4,
      },
    ], 100, 100)).toEqual([
      {
        bbox: [10, 10, 90, 90],
        label: "person",
        confidence: 0.91,
        track_id: "T-042",
      },
    ]);
  });

  it("describes only verified objects and includes spatial detail", () => {
    const narrative = buildLocalNarrative([
      { bbox: [40, 10, 80, 90], label: "person", confidence: 0.92, track_id: "T-001" },
      { bbox: [0, 55, 28, 95], label: "handbag", confidence: 0.78, track_id: "T-002" },
    ], [{ type: "entered", label: "handbag", trackId: "T-002" }], 200);

    expect(narrative).toContain("Verified across multiple frames");
    expect(narrative).toContain("on the left");
    expect(narrative).toContain("1 person and 1 handbag");
    expect(narrative).toContain("Newly confirmed: handbag");
    expect(narrative).toContain("stable observations enter session memory");
  });
});
