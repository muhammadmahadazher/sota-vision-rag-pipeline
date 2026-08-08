from types import SimpleNamespace
from unittest.mock import MagicMock

from app.core.hardware import select_torch_hardware


def fake_torch(*, available: bool, name: str = "", cuda: str | None = None, hip: str | None = None):
    module = MagicMock()
    module.cuda.is_available.return_value = available
    module.cuda.get_device_name.return_value = name
    module.version = SimpleNamespace(cuda=cuda, hip=hip)
    return module


def test_selects_nvidia_cuda_when_available():
    selection = select_torch_hardware(
        fake_torch(available=True, name="NVIDIA GeForce RTX 4070", cuda="12.8"),
    )
    assert selection.torch_device == "cuda:0"
    assert selection.vendor == "NVIDIA"
    assert selection.runtime == "NVIDIA GPU · CUDA"
    assert selection.accelerated is True


def test_selects_amd_rocm_through_pytorch_cuda_api():
    selection = select_torch_hardware(
        fake_torch(available=True, name="AMD Radeon RX 7900 XT", hip="6.3"),
    )
    assert selection.torch_device == "cuda:0"
    assert selection.vendor == "AMD"
    assert selection.runtime == "AMD GPU · ROCm"
    assert selection.accelerated is True


def test_falls_back_to_cpu_when_no_supported_runtime_is_available():
    selection = select_torch_hardware(fake_torch(available=False))
    assert selection.torch_device == "cpu"
    assert selection.vendor == "CPU"
    assert selection.accelerated is False
    assert "No CUDA or ROCm" in selection.fallback_reason


def test_falls_back_to_cpu_when_detection_fails():
    module = MagicMock()
    module.cuda.is_available.side_effect = RuntimeError("driver unavailable")
    selection = select_torch_hardware(module)
    assert selection.torch_device == "cpu"
    assert "driver unavailable" in selection.fallback_reason
