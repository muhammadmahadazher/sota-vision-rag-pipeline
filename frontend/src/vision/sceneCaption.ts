export const SCENE_CAPTION_MODEL = {
  id: "onnx-community/Florence-2-base-ft",
  revision: "e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f",
  runtime: "NVIDIA/AMD WebGPU keyframe captioning",
  workerAsset: "scene-caption-worker-v1.js",
} as const;

export type SceneCaptionWorkerEvent =
  | {
      type: "caption-progress";
      status: string;
      file: string;
      progress: number | null;
    }
  | {
      type: "caption-runtime";
      runtime: string;
      modelName: string;
      modelState: "loading";
    }
  | {
      type: "caption-ready";
      runtime: string;
      modelName: string;
    }
  | {
      type: "caption-result";
      id: number;
      sessionId: number;
      narrative: string;
      elapsedMs: number;
      runtime: string;
    }
  | { type: "caption-unavailable"; reason: string }
  | { type: "caption-error"; message: string };