import type { DetectedObject } from "@/lib/vision";

export const LOCAL_VISION_MODEL = {
  id: "onnx-community/dfine_s_obj365-ONNX",
  revision: "a61e4cdfe4f9d3188a305d91e37dbf38688ffbb8",
  cpuId: "onnx-community/dfine_n_coco-ONNX",
  cpuRevision: "380d2839c327efaf65dd0fe0c2c10ab7fadd5473",
  runtime: "Adaptive D-FINE + temporal verification",
  workerAsset: "local-vision-worker-v4.js",
} as const;

export interface WorkerDetection {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  trackId?: string;
  observations?: number;
}

export interface WorkerTrackEvent {
  type: "entered" | "exited";
  label: string;
  trackId: string;
}

interface RuntimeMetadata {
  runtime: string;
  vendor: string;
  accelerator: "webgpu" | "wasm" | "native";
  fallbackReason: string | null;
  modelState: "loading" | "ready" | "fallback";
  modelId: string | null;
  classCount: number;
  modelName: string;
}

export type LocalVisionWorkerEvent =
  | {
      type: "progress";
      status: string;
      file: string;
      progress: number | null;
    }
  | ({ type: "runtime" } & RuntimeMetadata)
  | ({ type: "ready" } & RuntimeMetadata)
  | {
      type: "result";
      id: number;
      detections: WorkerDetection[];
      width: number;
      height: number;
      elapsedMs: number;
      runtime: string;
      events: WorkerTrackEvent[];
      rawCount: number;
      candidateCount: number;
      tentativeCount: number;
      analyzed: boolean;
      sceneSkipped: boolean;
    }
  | { type: "error"; message: string };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function intersectionOverUnion(
  left: DetectedObject["bbox"],
  right: DetectedObject["bbox"],
) {
  const intersectionWidth = Math.max(0, Math.min(left[2], right[2]) - Math.max(left[0], right[0]));
  const intersectionHeight = Math.max(0, Math.min(left[3], right[3]) - Math.max(left[1], right[1]));
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (left[2] - left[0]) * (left[3] - left[1]);
  const rightArea = (right[2] - right[0]) * (right[3] - right[1]);
  const union = leftArea + rightArea - intersection;
  return union > 0 ? intersection / union : 0;
}

export function normalizeWorkerDetections(
  detections: WorkerDetection[],
  width: number,
  height: number,
): DetectedObject[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }

  const candidates = detections
    .filter(
      (detection) =>
        typeof detection.label === "string" &&
        Number.isFinite(detection.score) &&
        Number.isFinite(detection.box?.xmin) &&
        Number.isFinite(detection.box?.ymin) &&
        Number.isFinite(detection.box?.xmax) &&
        Number.isFinite(detection.box?.ymax),
    )
    .map((detection) => {
      const xmin = clamp(detection.box.xmin, 0, width);
      const ymin = clamp(detection.box.ymin, 0, height);
      const xmax = clamp(detection.box.xmax, xmin, width);
      const ymax = clamp(detection.box.ymax, ymin, height);
      return {
        bbox: [xmin, ymin, xmax, ymax] as [number, number, number, number],
        label: detection.label.trim().toLowerCase() || "object",
        confidence: clamp(detection.score, 0, 1),
        track_id: detection.trackId,
      };
    })
    .filter(
      (detection) =>
        detection.bbox[2] > detection.bbox[0] &&
        detection.bbox[3] > detection.bbox[1],
    )
    .sort((left, right) => right.confidence - left.confidence);

  const selected: DetectedObject[] = [];
  for (const candidate of candidates) {
    const overlapsSelected = selected.some(
      (existing) =>
        existing.label === candidate.label &&
        intersectionOverUnion(existing.bbox, candidate.bbox) >= 0.45,
    );
    if (overlapsSelected) continue;
    selected.push({
      ...candidate,
      track_id: candidate.track_id || "local-" + (selected.length + 1),
    });
    if (selected.length >= 24) break;
  }
  return selected;
}

function pluralize(label: string, count: number) {
  if (count === 1) return label;
  if (label === "person") return "people";
  if (label.endsWith("s")) return label;
  if (label.endsWith("y") && !/[aeiou]y$/i.test(label)) {
    return `${label.slice(0, -1)}ies`;
  }
  return `${label}s`;
}

function joinNaturalLanguage(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function framePosition(object: DetectedObject, frameWidth: number) {
  const center = (object.bbox[0] + object.bbox[2]) / 2;
  if (center < frameWidth / 3) return "on the left";
  if (center > frameWidth * 2 / 3) return "on the right";
  return "near the center";
}

export function buildLocalNarrative(
  objects: DetectedObject[],
  events: WorkerTrackEvent[] = [],
  frameWidth?: number,
) {
  const confident = objects
    .filter((object) => object.confidence >= 0.4)
    .sort((left, right) => right.confidence - left.confidence);

  if (!confident.length) {
    const exited = events.filter((event) => event.type === "exited").map((event) => event.label);
    if (exited.length) {
      return `${joinNaturalLanguage(Array.from(new Set(exited)))} left the verified view. No other object has yet been confirmed across multiple frames.`;
    }
    return "No object has yet been confirmed across multiple frames. Analysis is still running locally in this browser.";
  }

  const counts = new Map<string, number>();
  confident.forEach((object) => {
    counts.set(object.label, (counts.get(object.label) ?? 0) + 1);
  });
  const summary = Array.from(counts.entries())
    .slice(0, 8)
    .map(([label, count]) => `${count} ${pluralize(label, count)}`);
  const resolvedFrameWidth = typeof frameWidth === "number" && Number.isFinite(frameWidth) && frameWidth > 0
    ? frameWidth
    : Math.max(...confident.map((object) => object.bbox[2]), 1);
  const prominent = [...confident]
    .sort((left, right) => {
      const leftArea = (left.bbox[2] - left.bbox[0]) * (left.bbox[3] - left.bbox[1]);
      const rightArea = (right.bbox[2] - right.bbox[0]) * (right.bbox[3] - right.bbox[1]);
      return rightArea - leftArea;
    })[0];
  const entered = events.filter((event) => event.type === "entered").map((event) => event.label);
  const change = entered.length
    ? ` Newly confirmed: ${joinNaturalLanguage(Array.from(new Set(entered)))}.`
    : "";

  return `Verified across multiple frames: ${joinNaturalLanguage(summary)}. The most prominent ${prominent.label} is ${framePosition(prominent, resolvedFrameWidth)}.${change} Frames stay in this browser; only stable observations enter session memory.`;
}
