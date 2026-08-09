const DEFAULT_SCORE_FLOOR = 0.48;
const PERSON_SCORE_FLOOR = 0.42;
const AMBIGUOUS_SCORE_FLOOR = 0.62;
const NMS_IOU = 0.5;

const AMBIGUOUS_LABELS = new Set([
  "cell phone",
  "glasses",
  "hair drier",
  "headphone",
  "key",
  "mouse",
  "remote",
  "ring",
  "tie",
  "toothbrush",
  "wallet",
  "watch",
  "wine glass",
]);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function canonicalLabel(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validBox(box) {
  return box && [box.xmin, box.ymin, box.xmax, box.ymax].every(Number.isFinite);
}

function boxArea(box) {
  return Math.max(0, box.xmax - box.xmin) * Math.max(0, box.ymax - box.ymin);
}

function blendBox(previous, current, currentWeight = 0.65) {
  const previousWeight = 1 - currentWeight;
  return {
    xmin: previous.xmin * previousWeight + current.xmin * currentWeight,
    ymin: previous.ymin * previousWeight + current.ymin * currentWeight,
    xmax: previous.xmax * previousWeight + current.xmax * currentWeight,
    ymax: previous.ymax * previousWeight + current.ymax * currentWeight,
  };
}

export function intersectionOverUnion(left, right) {
  const intersectionWidth = Math.max(0, Math.min(left.xmax, right.xmax) - Math.max(left.xmin, right.xmin));
  const intersectionHeight = Math.max(0, Math.min(left.ymax, right.ymax) - Math.max(left.ymin, right.ymin));
  const intersection = intersectionWidth * intersectionHeight;
  const union = boxArea(left) + boxArea(right) - intersection;
  return union > 0 ? intersection / union : 0;
}

export function scoreFloorForLabel(label) {
  const normalized = canonicalLabel(label);
  if (normalized === "person") return PERSON_SCORE_FLOOR;
  if (AMBIGUOUS_LABELS.has(normalized)) return AMBIGUOUS_SCORE_FLOOR;
  return DEFAULT_SCORE_FLOOR;
}

export function suppressDetections(detections, width, height, maxDetections = 32) {
  if (!Array.isArray(detections) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }

  const frameArea = width * height;
  const candidates = detections
    .filter((detection) => Number.isFinite(detection?.score) && validBox(detection?.box))
    .map((detection) => {
      const label = canonicalLabel(detection.label);
      const box = {
        xmin: clamp(detection.box.xmin, 0, width),
        ymin: clamp(detection.box.ymin, 0, height),
        xmax: clamp(detection.box.xmax, 0, width),
        ymax: clamp(detection.box.ymax, 0, height),
      };
      return { label, score: clamp(detection.score, 0, 1), box };
    })
    .filter((detection) => {
      const areaRatio = boxArea(detection.box) / frameArea;
      return detection.label &&
        detection.score >= scoreFloorForLabel(detection.label) &&
        areaRatio >= 0.0005 && areaRatio <= 0.98;
    })
    .sort((left, right) => right.score - left.score);

  const selected = [];
  for (const candidate of candidates) {
    const duplicate = selected.some((existing) =>
      existing.label === candidate.label &&
      intersectionOverUnion(existing.box, candidate.box) >= NMS_IOU,
    );
    if (duplicate) continue;
    selected.push(candidate);
    if (selected.length >= maxDetections) break;
  }
  return selected;
}

function requiredHits(label) {
  return AMBIGUOUS_LABELS.has(label) ? 3 : 2;
}

export class TemporalVerifier {
  constructor({ matchIou = 0.28, maxStableMisses = 2 } = {}) {
    this.matchIou = matchIou;
    this.maxStableMisses = maxStableMisses;
    this.tracks = new Map();
    this.nextTrackId = 1;
    this.frameIndex = 0;
  }

  reset() {
    this.tracks.clear();
    this.nextTrackId = 1;
    this.frameIndex = 0;
  }

  snapshot() {
    return Array.from(this.tracks.values())
      .filter((track) => track.stable && track.misses <= 1)
      .sort((left, right) => right.score - left.score)
      .map((track) => ({
        label: track.label,
        score: track.score,
        box: { ...track.box },
        trackId: track.id,
        observations: track.hits,
      }));
  }

  update(rawDetections, width, height) {
    this.frameIndex += 1;
    const detections = suppressDetections(rawDetections, width, height);
    const tracks = Array.from(this.tracks.values());
    const possibleMatches = [];

    tracks.forEach((track) => {
      detections.forEach((detection, detectionIndex) => {
        if (track.label !== detection.label) return;
        const overlap = intersectionOverUnion(track.box, detection.box);
        if (overlap >= this.matchIou) {
          possibleMatches.push({ track, detection, detectionIndex, overlap });
        }
      });
    });
    possibleMatches.sort((left, right) => right.overlap - left.overlap);

    const matchedTracks = new Set();
    const matchedDetections = new Set();
    const events = [];
    for (const match of possibleMatches) {
      if (matchedTracks.has(match.track.id) || matchedDetections.has(match.detectionIndex)) continue;
      matchedTracks.add(match.track.id);
      matchedDetections.add(match.detectionIndex);
      match.track.box = blendBox(match.track.box, match.detection.box);
      match.track.score = match.track.score * 0.35 + match.detection.score * 0.65;
      match.track.hits += 1;
      match.track.misses = 0;
      match.track.lastFrame = this.frameIndex;
      if (!match.track.stable && match.track.hits >= requiredHits(match.track.label)) {
        match.track.stable = true;
        events.push({ type: "entered", label: match.track.label, trackId: match.track.id });
      }
    }

    detections.forEach((detection, detectionIndex) => {
      if (matchedDetections.has(detectionIndex)) return;
      const id = `T-${String(this.nextTrackId).padStart(3, "0")}`;
      this.nextTrackId += 1;
      this.tracks.set(id, {
        ...detection,
        id,
        hits: 1,
        misses: 0,
        stable: false,
        firstFrame: this.frameIndex,
        lastFrame: this.frameIndex,
      });
    });

    tracks.forEach((track) => {
      if (matchedTracks.has(track.id)) return;
      track.misses += 1;
      track.score *= 0.9;
      const shouldRemove = track.stable
        ? track.misses > this.maxStableMisses
        : track.misses > 0;
      if (!shouldRemove) return;
      this.tracks.delete(track.id);
      if (track.stable) events.push({ type: "exited", label: track.label, trackId: track.id });
    });

    return {
      detections: this.snapshot(),
      events,
      rawCount: Array.isArray(rawDetections) ? rawDetections.length : 0,
      candidateCount: detections.length,
      tentativeCount: Array.from(this.tracks.values()).filter((track) => !track.stable).length,
    };
  }
}

export class SceneChangeGate {
  constructor({ differenceFloor = 7, maximumSilenceMs = 2600 } = {}) {
    this.differenceFloor = differenceFloor;
    this.maximumSilenceMs = maximumSilenceMs;
    this.previous = null;
    this.lastAnalysisAt = 0;
  }

  reset() {
    this.previous = null;
    this.lastAnalysisAt = 0;
  }

  shouldAnalyze(signature, now = performance.now()) {
    if (!(signature instanceof Uint8Array) || signature.length === 0) return true;
    if (!this.previous || this.previous.length !== signature.length) {
      this.previous = signature;
      this.lastAnalysisAt = now;
      return true;
    }
    let difference = 0;
    for (let index = 0; index < signature.length; index += 1) {
      difference += Math.abs(signature[index] - this.previous[index]);
    }
    difference /= signature.length;
    this.previous = signature;
    if (difference >= this.differenceFloor || now - this.lastAnalysisAt >= this.maximumSilenceMs) {
      this.lastAnalysisAt = now;
      return true;
    }
    return false;
  }
}
