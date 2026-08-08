# Aether Vision RAG

[![CI](https://github.com/muhammadmahadazher/sota-vision-rag-pipeline/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammadmahadazher/sota-vision-rag-pipeline/actions/workflows/ci.yml)
[![GitHub Pages](https://img.shields.io/badge/live-demo-6ee7c7?style=flat&logo=github&logoColor=11151d)](https://muhammadmahadazher.github.io/sota-vision-rag-pipeline/)
[![License: MIT](https://img.shields.io/badge/license-MIT-72a7ff.svg)](LICENSE)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-3776AB?logo=python&logoColor=white)](backend/requirements.txt)

Aether Vision RAG is an open-source, privacy-first visual intelligence workspace. The hosted app analyzes webcam or uploaded video frames directly in the browser, while the optional self-hosted stack adds OpenCV or YOLO-World inference, Qdrant recall, and Gemini narration.

**[Open the interactive demo →](https://muhammadmahadazher.github.io/sota-vision-rag-pipeline/)**

The hosted page is locked to real **On-device** inference so an uploaded video can never be routed accidentally to an unavailable localhost API. Upload a video or allow the camera and wait for the pinned model to download once; it is cached by the browser and frames never leave the device.

For local CPU/GPU installation, diagnostics, and real-video testing, see **[Local setup and hardware verification](LOCAL_SETUP.md)**.

## Why it is useful

- **Works on GitHub Pages.** A pinned YOLOS-tiny model runs in a background browser worker for real 80-class object detection, overlays, summaries, and session memory with no backend or API key.
- **Scales to advanced vision.** YOLO-World v2 adds open-vocabulary Objects365 detection; InsightFace adds private face embeddings for temporal recall.
- **Remembers scene context.** Qdrant retrieves similar frames instead of treating every image as an isolated event.
- **Explains what changed.** Gemini synthesis is optional. When it is missing or rate-limited, a deterministic local narrator keeps the application useful.
- **Treats the browser as a product.** The responsive dashboard includes real webcam/video ingestion, model progress, confidence controls, overlay labels, text-to-speech, telemetry, searchable session memory, and JSON export.
- **Fails gracefully.** Vision, vector memory, and generative narration initialize independently and report their true state through the health API.

## Architecture

~~~mermaid
flowchart LR
    A["Webcam / video"] --> B{"Execution mode"}
    B -->|"On-device"| C["Background browser worker"]
    C --> D["Pinned YOLOS-tiny detector"]
    D --> E["Local scene summary"]
    E --> F["Searchable session memory"]
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

Windows:

~~~powershell
setup.bat
run.bat
~~~

Linux or macOS:

~~~bash
chmod +x setup.sh run.sh
./setup.sh
./run.sh
~~~

Native mode runs the frontend and backend. Vector memory is optional; start Qdrant separately or point **QDRANT_URL** at an existing instance.

### Advanced vision mode

Advanced mode can download several gigabytes. It automatically selects NVIDIA CUDA or AMD ROCm when the installed PyTorch build exposes one, and retries on CPU if GPU initialization fails.

Windows:

~~~powershell
setup.bat advanced
Copy-Item backend\.env.example backend\.env
# Edit backend\.env and set VISION_MODE=advanced
run.bat
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
| 80-class object detection | ✓ | — | — |
| Motion-region detection | — | ✓ | — |
| Face localization | — | ✓ | ✓ |
| Objects365 recognition | — | — | ✓ |
| Searchable memory | session | Qdrant | Qdrant |
| Local narration | ✓ | ✓ | ✓ |
| Gemini narration | — | optional | optional |
| GPU acceleration | NVIDIA/AMD WebGPU | — | NVIDIA CUDA / AMD ROCm |

The on-device worker requests a high-performance WebGPU adapter, accepts recognized NVIDIA/AMD hardware, and automatically rebuilds the pipeline on quantized CPU/WASM if detection, model loading, or inference fails. Model files are version-pinned and cached locally. Uploaded frames are never sent to the repository owner or an API.

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
