# Aether Vision RAG

[![CI](https://github.com/muhammadmahadazher/sota-vision-rag-pipeline/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammadmahadazher/sota-vision-rag-pipeline/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/live-demo-6ee7c7?style=flat&logo=github&logoColor=11151d)](https://muhammadmahadazher.github.io/sota-vision-rag-pipeline/)
[![License: MIT](https://img.shields.io/badge/license-MIT-72a7ff.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-3776AB?logo=python&logoColor=white)](backend/requirements.txt)

Aether Vision RAG is an open-source, privacy-first visual intelligence workspace. The hosted app analyzes webcam or uploaded video frames directly in the browser, while the optional self-hosted stack adds OpenCV or YOLO-World inference, Qdrant recall, and Gemini narration.

**[Open the interactive demo →](https://muhammadmahadazher.github.io/sota-vision-rag-pipeline/)**

The hosted page is locked to real **On-device** inference so an uploaded video can never be routed accidentally to localhost. Dependency-free motion analysis starts immediately, then the bundled 80-class RF-DETR Nano detector takes over on dependable CPU/WASM. A separate Florence-2 worker adds detailed keyframe captions when Chrome or Edge exposes a recognized NVIDIA or AMD WebGPU adapter. Multi-frame verification blocks transient boxes from the overlay and memory. Video frames never leave the browser; Florence model files are downloaded once from Hugging Face and browser-cached.

For the implemented pipeline, quality gates, and design boundaries, see **[Architecture](ARCHITECTURE.md)**. For local CPU/GPU installation, diagnostics, and real-video testing, see **[Local setup and hardware verification](LOCAL_SETUP.md)**.

## Why it is useful

- **Works on GitHub Pages.** RF-DETR Nano is bundled for verified CPU/WASM object detection; Florence-2 is a lazy, pinned NVIDIA/AMD WebGPU narrator. No backend or API key is required, and caption failure never disables detection.
- **Scales to advanced vision.** YOLO-World v2 adds open-vocabulary Objects365 detection; InsightFace adds private face embeddings for temporal recall.
- **Remembers scene context.** Qdrant retrieves similar frames instead of treating every image as an isolated event.
- **Explains the real scene.** Florence-2 describes browser keyframes on supported GPUs. The deterministic verified-track narrator remains available everywhere, while Gemini is optional in self-hosted mode.
- **Treats the browser as a product.** The responsive dashboard includes real webcam/video ingestion, model progress, confidence controls, overlay labels, text-to-speech, telemetry, searchable session memory, and JSON export.
- **Fails gracefully.** Vision, vector memory, and generative narration initialize independently and report their true state through the health API.

## Architecture

~~~mermaid
flowchart LR
    A["Webcam / video"] --> B{"Execution mode"}
    B -->|"On-device"| C["RF-DETR CPU/WASM worker"]
    C --> D["Candidate filter + temporal verifier"]
    B -->|"NVIDIA/AMD WebGPU"| E["Florence-2 keyframe worker"]
    D --> F["Grounded output fusion"]
    E --> F
    F --> P["Searchable session memory"]
    B -->|"Self-hosted"| G["Bounded FastAPI WebSocket"]
    G --> H{"Vision mode"}
    H -->|"default"| I["OpenCV lite"]
    H -->|"optional"| J["YOLO-World + InsightFace"]
    I --> K["Detections + frame descriptor"]
    J --> K
    K --> L["Qdrant similarity recall"]
    K --> M["Local narrator"]
    L --> N{"Gemini configured?"}
    N -->|"yes"| O["Grounded synthesis"]
    N -->|"no"| M
~~~

## Quick start

The detailed platform-specific guide is in [LOCAL_SETUP.md](LOCAL_SETUP.md).

### Option A — full stack with Docker

Requires Docker Desktop or Docker Engine with Compose.

~~~bash
git clone https://github.com/muhammadmahadazher/sota-vision-rag-pipeline.git
cd sota-vision-rag-pipeline
docker compose up --build
~~~

Open:

- Dashboard: http://127.0.0.1:3000
- API documentation: http://127.0.0.1:8000/docs
- Qdrant console: http://127.0.0.1:6333/dashboard

The Compose image deliberately uses reliable lite vision. Set **GEMINI_API_KEY** in your shell before starting Compose if you want Gemini narration; it is not required.

### Option B — native development

Requires Python 3.12+ and Node.js 20+.

Windows (one command; missing dependencies are installed automatically):

~~~powershell
.\run.bat
~~~

To install without launching, run `.\setup.bat`. Keep the `run.bat` window open while using the app; press `Ctrl+C` there to stop both services. The launcher waits until both <http://127.0.0.1:3000> and <http://127.0.0.1:8000/health> are ready before opening the dashboard.

Windows keeps generated dependencies, a synchronized frontend working copy, and Next.js build output under `%LOCALAPPDATA%\AetherVision\environments`, with the selected path recorded in `.aether\dependency-cache.txt`. This avoids package/build corruption and long stalls when the repository is stored on Google Drive or OneDrive.

Linux or macOS:

~~~bash
chmod +x setup.sh run.sh
./setup.sh
./run.sh
~~~

The first setup can take a few minutes; unchanged repeat runs are skipped. The Windows launcher installs anything missing, waits for both services, prints the exact URLs, and opens the dashboard only after it is ready. Native mode runs the frontend and backend. Vector memory is optional; start Qdrant separately or point **QDRANT_URL** at an existing instance. On the first supported-GPU browser run, Florence downloads roughly 145 MB of pinned model files and shows progress; later runs reuse the browser cache.

### Advanced vision mode

Advanced mode can download several gigabytes. It automatically selects NVIDIA CUDA or AMD ROCm when the installed PyTorch build exposes one, and retries on CPU if GPU initialization fails.

Windows:

~~~powershell
.\setup.bat advanced
Copy-Item backend\.env.example backend\.env
# Edit backend\.env and set VISION_MODE=advanced
.\run.bat
~~~

Linux or macOS:

~~~bash
./setup.sh --advanced
cp backend/.env.example backend/.env
# Edit backend/.env and set VISION_MODE=advanced
./run.sh
~~~

Use the official PyTorch install selector for the machine's CUDA or ROCm version. Run `python -m app.core.hardware` from `backend/` to inspect the selection; the API also reports it at `GET /health`.

## Configuration

Copy **backend/.env.example** to **backend/.env**. All external services are optional unless **RAG_STRICT=true**.

| Variable | Default | Purpose |
| --- | --- | --- |
| VISION_MODE | auto | Detect advanced CUDA/ROCm when installed; otherwise CPU lite |
| VISION_MODEL | yolov8s-worldv2.pt | Ultralytics model used in advanced mode |
| QDRANT_URL | http://127.0.0.1:6333 | Vector database endpoint; blank disables vector memory |
| QDRANT_API_KEY | blank | Optional Qdrant Cloud key |
| GEMINI_API_KEY | blank | Enables Gemini narration |
| GEMINI_MODEL | gemini-2.5-flash | Generative model name |
| API_TOKEN | blank | Optional WebSocket token; leave blank only for trusted local use |
| ALLOWED_ORIGINS | localhost ports | Comma-separated HTTP/WebSocket origins |
| RAG_STRICT | false | Fail startup when Qdrant or Gemini is unavailable |
| SYNTHESIS_INTERVAL_SECONDS | 4 | Minimum narrative synthesis interval |
| MAX_PAYLOAD_BYTES | 5242880 | Maximum incoming JPEG frame size |

The frontend keeps a user-entered API token only in tab memory. It is never committed, persisted, or included in the static GitHub Pages bundle.

## Runtime modes

| Capability | Hosted on-device | Lite backend | Advanced backend |
| --- | ---: | ---: | ---: |
| Interactive dashboard | ✓ | ✓ | ✓ |
| Webcam / video ingestion | ✓ | ✓ | ✓ |
| Verified object detection | 80 classes | — | — |
| Motion-region detection | ✓ | ✓ | — |
| Face localization | — | ✓ | ✓ |
| Objects365 recognition | — | — | ✓ |
| Searchable memory | session | Qdrant | Qdrant |
| Local narration | RF-DETR + Florence/deterministic | ✓ | ✓ |
| Gemini narration | — | optional | optional |
| GPU acceleration | Florence NVIDIA/AMD WebGPU; detector stays CPU/WASM | — | NVIDIA CUDA / AMD ROCm |

The detector worker starts with dependency-free motion analysis and then activates the bundled RF-DETR Nano q8 model on CPU/WASM. Candidate boxes must survive score filtering, duplicate suppression, and two or three consistent observations before they appear or enter memory. Independently, a recognized NVIDIA/AMD WebGPU adapter can run the pinned Florence-2 model on eight-second keyframes. Florence downloads model weights from Hugging Face on first use, but the video frame is processed locally and is never sent to Hugging Face, the repository owner, or an inference API.

## WebSocket API

Connect to **/api/stream**, optionally with a token:

~~~text
ws://127.0.0.1:8000/api/stream?token=YOUR_TOKEN
~~~

Send JPEG-encoded binary frames. The API returns:

~~~json
{
  "objects": [
    {
      "bbox": [118.0, 96.0, 350.0, 578.0],
      "label": "person",
      "confidence": 0.97
    }
  ],
  "faces": [
    {
      "bbox": [176.0, 104.0, 286.0, 232.0],
      "confidence": 0.91
    }
  ],
  "narrative": "A person is present near the central desk.",
  "status": "Connected",
  "qdrant_latency_ms": 18.4,
  "device": "cpu-lite",
  "backend": "OpenCV lite"
}
~~~

Face embeddings and landmarks are never returned to the browser. Demographic estimates are excluded from the public payload and hosted demo.

Health and readiness information is available at **GET /health**.

## Development and verification

Frontend:

~~~bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test:run
npm run build
~~~

Backend:

~~~bash
python -m pip install -r backend/requirements-dev.txt
cd backend
python -m compileall -q .
python -m pytest -q
~~~

CI runs all of the above on every pull request. The Pages workflow exports the Next.js app as static files and publishes it with the repository base path.

## Project layout

~~~text
.
├── .github/workflows/        CI and GitHub Pages deployment
├── backend/
│   ├── app/api/stream.py     bounded WebSocket ingestion
│   ├── app/core/config.py    typed environment settings
│   ├── app/core/inference.py lite and advanced vision modes
│   ├── app/core/rag_engine.py
│   └── main.py               FastAPI lifecycle and health API
├── frontend/
│   ├── src/app/              product page and design system
│   ├── src/components/       stream, overlay, and memory UI
│   └── src/lib/vision.ts     shared client data model and demo scenarios
└── docker-compose.yml
~~~

## Privacy and responsible use

This project processes camera imagery and can create persistent vector representations. Obtain consent, define retention limits, secure Qdrant, and comply with applicable biometric/privacy law before using it outside a controlled experiment.

Aether avoids identity claims, does not expose face embeddings to the browser, omits demographic estimates from public payloads, bounds incoming frame size, applies WebSocket origin checks, and supports constant-time token validation. These safeguards are a baseline, not a substitute for a deployment-specific threat model.

## Contributing

Issues and focused pull requests are welcome. Please include tests for behavior changes and keep the hosted demo functional without secrets or external services.

Released under the [MIT License](LICENSE).
