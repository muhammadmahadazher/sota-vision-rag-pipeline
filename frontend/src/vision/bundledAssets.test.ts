import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (...parts: string[]) => resolve(process.cwd(), "public", ...parts);

describe("bundled browser detector assets", () => {
  it("loads the runtime and model from same-origin public assets", () => {
    const worker = readFileSync(publicFile("local-vision-worker-v5.js"), "utf8");

    expect(worker).toContain("./vendor/transformers/transformers.min.js");
    expect(worker).toContain("./models/");
    expect(worker).toContain("allowRemoteModels = false");
    expect(worker).toContain("useBrowserCache = false");
    expect(worker).not.toContain("cdn.jsdelivr.net");
    expect(worker.indexOf("await loadDetector(cpuPlan)")).toBeLessThan(
      worker.indexOf("await loadDetector(gpuPlan)"),
    );
  });

  it.each([
    [["vendor", "transformers", "transformers.min.js"], 800_000],
    [["vendor", "transformers", "ort-wasm-simd-threaded.jsep.js"], 40_000],
    [["vendor", "transformers", "ort-wasm-simd-threaded.jsep.wasm"], 20_000_000],
    [["models", "onnx-community", "dfine_n_coco-ONNX", "onnx", "model_quantized.onnx"], 4_000_000],
    [["models", "onnx-community", "dfine_n_coco-ONNX", "onnx", "model_fp16.onnx"], 7_000_000],
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

  it("ships the complete 80-class D-FINE label map", () => {
    const config = JSON.parse(
      readFileSync(publicFile("models", "onnx-community", "dfine_n_coco-ONNX", "config.json"), "utf8"),
    ) as { id2label: Record<string, string> };

    expect(Object.values(config.id2label)).toHaveLength(80);
    expect(Object.values(config.id2label)).toEqual(expect.arrayContaining(["person", "chair", "cell phone"]));
  });
});