import type { DetectedObject } from "@/lib/vision";

export const LOCAL_VISION_MODEL = {
  id: "Xenova/yolos-tiny",
  revision: "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d",
  runtime: "Transformers.js 4.2.0",
  workerAsset: "local-vision-worker-v2.js",
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
}

interface RuntimeMetadata {
  runtime: string;
  vendor: string;
  accelerator: "webgpu" | "wasm";
  fallbackReason: string | null;
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
    selected.push({ ...candidate, track_id: "local-" + (selected.length + 1) });
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

export function buildLocalNarrative(objects: DetectedObject[]) {
  const confident = objects
    .filter((object) => object.confidence >= 0.4)
    .sort((left, right) => right.confidence - left.confidence);

  if (!confident.length) {
    return "No supported objects are confidently visible in the current frame. On-device analysis is active and the video remains in this browser.";
  }

  const counts = new Map<string, number>();
  confident.forEach((object) => {
    counts.set(object.label, (counts.get(object.label) ?? 0) + 1);
  });
  const summary = Array.from(counts.entries())
    .slice(0, 6)
    .map(([label, count]) => `${count} ${pluralize(label, count)}`);

  return `On-device analysis currently sees ${joinNaturalLanguage(summary)}. Frames stay in this browser; only these temporary scene observations are retained in session memory.`;
}
