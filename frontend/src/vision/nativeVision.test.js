import { describe, expect, it } from "vitest";
import { analyzeMotionPixels } from "../../public/native-vision.js";

describe("dependency-free browser vision", () => {
  it("waits for a previous frame before reporting motion", () => {
    expect(analyzeMotionPixels(new Uint8Array(100), null, 10, 10)).toEqual([]);
  });

  it("returns a scaled bounding box for a meaningful changed region", () => {
    const previous = new Uint8Array(400);
    const current = new Uint8Array(400);
    for (let y = 7; y < 13; y += 1) {
      for (let x = 8; x < 15; x += 1) current[y * 20 + x] = 220;
    }

    const [detection] = analyzeMotionPixels(current, previous, 20, 20, 200, 100);

    expect(detection.label).toBe("motion region");
    expect(detection.score).toBeGreaterThan(0.55);
    expect(detection.box).toEqual({ xmin: 60, ymin: 25, xmax: 170, ymax: 75 });
  });

  it("ignores isolated compression noise", () => {
    const previous = new Uint8Array(400);
    const current = new Uint8Array(400);
    current[22] = 255;
    current[101] = 255;

    expect(analyzeMotionPixels(current, previous, 20, 20)).toEqual([]);
  });
});
