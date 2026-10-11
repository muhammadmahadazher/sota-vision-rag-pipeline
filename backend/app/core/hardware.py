import json
import shutil
import subprocess
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any


class HardwareVendor(str, Enum):
    CPU = "CPU"
    NVIDIA = "NVIDIA"
    AMD = "AMD"


class HardwareRuntime(str, Enum):
    CPU = "CPU"
    CUDA = "NVIDIA GPU · CUDA"
    ROCM = "AMD GPU · ROCm"


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

    def as_health_payload(self) -> dict[str, Any]:
        return asdict(self)


def cpu_hardware(
    reason: str | None = None,
    detected_accelerator: tuple[HardwareVendor, str] | None = None,
) -> HardwareSelection:
    return HardwareSelection(
        torch_device="cpu",
        vendor=HardwareVendor.CPU,
        name="System CPU",
        runtime=HardwareRuntime.CPU,
        accelerated=False,
        fallback_reason=reason,
        detected_vendor=(detected_accelerator[0]
                         if detected_accelerator else None),
        detected_name=(detected_accelerator[1]
                       if detected_accelerator else None),
    )


def discover_system_accelerator() -> tuple[HardwareVendor, str] | None:
    probes = (
        (HardwareVendor.NVIDIA, ["nvidia-smi",
         "--query-gpu=name", "--format=csv,noheader"]),
        (HardwareVendor.AMD, ["rocm-smi", "--showproductname"]),
    )
    for vendor, command in probes:
        executable = shutil.which(command[0])
        if not executable:
            continue
        try:
            result = subprocess.run(
                [executable, *command[1:]],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode == 0:
            lines = [
                line.strip()
                for line in result.stdout.splitlines()
                if line.strip()
            ]
            if lines:
                return vendor, lines[0]
    return None


def select_torch_hardware(
    torch_module: Any,
    system_accelerator: tuple[HardwareVendor, str] | None = None,
) -> HardwareSelection:
    if torch_module is None:
        reason = (
            f"{system_accelerator[0]} GPU detected, "
            "but PyTorch is not installed."
            if system_accelerator
            else "PyTorch is not installed."
        )
        return cpu_hardware(reason, system_accelerator)
    try:
        if not bool(torch_module.cuda.is_available()):
            reason = (
                f"{system_accelerator[0]} GPU detected, but the installed "
                "PyTorch build cannot use it."
                if system_accelerator
                else "No CUDA or ROCm accelerator is available to PyTorch."
            )
            return cpu_hardware(reason, system_accelerator)
        name = str(torch_module.cuda.get_device_name(0) or "GPU")
        version = getattr(torch_module, "version", None)
        hip_version = getattr(version, "hip", None)
        name_lower = name.lower()
        is_amd = bool(hip_version) or any(
            marker in name_lower
            for marker in ("amd", "radeon", "advanced micro devices")
        )
        if is_amd:
            return HardwareSelection(
                torch_device="cuda:0",
                vendor=HardwareVendor.AMD,
                name=name,
                runtime=HardwareRuntime.ROCM,
                accelerated=True,
                detected_vendor=HardwareVendor.AMD,
                detected_name=name,
            )
        return HardwareSelection(
            torch_device="cuda:0",
            vendor=HardwareVendor.NVIDIA,
            name=name,
            runtime=HardwareRuntime.CUDA,
            accelerated=True,
            detected_vendor=HardwareVendor.NVIDIA,
            detected_name=name,
        )
    except Exception as exc:
        return cpu_hardware(
            f"Accelerator detection failed: {exc}",
            system_accelerator,
        )


def detect_installed_hardware() -> HardwareSelection:
    system_accelerator = discover_system_accelerator()
    try:
        import torch
    except ImportError:
        return cpu_hardware(
            "PyTorch is not installed; install the advanced "
            "profile for GPU inference.",
            system_accelerator,
        )
    return select_torch_hardware(torch, system_accelerator)


if __name__ == "__main__":
    payload = detect_installed_hardware().as_health_payload()
    print(json.dumps(payload, indent=2))
