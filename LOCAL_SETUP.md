# Local setup and hardware verification

## Prerequisites

- Node.js 20.9 or newer
- Python 3.12 or newer
- Git
- Optional: Docker Desktop for the containerized CPU stack

## Fastest Windows setup

From the repository root:

```powershell
.\setup.bat
.\run.bat
```

The first setup installs the pinned dependencies and can take a few minutes. Re-running `.\setup.bat` skips installation when the lockfiles are unchanged. `.\run.bat` waits for both services, then opens <http://127.0.0.1:3000> automatically. Use `.\run.bat -NoBrowser` to disable automatic opening. **On-device** analyzes frames in the browser; **Self-hosted** uses `ws://127.0.0.1:8000/api/stream`.

The standard profile uses the reliable CPU-lite backend. Browser inference still selects NVIDIA/AMD WebGPU automatically when Chrome or Edge exposes a supported high-performance adapter.

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
Push-Location backend
..\.venv\Scripts\python.exe -m app.core.hardware
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
2. Choose **On-device** to test browser WebGPU/WASM, or **Self-hosted** to test FastAPI.
3. Select **Upload video** and choose an MP4, WebM, or MOV file.
4. Confirm the Runtime card reports the selected accelerator and detections appear over the video.
5. For Self-hosted mode, confirm `/health` reports `vision.ready: true` first.

Run the automated verification suite:

```powershell
Push-Location frontend
npm ci
npm run lint
npm run typecheck
npm run test:run
npm run build
Pop-Location

Push-Location backend
..\.venv\Scripts\python.exe -m compileall -q .
..\.venv\Scripts\python.exe -m pytest -q
Pop-Location
```

## Runtime policy

| Path | Preferred accelerator | Automatic fallback |
| --- | --- | --- |
| Hosted/local browser | Recognized NVIDIA or AMD high-performance WebGPU adapter | Quantized WASM, then dependency-free browser CPU vision |
| Advanced Python backend | NVIDIA CUDA or AMD ROCm through PyTorch | CPU advanced model |
| Standard Python backend | CPU OpenCV-lite | Always available |

WebGPU exposes only limited adapter details for privacy. Aether requests the browser's high-performance adapter and uses it only when the reported vendor is NVIDIA or AMD and it is not a software fallback adapter. Built-in CPU motion analysis starts immediately. The optional object model upgrades to GPU or WASM when available, so a blocked CDN or model download never makes the hosted demo unusable.
