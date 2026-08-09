# Local setup and hardware verification

## Prerequisites

- Node.js 20.9 or newer
- Python 3.12 or newer
- Git
- Optional: Docker Desktop for the containerized CPU stack

## Fastest Windows setup

From the repository root, one command installs anything missing and starts both services:

```powershell
.\run.bat
```

The first run installs the pinned dependencies and can take a few minutes. Run `.\setup.bat` only when you want to install without launching. `.\run.bat` waits for both services, prints their URLs, then opens <http://127.0.0.1:3000> automatically. Keep that terminal open and press `Ctrl+C` to stop. Use `.\run.bat -NoBrowser` to disable automatic opening. **On-device** analyzes frames in the browser; **Self-hosted** uses `ws://127.0.0.1:8000/api/stream`. Do not close the terminal before the `Frontend ready` and `Backend ready` messages appear.

On Windows, generated Python/Node dependencies, a synchronized frontend working copy, and Next.js build output live under `%LOCALAPPDATA%\AetherVision\environments` instead of the repository. This keeps `run.bat` reliable when the repository is on Google Drive or OneDrive. The exact cache path is recorded in `.aether\dependency-cache.txt`; source files remain in the repository.

The standard profile uses the reliable CPU-lite backend. In browser mode, the bundled RF-DETR detector always uses CPU/WASM. Chrome or Edge automatically enables the separate Florence-2 keyframe narrator when it exposes a recognized NVIDIA or AMD high-performance WebGPU adapter.

## NVIDIA or AMD advanced backend

Install the advanced application dependencies:

```powershell
.\setup.bat advanced
```

Then install the PyTorch build matching the machine's accelerator and driver by using the command generated at <https://pytorch.org/get-started/locally/>:

- NVIDIA: select the supported CUDA build.
- AMD: select the supported ROCm build on Linux. PyTorch exposes ROCm devices through its `torch.cuda` API, which Aether recognizes as AMD.
- If no usable GPU runtime is installed, Aether automatically selects CPU.

Keep this setting in `backend/.env`:

```dotenv
VISION_MODE=auto
```

Check the selection before starting the app:

```powershell
$cacheRoot = (Get-Content .aether\dependency-cache.txt -Raw).Trim()
Push-Location backend
& (Join-Path $cacheRoot "python\Scripts\python.exe") -m app.core.hardware
Pop-Location
```

Expected accelerated results include `NVIDIA GPU · CUDA` or `AMD GPU · ROCm`. A CPU result includes a `fallback_reason` explaining why acceleration was unavailable.

Start the application with `.\run.bat`, then inspect the live backend state:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health | ConvertTo-Json -Depth 6
```

## Linux or macOS

```bash
chmod +x setup.sh run.sh
./setup.sh                 # CPU-lite backend
# or: ./setup.sh --advanced
./run.sh
```

Hardware diagnostics:

```bash
cd backend
../.venv/bin/python -m app.core.hardware
```

NVIDIA CUDA and AMD ROCm are supported by the advanced Linux profile when the matching PyTorch runtime and drivers are installed. Other systems fall back to CPU.

## Test a real video

1. Open <http://127.0.0.1:3000>.
2. Choose **On-device** to test RF-DETR CPU/WASM plus optional Florence WebGPU, or **Self-hosted** to test FastAPI.
3. Select **Upload video** and choose an MP4, WebM, or MOV file.
4. Wait for `RF-DETR Nano COCO` to become ready and confirm verified detections appear over the video. On a supported GPU, the first Florence use downloads roughly 145 MB, displays progress, and may take about two minutes; later runs reuse the browser cache.
5. For Self-hosted mode, confirm `/health` reports `vision.ready: true` first.

Run the automated verification suite:

```powershell
.\setup.bat
$cacheRoot = (Get-Content .aether\dependency-cache.txt -Raw).Trim()

Push-Location (Join-Path $cacheRoot "frontend")
npm run lint
npm run typecheck
npm run test:run
npm run build
Pop-Location

Push-Location backend
& (Join-Path $cacheRoot "python\Scripts\python.exe") -m pip install -r requirements-dev.txt
& (Join-Path $cacheRoot "python\Scripts\python.exe") -m compileall -q .
& (Join-Path $cacheRoot "python\Scripts\python.exe") -m pytest -q
Pop-Location
```

## Runtime policy

| Path | Preferred accelerator | Automatic fallback |
| --- | --- | --- |
| Hosted/local browser | Florence-2 on recognized NVIDIA/AMD WebGPU | RF-DETR Nano q8 on CPU/WASM; motion analysis while it loads |
| Advanced Python backend | NVIDIA CUDA or AMD ROCm through PyTorch | CPU advanced model |
| Standard Python backend | CPU OpenCV-lite | Always available |

WebGPU exposes only limited adapter details for privacy. Aether requests the browser's high-performance adapter and enables Florence only when the reported vendor is NVIDIA or AMD and it is not a software fallback adapter. Built-in motion analysis starts immediately, followed by the bundled 80-class RF-DETR Nano q8 model on CPU/WASM. Florence runs in a separate worker on eight-second keyframes, so a model download or GPU failure cannot disable object detection. If RF-DETR itself cannot initialize, the UI explicitly reports the motion-only fallback.
