"""Session-scoped temporal verification for detector output."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


AMBIGUOUS_LABELS = {
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
}


def _score_floor(label: str) -> float:
    if label == "person":
        return 0.42
    if label in AMBIGUOUS_LABELS:
        return 0.62
    return 0.48


def _area(box: list[float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _iou(left: list[float], right: list[float]) -> float:
    width = max(0.0, min(left[2], right[2]) - max(left[0], right[0]))
    height = max(0.0, min(left[3], right[3]) - max(left[1], right[1]))
    intersection = width * height
    union = _area(left) + _area(right) - intersection
    return intersection / union if union > 0 else 0.0


def _blend_box(previous: list[float], current: list[float]) -> list[float]:
    return [old * 0.35 + new * 0.65 for old, new in zip(previous, current)]


@dataclass
class _Track:
    track_id: str
    label: str
    bbox: list[float]
    confidence: float
    hits: int = 1
    misses: int = 0
    stable: bool = False


class TemporalObjectVerifier:
    """Hide transient classifications and expose stable per-session tracks only."""

    def __init__(self, match_iou: float = 0.28, max_stable_misses: int = 2) -> None:
        self.match_iou = match_iou
        self.max_stable_misses = max_stable_misses
        self._tracks: dict[str, _Track] = {}
        self._next_id = 1

    def _candidates(self, detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        validated: list[dict[str, Any]] = []
        for detection in detections:
            label = str(detection.get("label", "")).strip().lower()
            bbox = detection.get("bbox")
            confidence = detection.get("confidence")
            if (
                not label
                or not isinstance(bbox, list)
                or len(bbox) != 4
                or not all(isinstance(value, (int, float)) for value in bbox)
                or not isinstance(confidence, (int, float))
                or float(confidence) < _score_floor(label)
                or _area([float(value) for value in bbox]) <= 0
            ):
                continue
            validated.append(
                {
                    "label": label,
                    "bbox": [float(value) for value in bbox],
                    "confidence": min(1.0, max(0.0, float(confidence))),
                }
            )

        # Detector output order is not guaranteed, so NMS must inspect the
        # most confident box first to avoid preserving weaker duplicates.
        validated.sort(key=lambda item: item["confidence"], reverse=True)
        candidates: list[dict[str, Any]] = []
        for candidate in validated:
            if any(
                existing["label"] == candidate["label"]
                and _iou(existing["bbox"], candidate["bbox"]) >= 0.5
                for existing in candidates
            ):
                continue
            candidates.append(candidate)
            if len(candidates) >= 32:
                break
        return candidates

    def snapshot(self) -> list[dict[str, Any]]:
        return [
            {
                "label": track.label,
                "bbox": track.bbox,
                "confidence": track.confidence,
                "track_id": track.track_id,
            }
            for track in sorted(
                self._tracks.values(),
                key=lambda item: item.confidence,
                reverse=True,
            )
            if track.stable and track.misses <= 1
        ]

    def update(
        self,
        raw_detections: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, str]], dict[str, int]]:
        candidates = self._candidates(raw_detections)
        existing_track_ids = set(self._tracks)
        matches: list[tuple[float, str, int]] = []
        for track in self._tracks.values():
            for index, candidate in enumerate(candidates):
                if track.label != candidate["label"]:
                    continue
                overlap = _iou(track.bbox, candidate["bbox"])
                if overlap >= self.match_iou:
                    matches.append((overlap, track.track_id, index))
        matches.sort(reverse=True)

        matched_tracks: set[str] = set()
        matched_candidates: set[int] = set()
        events: list[dict[str, str]] = []
        for _, track_id, candidate_index in matches:
            if track_id in matched_tracks or candidate_index in matched_candidates:
                continue
            track = self._tracks[track_id]
            candidate = candidates[candidate_index]
            matched_tracks.add(track_id)
            matched_candidates.add(candidate_index)
            track.bbox = _blend_box(track.bbox, candidate["bbox"])
            track.confidence = track.confidence * 0.35 + candidate["confidence"] * 0.65
            track.hits += 1
            track.misses = 0
            required_hits = 3 if track.label in AMBIGUOUS_LABELS else 2
            if not track.stable and track.hits >= required_hits:
                track.stable = True
                events.append({"type": "entered", "label": track.label, "track_id": track_id})

        for index, candidate in enumerate(candidates):
            if index in matched_candidates:
                continue
            track_id = f"T-{self._next_id:03d}"
            self._next_id += 1
            self._tracks[track_id] = _Track(
                track_id=track_id,
                label=candidate["label"],
                bbox=candidate["bbox"],
                confidence=candidate["confidence"],
            )

        for track_id in existing_track_ids:
            if track_id in matched_tracks:
                continue
            track = self._tracks[track_id]
            track.misses += 1
            track.confidence *= 0.9
            should_remove = track.misses > self.max_stable_misses if track.stable else track.misses > 0
            if should_remove:
                del self._tracks[track_id]
                if track.stable:
                    events.append({"type": "exited", "label": track.label, "track_id": track_id})

        metrics = {
            "raw_detections": len(raw_detections),
            "candidates": len(candidates),
            "tentative_tracks": sum(not track.stable for track in self._tracks.values()),
            "verified_tracks": len(self.snapshot()),
        }
        return self.snapshot(), events, metrics
