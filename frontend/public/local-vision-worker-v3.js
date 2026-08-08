import { cpuRuntime, selectBrowserHardware } from "./local-hardware.js";
import { analyzeMotionPixels } from "./native-vision.js";

const TRANSFORMERS_URL = new URL(
  "./vendor/transformers/transformers.min.js",
  import.meta.url,
).href;
const TRANSFORMERS_ASSET_URL = new URL("./vendor/transformers/", import.meta.url).href;
const LOCAL_MODEL_URL = new URL("./models/", import.meta.url).href;
const MODEL_ID = "Xenova/yolos-tiny";
const MODEL_REVISION = "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d";
const NATIVE_MAX_EDGE = 192;

let detector = null;
let detectorPromise = null;
let transformersPromise = null;
let runtimePlan = null;
let processing = false;
let disposed = false;
let nativeCanvas = null;
let nativeContext = null;
let previousGray = null;
let previousSize = "";

function nativeRuntime(reason = null) {
  return {
    device: "native",
    dtype: "uint8",
    vendor: "CPU",
    runtime: "Browser CV · CPU",
    fallbackReason: reason,
  };
}

function errorDetail(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function publishProgress(info) {
  if (disposed) return;
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

function publishRuntime(type = "runtime", modelState = "loading") {
  if (disposed || !runtimePlan) return;
  self.postMessage({
    type,
    runtime: runtimePlan.runtime,
    vendor: runtimePlan.vendor,
    accelerator: runtimePlan.device,
    fallbackReason: runtimePlan.fallbackReason,
    modelState,
  });
}

function activateNative(reason, announceReady = true) {
  runtimePlan = nativeRuntime(reason);
  publishRuntime("runtime", announceReady ? "fallback" : "loading");
  if (announceReady) publishRuntime("ready", "fallback");
}

async function getTransformers() {
  if (!transformersPromise) {
    transformersPromise = import(TRANSFORMERS_URL).then((module) => {
      module.env.allowLocalModels = true;
      module.env.allowRemoteModels = false;
      module.env.localModelPath = LOCAL_MODEL_URL;
      module.env.useBrowserCache = true;
      module.env.backends.onnx.wasm.wasmPaths = {
        mjs: new URL("ort-wasm-simd-threaded.jsep.js", TRANSFORMERS_ASSET_URL).href,
        wasm: new URL("ort-wasm-simd-threaded.jsep.wasm", TRANSFORMERS_ASSET_URL).href,
      };
      return module;
    });
  }
  return transformersPromise;
}

async function loadDetector(plan) {
  const { pipeline } = await getTransformers();
  return pipeline("object-detection", MODEL_ID, {
    device: plan.device,
    dtype: plan.dtype,
    revision: MODEL_REVISION,
    progress_callback: publishProgress,
  });
}

function startModelUpgrade(forcedPlan = null) {
  if (detector || detectorPromise || disposed) return;
  detectorPromise = (async () => {
    publishProgress({
      status: "hardware",
      file: "Detecting NVIDIA, AMD, or CPU runtime",
      progress: 0,
    });
    let selectedPlan = forcedPlan ?? await selectBrowserHardware(self.navigator);
    let loadedDetector;

    try {
      loadedDetector = await loadDetector(selectedPlan);
    } catch (initialError) {
      if (selectedPlan.device !== "webgpu") throw initialError;
      selectedPlan = cpuRuntime(
        `GPU model initialization failed; CPU/WASM retry started. ${errorDetail(initialError, "GPU initialization failed")}`,
      );
      loadedDetector = await loadDetector(selectedPlan);
    }

    if (disposed) {
      if (loadedDetector?.dispose) await loadedDetector.dispose();
      return null;
    }
    detector = loadedDetector;
    runtimePlan = selectedPlan;
    publishRuntime("runtime", "ready");
    publishRuntime("ready", "ready");
    return loadedDetector;
  })().catch((error) => {
    if (!disposed) {
      activateNative(
        `The 80-class object model is unavailable; dependency-free motion analysis remains active. ${errorDetail(error, "Model loading failed")}`,
      );
    }
    return null;
  });
}

function ensureNativeReady() {
  if (!runtimePlan) {
    activateNative("Built-in motion analysis is active while the 80-class object model initializes.", false);
  }
  startModelUpgrade();
}

function createGrayFrame(rgba) {
  const gray = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    gray[target] = Math.round(
      rgba[source] * 0.299 + rgba[source + 1] * 0.587 + rgba[source + 2] * 0.114,
    );
  }
  return gray;
}

async function analyzeNativeFrame(frame, outputWidth, outputHeight) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    throw new Error("This browser does not expose the image APIs required for local analysis.");
  }

  const bitmap = await createImageBitmap(frame);
  try {
    const scale = Math.min(1, NATIVE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const sizeKey = `${width}x${height}`;
    if (!nativeCanvas || previousSize !== sizeKey) {
      nativeCanvas = new OffscreenCanvas(width, height);
      nativeContext = nativeCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
      previousGray = null;
      previousSize = sizeKey;
    }
    if (!nativeContext) throw new Error("The local analysis canvas could not be initialized.");

    nativeContext.drawImage(bitmap, 0, 0, width, height);
    const currentGray = createGrayFrame(nativeContext.getImageData(0, 0, width, height).data);
    const detections = analyzeMotionPixels(
      currentGray,
      previousGray,
      width,
      height,
      outputWidth,
      outputHeight,
    );
    previousGray = currentGray;
    return detections;
  } finally {
    bitmap.close();
  }
}

async function analyzeFrame(frame, width, height) {
  ensureNativeReady();
  if (!detector) return analyzeNativeFrame(frame, width, height);

  try {
    return await detector(frame, { threshold: 0.25 });
  } catch (error) {
    const failedPlan = runtimePlan;
    if (detector?.dispose) await detector.dispose();
    detector = null;
    detectorPromise = null;
    const detail = errorDetail(error, "Model inference failed");
    activateNative(`Model inference failed; built-in motion analysis is active. ${detail}`);
    if (failedPlan?.device === "webgpu") {
      startModelUpgrade(cpuRuntime(`GPU inference failed; CPU/WASM retry started. ${detail}`));
    }
    return analyzeNativeFrame(frame, width, height);
  }
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "dispose") {
    disposed = true;
    if (detector?.dispose) await detector.dispose();
    detector = null;
    detectorPromise = null;
    previousGray = null;
    nativeCanvas = null;
    nativeContext = null;
    self.close();
    return;
  }

  if (message.type !== "analyze" || processing || !(message.frame instanceof Blob)) return;

  processing = true;
  const startedAt = performance.now();
  try {
    const detections = await analyzeFrame(message.frame, message.width, message.height);
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
      message: errorDetail(error, "On-device analysis could not be started."),
    });
  } finally {
    processing = false;
  }
};
