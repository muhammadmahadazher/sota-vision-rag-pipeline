import { selectBrowserHardware } from "./local-hardware.js";

const TRANSFORMERS_URL = new URL(
  "./vendor/transformers/transformers.min.js",
  import.meta.url,
).href;
const TRANSFORMERS_ASSET_URL = new URL("./vendor/transformers/", import.meta.url).href;
const CAPTION_MODEL = {
  id: "onnx-community/Florence-2-base-ft",
  revision: "e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f",
  name: "Florence-2 Base FT",
};
const CAPTION_TASK = "<MORE_DETAILED_CAPTION>";

let resourcesPromise = null;
let resources = null;
let processing = false;
let pendingCaption = null;
let disposed = false;

function errorDetail(error, fallback) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function publishProgress(info) {
  if (disposed) return;
  self.postMessage({
    type: "caption-progress",
    status: typeof info?.status === "string" ? info.status : "loading",
    file: typeof info?.file === "string" ? info.file : "",
    progress: typeof info?.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(info.progress)))
      : null,
  });
}

async function loadResources() {
  if (resourcesPromise) return resourcesPromise;
  resourcesPromise = (async () => {
    const plan = await selectBrowserHardware(self.navigator);
    if (plan.device !== "webgpu") {
      self.postMessage({
        type: "caption-unavailable",
        reason: plan.fallbackReason ?? "A supported NVIDIA or AMD WebGPU adapter was not found.",
      });
      return null;
    }

    self.postMessage({
      type: "caption-runtime",
      runtime: `${plan.vendor} GPU · Florence-2`,
      modelName: CAPTION_MODEL.name,
      modelState: "loading",
    });

    const adapter = await self.navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    const supportsFp16 = Boolean(adapter?.features?.has("shader-f16"));
    const transformers = await import(TRANSFORMERS_URL);
    transformers.env.allowLocalModels = false;
    transformers.env.allowRemoteModels = true;
    transformers.env.remoteHost = "https://huggingface.co/";
    transformers.env.remotePathTemplate = "{model}/resolve/{revision}/";
    transformers.env.useBrowserCache = true;
    transformers.env.backends.onnx.wasm.wasmPaths = {
      mjs: new URL("ort-wasm-simd-threaded.jsep.js", TRANSFORMERS_ASSET_URL).href,
      wasm: new URL("ort-wasm-simd-threaded.jsep.wasm", TRANSFORMERS_ASSET_URL).href,
    };

    const options = {
      revision: CAPTION_MODEL.revision,
      progress_callback: publishProgress,
    };
    const [model, tokenizer, processor] = await Promise.all([
      transformers.Florence2ForConditionalGeneration.from_pretrained(CAPTION_MODEL.id, {
        ...options,
        device: "webgpu",
        dtype: {
          embed_tokens: supportsFp16 ? "fp16" : "fp32",
          vision_encoder: supportsFp16 ? "fp16" : "fp32",
          encoder_model: "q4",
          decoder_model_merged: "q4",
        },
      }),
      transformers.AutoTokenizer.from_pretrained(CAPTION_MODEL.id, options),
      transformers.AutoProcessor.from_pretrained(CAPTION_MODEL.id, options),
    ]);

    resources = { model, tokenizer, processor, RawImage: transformers.RawImage, plan };
    self.postMessage({
      type: "caption-ready",
      runtime: `${plan.vendor} GPU · Florence-2`,
      modelName: CAPTION_MODEL.name,
    });
    return resources;
  })().catch((error) => {
    resourcesPromise = null;
    self.postMessage({
      type: "caption-error",
      message: errorDetail(error, "The detailed caption model could not start."),
    });
    return null;
  });
  return resourcesPromise;
}

async function captionFrame(frame, id, sessionId) {
  const loaded = await loadResources();
  if (!loaded || disposed) return;
  const startedAt = performance.now();
  const image = await loaded.RawImage.fromBlob(frame);
  const imageInputs = await loaded.processor(image);
  const prompts = loaded.processor.construct_prompts(CAPTION_TASK);
  const textInputs = loaded.tokenizer(prompts);
  const generated = await loaded.model.generate({
    ...textInputs,
    ...imageInputs,
    max_new_tokens: 96,
    num_beams: 1,
    do_sample: false,
  });
  const decoded = loaded.tokenizer.batch_decode(generated, { skip_special_tokens: false })[0];
  const result = loaded.processor.post_process_generation(decoded, CAPTION_TASK, image.size);
  const narrative = typeof result?.[CAPTION_TASK] === "string"
    ? result[CAPTION_TASK].trim()
    : "";
  if (!narrative) throw new Error("Florence-2 returned an empty scene description.");
  self.postMessage({
    type: "caption-result",
    id,
    sessionId,
    narrative,
    elapsedMs: performance.now() - startedAt,
    runtime: `${loaded.plan.vendor} GPU · Florence-2`,
  });
}

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "dispose") {
    disposed = true;
    if (resources?.model?.dispose) await resources.model.dispose();
    resources = null;
    resourcesPromise = null;
    pendingCaption = null;
    self.close();
    return;
  }

  if (message.type === "prepare") {
    await loadResources();
    return;
  }

  if (message.type !== "caption" || !(message.frame instanceof Blob)) return;
  if (processing) {
    pendingCaption = message;
    return;
  }

  processing = true;
  let current = message;
  while (current && !disposed) {
    pendingCaption = null;
    try {
      await captionFrame(current.frame, current.id, current.sessionId);
    } catch (error) {
      self.postMessage({
        type: "caption-error",
        message: errorDetail(error, "Detailed scene captioning failed."),
      });
    }
    current = pendingCaption;
  }
  processing = false;
};