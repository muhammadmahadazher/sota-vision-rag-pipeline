from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.core.inference import AdvancedVisionPipeline


def test_advanced_pipeline_retries_on_cpu_when_gpu_initialization_fails():
    gpu_detector = MagicMock()
    gpu_detector.to.side_effect = RuntimeError("out of GPU memory")
    cpu_detector = MagicMock()
    detector_factory = MagicMock(side_effect=[gpu_detector, cpu_detector])

    fake_torch = MagicMock()
    fake_torch.cuda.is_available.return_value = True
    fake_torch.cuda.get_device_name.return_value = "NVIDIA GeForce RTX 4070"
    fake_torch.version = SimpleNamespace(cuda="12.8", hip=None)
    face_engine = MagicMock()

    with patch.multiple(
        "app.core.inference",
        YOLOWorld=detector_factory,
        FaceAnalysis=MagicMock(return_value=face_engine),
        torch=fake_torch,
        ultralytics=MagicMock(),
        yaml=MagicMock(),
    ), patch.object(AdvancedVisionPipeline, "_load_objects365_names", return_value=None):
        pipeline = AdvancedVisionPipeline("yolov8s-worldv2.pt")

    gpu_detector.to.assert_called_once_with("cuda:0")
    cpu_detector.to.assert_called_once_with("cpu")
    assert pipeline.device == "CPU"
    assert pipeline.hardware.vendor == "CPU"
    assert "out of GPU memory" in pipeline.hardware.fallback_reason
