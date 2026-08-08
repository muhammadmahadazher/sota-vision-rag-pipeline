import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.web.min.js";
import { cpuRuntime, selectBrowserHardware } from "./local-hardware.js";

const MODEL_ID = "Xenova/yolos-tiny";
const MODEL_REVISION = "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let detector = null;
let detectorPromise = null;
let runtimePlan = null;
let processing = false;

function publishProgress(info) {
  const progress = typeof info?.progress === "number"
    ? Math.max(0, Math.min(100, Math.round(info.progress)))
    : null;
  self.postMessage({
    type: "progress",
    status: typeof info?.status === "string" ? info.status : "loading",
    file: typeof info?.file === "string" ? info.file : "",
    progress,
  });
}

function publishRuntime() {
  self.postMessage({
    type: "runtime",
    runtime: runtimePlan.runtime,
    vendor: runtimePlan.vendor,
    accelerator: runtimePlan.device,
    fallbackReason: runtimePlan.fallbackReason,
  });
}

async function loadDetector(plan) {
  return pipeline("object-detection", MODEL_ID, {
    device: plan.device,
    dtype: plan.dtype,
    revision: MODEL_REVISION,
    progress_callback: publishProgress,
  });
}

async function getDetector() {
  if (detector) return detector;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      self.postMessage({
        type: "progress",
        status: "hardware",
        file: "Detecting NVIDIA, AMD, or CPU runtime",
        progress: 0,
      });
      runtimePlan ??= await selectBrowserHardware(self.navigator);
      publishRuntime();

      try {
        return await loadDetector(runtimePlan);
      } catch (error) {
        if (runtimePlan.device !== "webgpu") throw error;
        const detail = error instanceof Error ? error.message : "GPU model initialization failed";
        runtimePlan = cpuRuntime(`GPU initialization failed; CPU fallback is active. ${detail}`);
        publishRuntime();
        return loadDetector(runtimePlan);
      }
    })()
      .then((loadedDetector) => {
        detector = loadedDetector;
        self.postMessage({
          type: "ready",
          runtime: runtimePlan.runtime,
          vendor: runtimePlan.vendor,
          accelerator: runtimePlan.device,
          fallbackReason: runtimePlan.fallbackReason,
        });
        return loadedDetector;
      })
      .catch((error) => {
        detectorPromise = null;
        throw error;
      });
  }
  return detectorPromise;
}

async function resetDetectorForCpu(reason) {
  if (detector?.dispose) await detector.dispose();
  detector = null;
  detectorPromise = null;
  runtimePlan = cpuRuntime(reason);
  publishRuntime();
  return getDetector();
}

async function analyzeFrame(frame) {
  const activeDetector = await getDetector();
  try {
    return await activeDetector(frame, { threshold: 0.25 });
  } catch (error) {
    if (runtimePlan.device !== "webgpu") throw error;
    const detail = error instanceof Error ? error.message : "GPU inference failed";
    const cpuDetector = await resetDetectorForCpu(
      `GPU inference failed; CPU fallback is active. ${detail}`,
    );
    return cpuDetector(frame, { threshold: 0.25 });
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "dispose") {
    if (detector?.dispose) await detector.dispose();
    detector = null;
    detectorPromise = null;
    self.close();
    return;
  }

  if (message.type !== "analyze" || processing || !(message.frame instanceof Blob)) return;

  processing = true;
  const startedAt = performance.now();
  try {
    const detections = await analyzeFrame(message.frame);
    self.postMessage({
      type: "result",
      id: message.id,
      detections,
      width: message.width,
      height: message.height,
      elapsedMs: performance.now() - startedAt,
      runtime: runtimePlan.runtime,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "On-device inference could not be started.",
    });
  } finally {
    processing = false;
  }
};
