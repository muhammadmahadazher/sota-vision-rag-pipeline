import { describe, expect, it, vi } from "vitest";
import { selectBrowserHardware } from "../../public/local-hardware.js";

function navigatorWithAdapter(info: Record<string, unknown>, isFallbackAdapter = false) {
  const requestAdapter = vi.fn().mockResolvedValue({ info, isFallbackAdapter });
  return { gpu: { requestAdapter }, requestAdapter };
}

describe("browser hardware selection", () => {
  it.each([
    ["NVIDIA", { vendor: "nvidia", description: "GeForce RTX 4070" }],
    ["AMD", { vendor: "amd", description: "Radeon RX 7900 XT" }],
  ])("selects a recognized %s high-performance adapter", async (vendor, info) => {
    const fake = navigatorWithAdapter(info);
    const selection = await selectBrowserHardware(fake);

    expect(fake.requestAdapter).toHaveBeenCalledWith({ powerPreference: "high-performance" });
    expect(selection).toMatchObject({
      device: "webgpu",
      dtype: "q4f16",
      vendor,
      fallbackReason: null,
    });
  });

  it.each([
    ["missing WebGPU", {}],
    ["unsupported Intel adapter", navigatorWithAdapter({ vendor: "intel" })],
    ["software adapter", navigatorWithAdapter({ vendor: "nvidia" }, true)],
  ])("falls back to quantized CPU/WASM for %s", async (_case, navigatorLike) => {
    const selection = await selectBrowserHardware(navigatorLike);
    expect(selection.device).toBe("wasm");
    expect(selection.dtype).toBe("q4");
    expect(selection.vendor).toBe("CPU");
    expect(selection.fallbackReason).toBeTruthy();
  });

  it("falls back when adapter discovery throws", async () => {
    const navigatorLike = {
      gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error("driver reset")) },
    };
    await expect(selectBrowserHardware(navigatorLike)).resolves.toMatchObject({
      device: "wasm",
      vendor: "CPU",
    });
  });
});
