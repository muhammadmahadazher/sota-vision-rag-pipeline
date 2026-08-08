import { describe, expect, it } from "vitest";
import { modeAvailableOnDeployment } from "./deployment";

describe("deployment mode availability", () => {
  it("locks GitHub Pages builds to on-device analysis", () => {
    expect(modeAvailableOnDeployment("browser", true)).toBe(true);
    expect(modeAvailableOnDeployment("backend", true)).toBe(false);
  });

  it("keeps both modes available when running locally", () => {
    expect(modeAvailableOnDeployment("browser", false)).toBe(true);
    expect(modeAvailableOnDeployment("backend", false)).toBe(true);
  });
});
