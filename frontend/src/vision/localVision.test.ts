import { describe, expect, it } from "vitest";
import { buildLocalNarrative, normalizeWorkerDetections } from "./localVision";

describe("normalizeWorkerDetections", () => {
  it("normalizes labels, confidence, and boxes", () => {
    const result = normalizeWorkerDetections(
      [
        {
          label: " Person ",
          score: 1.2,
          box: { xmin: -4, ymin: 2, xmax: 140, ymax: 90 },
        },
        {
          label: "person",
          score: 0.9,
          box: { xmin: 0, ymin: 4, xmax: 96, ymax: 76 },
        },
      ],
      100,
      80,
    );

    expect(result).toEqual([
      {
        bbox: [0, 2, 100, 80],
        label: "person",
        confidence: 1,
        track_id: "local-1",
      },
    ]);
  });

  it("drops malformed and zero-area detections", () => {
    const result = normalizeWorkerDetections(
      [
        {
          label: "chair",
          score: 0.8,
          box: { xmin: 20, ymin: 20, xmax: 20, ymax: 40 },
        },
        {
          label: "bad",
          score: Number.NaN,
          box: { xmin: 0, ymin: 0, xmax: 2, ymax: 2 },
        },
      ],
      100,
      80,
    );

    expect(result).toEqual([]);
  });
});

describe("buildLocalNarrative", () => {
  it("summarizes repeated classes in natural language", () => {
    const narrative = buildLocalNarrative([
      { bbox: [0, 0, 1, 1], label: "person", confidence: 0.9 },
      { bbox: [1, 1, 2, 2], label: "person", confidence: 0.8 },
      { bbox: [2, 2, 3, 3], label: "chair", confidence: 0.7 },
    ]);

    expect(narrative).toContain("2 people and 1 chair");
    expect(narrative).toContain("Frames stay in this browser");
  });

  it("returns a useful message when no objects clear the floor", () => {
    expect(
      buildLocalNarrative([
        { bbox: [0, 0, 1, 1], label: "cat", confidence: 0.2 },
      ]),
    ).toContain("No supported objects");
  });
});
