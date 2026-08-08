import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.web.min.js";

const MODEL_ID = "Xenova/yolos-tiny";
const MODEL_REVISION = "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d";

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = true;

let detector = null;
let detectorPromise = null;
let processing = false;

function publishProgress(info) {
  const progress =
    typeof info?.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(info.progress)))
      : null;
  self.postMessage({
    type: "progress",
    status: typeof info?.status === "string" ? info.status : "loading",
    file: typeof info?.file === "string" ? info.file : "",
    progress,
  });
}

async function getDetector() {
  if (detector) return detector;
  if (!detectorPromise) {
    self.postMessage({
      type: "progress",
      status: "loading",
      file: "On-device object detector",
      progress: 0,
    });
    detectorPromise = pipeline("object-detection", MODEL_ID, {
      dtype: "q8",
      revision: MODEL_REVISION,
      progress_callback: publishProgress,
    })
      .then((loadedDetector) => {
        detector = loadedDetector;
        self.postMessage({ type: "ready", runtime: "YOLOS-tiny · WASM" });
        return loadedDetector;
      })
      .catch((error) => {
        detectorPromise = null;
        throw error;
      });
  }
  return detectorPromise;
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

  if (message.type !== "analyze" || processing || !(message.frame instanceof Blob)) {
    return;
  }

  processing = true;
  const startedAt = performance.now();
  try {
    const activeDetector = await getDetector();
    const detections = await activeDetector(message.frame, { threshold: 0.25 });
    self.postMessage({
      type: "result",
      id: message.id,
      detections,
      width: message.width,
      height: message.height,
      elapsedMs: performance.now() - startedAt,
      runtime: "YOLOS-tiny · WASM",
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "On-device inference could not be started.",
    });
  } finally {
    processing = false;
  }
};
