from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.core.inference import (
    AdvancedVisionPipeline,
    LiteVisionPipeline,
    VisionPipeline,
)


def test_lite_pipeline_validates_frames_and_detects_motion():
    pipeline = LiteVisionPipeline()
    with pytest.raises(ValueError):
        pipeline.process_frame(np.array([]))

    first = np.zeros((240, 320, 3), dtype=np.uint8)
    second = first.copy()
    second[60:180, 80:240] = 255
    baseline = pipeline.process_frame(first)
    result = pipeline.process_frame(second)

    assert baseline["objects"] == []
    assert len(result["frame_embedding"]) == 512
    assert result["metrics"]["motion_regions"] >= 1
    assert result["objects"][0]["label"] == "motion region"
    assert pipeline.device == "cpu-lite"


def test_advanced_pipeline_structures_detector_and_face_results():
    detector = MagicMock()
    detection = MagicMock()
    detection.boxes.xyxy.cpu.return_value.numpy.return_value = np.array(
        [[10, 20, 100, 200]]
    )
    detection.boxes.conf.cpu.return_value.numpy.return_value = np.array([0.95])
    detection.boxes.cls.cpu.return_value.numpy.return_value = np.array([0])
    detection.names = {0: "person"}
    detector.predict.return_value = [detection]

    face_engine = MagicMock()
    face = MagicMock()
    face.bbox = np.array([15, 25, 95, 195])
    face.det_score = 0.99
    face.embedding = np.ones(512)
    face.landmark_2d_106 = np.ones((106, 2))
    face.gender = 1
    face.age = 28
    face_engine.get.return_value = [face]

    fake_torch = MagicMock()
    fake_torch.cuda.is_available.return_value = False
    with patch.multiple(
        "app.core.inference",
        YOLOWorld=MagicMock(return_value=detector),
        FaceAnalysis=MagicMock(return_value=face_engine),
        torch=fake_torch,
        ultralytics=MagicMock(),
        yaml=MagicMock(),
    ), patch.object(AdvancedVisionPipeline, "_load_objects365_names", return_value=None):
        pipeline = VisionPipeline(mode="advanced")
        result = pipeline.process_frame(np.zeros((240, 320, 3), dtype=np.uint8))

    assert result["objects"][0]["label"] == "person"
    assert result["objects"][0]["confidence"] == pytest.approx(0.95)
    assert len(result["faces"][0]["embedding"]) == 512
    assert result["faces"][0]["age"] == 28
    detector.predict.assert_called_once()


def test_auto_mode_falls_back_to_lite_pipeline():
    lite = MagicMock(device="cpu-lite", backend_name="OpenCV lite")
    with patch(
        "app.core.inference.AdvancedVisionPipeline",
        side_effect=RuntimeError("advanced unavailable"),
    ), patch("app.core.inference.LiteVisionPipeline", return_value=lite):
        pipeline = VisionPipeline(mode="auto")

    assert pipeline.backend is lite
    assert pipeline.device == "cpu-lite"
    assert pipeline.fallback_reason == "advanced unavailable"
