import pytest
from app.core.hardware import cpu_hardware
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
    ), patch.object(
        AdvancedVisionPipeline, "_load_objects365_names", return_value=None
    ):
        pipeline = AdvancedVisionPipeline("yolov8s-worldv2.pt")

    gpu_detector.to.assert_called_once_with("cuda:0")
    cpu_detector.to.assert_called_once_with("cpu")
    assert pipeline.device == "CPU"
    assert pipeline.hardware.vendor == "CPU"
    assert "out of GPU memory" in pipeline.hardware.fallback_reason


def test_advanced_pipeline_insightface_retries_on_cpu():
    gpu_detector = MagicMock()
    cpu_detector = MagicMock()
    detector_factory = MagicMock(side_effect=[gpu_detector, cpu_detector])

    fake_torch = MagicMock()
    fake_torch.cuda.is_available.return_value = True
    fake_torch.cuda.get_device_name.return_value = "NVIDIA GeForce RTX 4070"
    fake_torch.version = SimpleNamespace(cuda="12.8", hip=None)

    face_analysis_gpu = MagicMock()
    face_analysis_gpu.prepare.side_effect = RuntimeError("GPU memory error")

    face_analysis_cpu = MagicMock()

    face_analysis_factory = MagicMock(
        side_effect=[face_analysis_gpu, face_analysis_cpu])

    with patch.multiple(
        "app.core.inference",
        YOLOWorld=detector_factory,
        FaceAnalysis=face_analysis_factory,
        torch=fake_torch,
        ultralytics=MagicMock(),
        yaml=MagicMock(),
    ), patch.object(
        AdvancedVisionPipeline, "_load_objects365_names", return_value=None
    ):
        pipeline = AdvancedVisionPipeline("yolov8s-worldv2.pt")

    # The face analysis factory should be called twice (GPU then CPU)
    assert face_analysis_factory.call_count == 2

    # Check the first call (GPU attempt)
    call_args_1 = face_analysis_factory.call_args_list[0]
    assert call_args_1.kwargs['providers'] == [
        'CUDAExecutionProvider', 'CPUExecutionProvider']
    face_analysis_gpu.prepare.assert_called_once_with(
        ctx_id=0, det_size=(640, 640))

    # Check the second call (CPU fallback)
    call_args_2 = face_analysis_factory.call_args_list[1]
    assert call_args_2.kwargs['providers'] == ['CPUExecutionProvider']
    face_analysis_cpu.prepare.assert_called_once_with(
        ctx_id=-1, det_size=(640, 640))

    # Ensure the pipeline assigned the CPU fallback
    assert pipeline.face_analysis == face_analysis_cpu


def test_advanced_pipeline_fails_when_not_accelerated():
    cpu_detector = MagicMock()
    cpu_detector.to.side_effect = RuntimeError("CPU Initialization error")

    fake_torch = MagicMock()
    fake_torch.cuda.is_available.return_value = False

    face_engine = MagicMock()

    with patch.multiple(
        "app.core.inference",
        YOLOWorld=MagicMock(return_value=cpu_detector),
        FaceAnalysis=MagicMock(return_value=face_engine),
        torch=fake_torch,
        ultralytics=MagicMock(),
        yaml=MagicMock(),
        select_torch_hardware=MagicMock(return_value=cpu_hardware())
    ), patch.object(
        AdvancedVisionPipeline, "_load_objects365_names", return_value=None
    ):
        with pytest.raises(RuntimeError, match="CPU Initialization error"):
            AdvancedVisionPipeline("yolov8s-worldv2.pt")


def test_advanced_pipeline_insightface_fails_when_not_accelerated():
    fake_torch = MagicMock()
    fake_torch.cuda.is_available.return_value = False

    face_analysis_cpu = MagicMock()
    face_analysis_cpu.prepare.side_effect = RuntimeError(
        "CPU InsightFace error")

    detector_factory = MagicMock()

    with patch.multiple(
        "app.core.inference",
        YOLOWorld=detector_factory,
        FaceAnalysis=MagicMock(return_value=face_analysis_cpu),
        torch=fake_torch,
        ultralytics=MagicMock(),
        yaml=MagicMock(),
        select_torch_hardware=MagicMock(return_value=cpu_hardware())
    ), patch.object(
        AdvancedVisionPipeline, "_load_objects365_names", return_value=None
    ):
        with pytest.raises(RuntimeError, match="CPU InsightFace error"):
            AdvancedVisionPipeline("yolov8s-worldv2.pt")
