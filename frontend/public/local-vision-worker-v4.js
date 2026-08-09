import { cpuRuntime, selectBrowserHardware } from "./local-hardware.js";
import { analyzeMotionPixels } from "./native-vision.js";
import { SceneChangeGate, TemporalVerifier } from "./temporal-vision.js";

const TRANSFORMERS_URL = new URL(
  "./vendor/transformers/transformers.min.js",
  import.meta.url,
).href;
const TRANSFORMERS_ASSET_URL = new URL("./vendor/transformers/", import.meta.url).href;
const LOCAL_MODEL_URL = new URL("./models/", import.meta.url).href;
const GPU_MODEL = {
  id: "onnx-community/dfine_s_obj365-ONNX",
  revision: "a61e4cdfe4f9d3188a305d91e37dbf38688ffbb8",
  classCount: 365,
  name: "D-FINE-small Objects365",
};
const CPU_MODEL = {
  id: "onnx-community/dfine_n_coco-ONNX",
  revision: "380d2839c327efaf65dd0fe0c2c10ab7fadd5473",
  classCount: 80,
  name: "D-FINE-nano COCO",
};
const MODEL_THRESHOLD = 0.35;
const NATIVE_MAX_EDGE = 192;
const SIGNATURE_EDGE = 16;

let detector = null;
let detectorPromise = null;
let transformersPromise = null;
let runtimePlan = null;
let processing = false;
let disposed = false;
let nativeCanvas = null;
let nativeContext = null;
let signatureCanvas = null;
let signatureContext = null;
let previousGray = null;
let previousSize = "";

const temporalVerifier = new TemporalVerifier();
const nativeVerifier = new TemporalVerifier({ maxStableMisses: 1 });
const sceneGate = new SceneChangeGate();

function nativeRuntime(reason = null) {
  return {
    device: "native",
    dtype: "uint8",
    vendor: "CPU",
    runtime: "Browser CV · CPU",
    fallbackReason: reason,
    modelId: null,
    classCount: 0,
    modelName: "Motion analysis",
  };
}

function attachModel(plan) {
  const model = plan.device === "webgpu" ? GPU_MODEL : CPU_MODEL;
  return {
    ...plan,
    modelId: model.id,
    revision: model.revision,
    classCount: model.classCount,
    modelName: model.name,
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
    modelId: runtimePlan.modelId,
    classCount: runtimePlan.classCount,
    modelName: runtimePlan.modelName,
  });
}

function activateNative(reason, announceReady = true) {
  runtimePlan = nativeRuntime(reason);
  temporalVerifier.reset();
  sceneGate.reset();
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
  return pipeline("object-detection", plan.modelId, {
    device: plan.device,
    dtype: plan.dtype,
    revision: plan.revision,
    progress_callback: publishProgress,
  });
}

function startModelUpgrade(forcedPlan = null) {
  if (detector || detectorPromise || disposed) return;
  detectorPromise = (async () => {
    publishProgress({
      status: "hardware",
      file: "Selecting NVIDIA, AMD, or CPU inference",
      progress: 0,
    });
    let selectedPlan = attachModel(forcedPlan ?? await selectBrowserHardware(self.navigator));
    let loadedDetector;

    try {
      loadedDetector = await loadDetector(selectedPlan);
    } catch (initialError) {
      if (selectedPlan.device !== "webgpu") throw initialError;
      selectedPlan = attachModel(cpuRuntime(
        `GPU model initialization failed; CPU/WASM retry started. ${errorDetail(initialError, "GPU initialization failed")}`,
      ));
      loadedDetector = await loadDetector(selectedPlan);
    }

    if (disposed) {
      if (loadedDetector?.dispose) await loadedDetector.dispose();
      return null;
    }
    detector = loadedDetector;
    runtimePlan = selectedPlan;
    nativeVerifier.reset();
    temporalVerifier.reset();
    sceneGate.reset();
    publishRuntime("runtime", "ready");
    publishRuntime("ready", "ready");
    return loadedDetector;
  })().catch((error) => {
    if (!disposed) {
      activateNative(
        `The detailed detector is unavailable; dependency-free motion analysis remains active. ${errorDetail(error, "Model loading failed")}`,
      );
    }
    return null;
  });
}

function ensureNativeReady() {
  if (!runtimePlan) {
    activateNative("Motion analysis is active while the detailed detector initializes.", false);
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

async function createSceneSignature(frame) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return null;
  const bitmap = await createImageBitmap(frame);
  try {
    if (!signatureCanvas) {
      signatureCanvas = new OffscreenCanvas(SIGNATURE_EDGE, SIGNATURE_EDGE);
      signatureContext = signatureCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
    }
    if (!signatureContext) return null;
    signatureContext.drawImage(bitmap, 0, 0, SIGNATURE_EDGE, SIGNATURE_EDGE);
    return createGrayFrame(
      signatureContext.getImageData(0, 0, SIGNATURE_EDGE, SIGNATURE_EDGE).data,
    );
  } finally {
    bitmap.close();
  }
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
  if (!detector) {
    const rawDetections = await analyzeNativeFrame(frame, width, height);
    return { ...nativeVerifier.update(rawDetections, width, height), analyzed: true, sceneSkipped: false };
  }

  try {
    const signature = await createSceneSignature(frame);
    if (signature && !sceneGate.shouldAnalyze(signature)) {
      return {
        detections: temporalVerifier.snapshot(),
        events: [],
        rawCount: 0,
        candidateCount: 0,
        tentativeCount: 0,
        analyzed: false,
        sceneSkipped: true,
      };
    }
    const rawDetections = await detector(frame, { threshold: MODEL_THRESHOLD });
    return {
      ...temporalVerifier.update(rawDetections, width, height),
      analyzed: true,
      sceneSkipped: false,
    };
  } catch (error) {
    const failedPlan = runtimePlan;
    if (detector?.dispose) await detector.dispose();
    detector = null;
    detectorPromise = null;
    const detail = errorDetail(error, "Model inference failed");
    activateNative(`Model inference failed; motion analysis is active. ${detail}`);
    if (failedPlan?.device === "webgpu") {
      startModelUpgrade(cpuRuntime(`GPU inference failed; CPU/WASM retry started. ${detail}`));
    }
    const rawDetections = await analyzeNativeFrame(frame, width, height);
    return { ...nativeVerifier.update(rawDetections, width, height), analyzed: true, sceneSkipped: false };
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
    signatureCanvas = null;
    signatureContext = null;
    temporalVerifier.reset();
    nativeVerifier.reset();
    sceneGate.reset();
    self.close();
    return;
  }

  if (message.type !== "analyze" || processing || !(message.frame instanceof Blob)) return;

  processing = true;
  const startedAt = performance.now();
  try {
    const result = await analyzeFrame(message.frame, message.width, message.height);
    self.postMessage({
      type: "result",
      id: message.id,
      ...result,
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
