import logging
import os
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from app.core.hardware import (
    cpu_hardware,
    discover_system_accelerator,
    select_torch_hardware,
)

logger = logging.getLogger(__name__)

# These names remain injectable for fast unit tests while production imports are lazy.
YOLOWorld: Any = None
FaceAnalysis: Any = None
torch: Any = None
ultralytics: Any = None
yaml: Any = None


def _frame_descriptor(frame: np.ndarray) -> list[float]:
    """Create a compact 512-value visual descriptor for local vector recall."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    thumbnail = cv2.resize(gray, (32, 16), interpolation=cv2.INTER_AREA)
    return (thumbnail.astype(np.float32).reshape(-1) / 255.0).tolist()

def _load_advanced_dependencies() -> None:
    global YOLOWorld, FaceAnalysis, torch, ultralytics, yaml
    if all(dependency is not None for dependency in (YOLOWorld, FaceAnalysis, torch, ultralytics, yaml)):
        return
    try:
        import torch as torch_module
        import ultralytics as ultralytics_module
        import yaml as yaml_module
        from insightface.app import FaceAnalysis as face_analysis_class
        from ultralytics import YOLOWorld as yolo_world_class
    except ImportError as exc:
        raise RuntimeError(
            "Advanced vision dependencies are not installed. "
            "Install backend/requirements-advanced.txt or set VISION_MODE=lite."
        ) from exc
    torch = torch_module
    ultralytics = ultralytics_module
    yaml = yaml_module
    YOLOWorld = yolo_world_class
    FaceAnalysis = face_analysis_class


class LiteVisionPipeline:
    """A dependency-light, local fallback using OpenCV motion and face detection."""

    def __init__(self) -> None:
        self.device = "cpu-lite"
        self.backend_name = "OpenCV lite"
        self.hardware = cpu_hardware("Lite vision profile selected.")
        self._previous_gray: np.ndarray | None = None
        cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
        self._face_cascade = cv2.CascadeClassifier(str(cascade_path))
        if self._face_cascade.empty():
            logger.warning("OpenCV face cascade is unavailable; lite face detection is disabled.")

    def process_frame(self, frame: np.ndarray) -> dict[str, Any]:
        if not isinstance(frame, np.ndarray) or frame.ndim != 3 or frame.size == 0:
            raise ValueError("Expected a non-empty BGR image frame.")

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (7, 7), 0)
        faces: list[dict[str, Any]] = []
        if not self._face_cascade.empty():
            detected = self._face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.12,
                minNeighbors=5,
                minSize=(36, 36),
            )
            for x, y, width, height in detected[:12]:
                faces.append(
                    {
                        "bbox": [float(x), float(y), float(x + width), float(y + height)],
                        "confidence": 0.72,
                        "embedding": None,
                        "landmarks": None,
                    }
                )

        objects: list[dict[str, Any]] = []
        if self._previous_gray is not None and self._previous_gray.shape == gray.shape:
            delta = cv2.absdiff(self._previous_gray, gray)
            _, mask = cv2.threshold(delta, 24, 255, cv2.THRESH_BINARY)
            mask = cv2.dilate(mask, None, iterations=2)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            frame_area = float(frame.shape[0] * frame.shape[1])
            regions = sorted(contours, key=cv2.contourArea, reverse=True)
            for index, contour in enumerate(regions[:8]):
                area = cv2.contourArea(contour)
                if area < max(450.0, frame_area * 0.003):
                    continue
                x, y, width, height = cv2.boundingRect(contour)
                confidence = min(0.95, 0.55 + (area / frame_area) * 3.0)
                objects.append(
                    {
                        "bbox": [float(x), float(y), float(x + width), float(y + height)],
                        "label": "motion region",
                        "confidence": float(confidence),
                        "track_id": f"M-{index + 1:02d}",
                    }
                )
        self._previous_gray = gray

        brightness = float(np.mean(gray) / 255.0)
        return {
            "objects": objects,
            "faces": faces,
            "frame_embedding": _frame_descriptor(frame),
            "metrics": {
                "brightness": round(brightness, 3),
                "motion_regions": len(objects),
            },
        }


class AdvancedVisionPipeline:
    """YOLO-World Objects365 detection plus InsightFace analysis."""

    def __init__(self, model_name: str) -> None:
        _load_advanced_dependencies()
        self.hardware = select_torch_hardware(torch, discover_system_accelerator())
        self.torch_device = self.hardware.torch_device
        self.device = self.hardware.runtime
        self.backend_name = "YOLO-World + InsightFace"

        logger.info("Loading YOLO-World model %s on %s.", model_name, self.device)
        self.detector = YOLOWorld(model_name)
        try:
            self.detector.to(self.torch_device)
        except Exception as exc:
            if not self.hardware.accelerated:
                raise
            logger.warning("GPU model initialization failed; retrying on CPU: %s", exc)
            self.hardware = cpu_hardware(f"GPU initialization failed: {exc}")
            self.torch_device = self.hardware.torch_device
            self.device = self.hardware.runtime
            self.detector = YOLOWorld(model_name)
            self.detector.to(self.torch_device)

        class_names = self._load_objects365_names()
        if class_names:
            self.detector.set_classes(class_names)

        gpu_provider = {"NVIDIA": "CUDAExecutionProvider", "AMD": "ROCMExecutionProvider"}.get(self.hardware.vendor)
        preferred_providers = [gpu_provider, "CPUExecutionProvider"] if gpu_provider else ["CPUExecutionProvider"]
        try:
            self.face_analysis = FaceAnalysis(providers=preferred_providers)
            self.face_analysis.prepare(
                ctx_id=0 if gpu_provider else -1,
                det_size=(640, 640),
            )
        except Exception as exc:
            if not gpu_provider:
                raise
            logger.warning("InsightFace GPU initialization failed; using CPU: %s", exc)
            self.face_analysis = FaceAnalysis(providers=["CPUExecutionProvider"])
            self.face_analysis.prepare(ctx_id=-1, det_size=(640, 640))

    @staticmethod
    def _load_objects365_names() -> list[str] | None:
        try:
            dataset_path = (
                Path(ultralytics.__file__).parent
                / "cfg"
                / "datasets"
                / "Objects365.yaml"
            )
            with dataset_path.open("r", encoding="utf-8") as handle:
                data = yaml.safe_load(handle)
            names = data.get("names", {})
            return list(names.values()) if isinstance(names, dict) else list(names)
        except (OSError, ValueError, AttributeError) as exc:
            logger.warning("Objects365 vocabulary unavailable; using model defaults: %s", exc)
            return None

    def process_frame(self, frame: np.ndarray) -> dict[str, Any]:
        if not isinstance(frame, np.ndarray) or frame.ndim != 3 or frame.size == 0:
            raise ValueError("Expected a non-empty BGR image frame.")

        detections = self.detector.predict(frame, conf=0.25, verbose=False)
        objects: list[dict[str, Any]] = []
        for result in detections:
            boxes = result.boxes.xyxy.cpu().numpy()
            scores = result.boxes.conf.cpu().numpy()
            labels = result.boxes.cls.cpu().numpy()
            boxes_list = boxes.tolist()
            scores_list = scores.tolist()
            labels_list = labels.tolist()
            for box, score, label in zip(boxes_list, scores_list, labels_list):
                objects.append(
                    {
                        "bbox": box,
                        "label": result.names[int(label)],
                        "confidence": float(score),
                    }
                )

        faces = []
        for face in self.face_analysis.get(frame):
            faces.append(
                {
                    "bbox": face.bbox.tolist(),
                    "confidence": float(face.det_score),
                    "embedding": (
                        face.embedding.tolist()
                        if getattr(face, "embedding", None) is not None
                        else None
                    ),
                    "landmarks": (
                        face.landmark_2d_106.tolist()
                        if getattr(face, "landmark_2d_106", None) is not None
                        else None
                    ),
                    "gender": (
                        int(face.gender)
                        if getattr(face, "gender", None) is not None
                        else None
                    ),
                    "age": (
                        int(face.age)
                        if getattr(face, "age", None) is not None
                        else None
                    ),
                }
            )
        return {
            "objects": objects,
            "faces": faces,
            "frame_embedding": _frame_descriptor(frame),
        }


class VisionPipeline:
    """Selects a reliable local pipeline and exposes one stable processing API."""

    def __init__(self, model_name: str | None = None, mode: str | None = None) -> None:
        requested_mode = (mode or os.getenv("VISION_MODE", "auto")).strip().lower()
        if requested_mode not in {"lite", "advanced", "auto"}:
            requested_mode = "auto"
        selected_model = model_name or os.getenv("VISION_MODEL", "yolov8s-worldv2.pt")
        self.requested_mode = requested_mode
        self.fallback_reason: str | None = None

        if requested_mode == "lite":
            self.backend: LiteVisionPipeline | AdvancedVisionPipeline = LiteVisionPipeline()
        else:
            try:
                self.backend = AdvancedVisionPipeline(selected_model)
            except Exception as exc:
                if requested_mode == "advanced":
                    raise
                self.fallback_reason = str(exc)
                logger.warning("Advanced inference unavailable; using lite mode: %s", exc)
                self.backend = LiteVisionPipeline()
                self.backend.hardware = cpu_hardware(
                    f"Advanced inference unavailable: {exc}",
                    discover_system_accelerator(),
                )

        self.device = self.backend.device
        self.backend_name = self.backend.backend_name
        self.hardware = self.backend.hardware.as_health_payload()
        logger.info("Vision pipeline ready: %s on %s", self.backend_name, self.device)

    def process_frame(self, frame: np.ndarray) -> dict[str, Any]:
        return self.backend.process_frame(frame)
