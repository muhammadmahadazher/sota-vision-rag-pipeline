import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (...parts: string[]) => resolve(process.cwd(), "public", ...parts);

describe("browser vision assets", () => {
  it("loads RF-DETR from same-origin assets on dependable CPU/WASM", () => {
    const worker = readFileSync(publicFile("local-vision-worker-v6.js"), "utf8");

    expect(worker).toContain("./vendor/transformers/transformers.min.js");
    expect(worker).toContain("./models/");
    expect(worker).toContain("onnx-community/rfdetr_nano-ONNX");
    expect(worker).toContain("allowRemoteModels = false");
    expect(worker).toContain("useBrowserCache = false");
    expect(worker).not.toContain("cdn.jsdelivr.net");
    expect(worker).not.toContain("loadDetector(gpuPlan)");
  });

  it("keeps Florence keyframe captioning isolated and hardware-gated", () => {
    const worker = readFileSync(publicFile("scene-caption-worker-v1.js"), "utf8");

    expect(worker).toContain("onnx-community/Florence-2-base-ft");
    expect(worker).toContain("selectBrowserHardware");
    expect(worker).toContain('device: "webgpu"');
    expect(worker).toContain("allowRemoteModels = true");
    expect(worker).toContain("useBrowserCache = true");
    expect(worker).toContain("<MORE_DETAILED_CAPTION>");
  });

  it.each([
    [["vendor", "transformers", "transformers.min.js"], 800_000],
    [["vendor", "transformers", "ort-wasm-simd-threaded.jsep.js"], 40_000],
    [["vendor", "transformers", "ort-wasm-simd-threaded.jsep.wasm"], 20_000_000],
    [["models", "onnx-community", "rfdetr_nano-ONNX", "onnx", "model_quantized.onnx"], 28_000_000],
  ])("includes %s", (parts, minimumBytes) => {
    expect(statSync(publicFile(...parts)).size).toBeGreaterThan(minimumBytes);
  });

  it("ships a fully bundled browser runtime without bare ONNX imports", () => {
    const runtime = readFileSync(
      publicFile("vendor", "transformers", "transformers.min.js"),
      "utf8",
    );

    expect(runtime).toContain("3.8.1");
    expect(runtime).not.toMatch(/from\s*["']onnxruntime/u);
    expect(runtime).not.toMatch(/import\s*\(\s*["']onnxruntime/u);
  });

  it("ships the complete 80-class RF-DETR label map", () => {
    const config = JSON.parse(
      readFileSync(publicFile("models", "onnx-community", "rfdetr_nano-ONNX", "config.json"), "utf8"),
    ) as { id2label: Record<string, string> };

    expect(Object.values(config.id2label)).toHaveLength(80);
    expect(Object.values(config.id2label)).toEqual(
      expect.arrayContaining(["person", "chair", "cell phone"]),
    );
  });
});