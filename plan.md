# Plan

1. In `backend/app/core/hardware.py`:
   - Create an `Enum` for `HardwareVendor`: `CPU`, `NVIDIA`, `AMD`
   - Create an `Enum` for `HardwareRuntime`: `CPU`, `CUDA`, `ROCm`
   - Update `HardwareSelection` to use these enums for `vendor`, `detected_vendor`, and `runtime`.
   - Update string assignments to use `HardwareVendor.CPU.value` (or standard string serialization). Wait, the test expects `"CPU"` string maybe. Let's make them string Enums:
     ```python
     from enum import Enum

     class HardwareVendor(str, Enum):
         CPU = "CPU"
         NVIDIA = "NVIDIA"
         AMD = "AMD"

     class HardwareRuntime(str, Enum):
         CPU = "CPU"
         CUDA = "NVIDIA GPU · CUDA"
         ROCM = "AMD GPU · ROCm"
     ```
   - Actually, using `str, Enum` allows them to be serialized to JSON automatically by `asdict`, but maybe it's better to type hint them as the Enum types.
   - Wait, `runtime` enum values in the current code are: `"CPU"`, `"AMD GPU · ROCm"`, `"NVIDIA GPU · CUDA"`.
   - Let's update `HardwareSelection` class:
     ```python
     @dataclass(frozen=True)
     class HardwareSelection:
         torch_device: str
         vendor: HardwareVendor
         name: str
         runtime: HardwareRuntime
         accelerated: bool
         fallback_reason: str | None = None
         detected_vendor: HardwareVendor | None = None
         detected_name: str | None = None
     ```
   - Wait, in `discover_system_accelerator`, `probes` is `(("NVIDIA", ...), ("AMD", ...))`. This function returns a tuple. Let's adjust it to return `tuple[HardwareVendor, str] | None`.
   - Wait, `cpu_hardware` sets `detected_vendor=detected_accelerator[0]` which would be `HardwareVendor`.
2. Update tests:
   - Ensure the updated code passes `test_hardware.py`, `test_gpu_fallback.py`, and `test_inference.py`. Since we are using `str, Enum`, they should pass `== "NVIDIA"` assertions in tests. Let's make sure.
3. Pre-commit check.
4. Submit.
