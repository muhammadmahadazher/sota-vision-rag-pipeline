# Aether Vision frontend

The frontend is a static-exportable Next.js 16 application. It provides:

- a deterministic, no-secrets interactive demo for GitHub Pages;
- a live mode for webcam or video ingestion through the FastAPI WebSocket API;
- accessible detection controls, telemetry, temporal-memory search, and JSON export.

## Local development

~~~bash
npm ci
npm run dev
~~~

Open http://127.0.0.1:3000. The live mode defaults to ws://127.0.0.1:8000/api/stream and can be changed in the settings panel.

## Verification

~~~bash
npm run typecheck
npm run lint
npm run test:run
npm run build
~~~

To verify the repository base path used by GitHub Pages:

~~~bash
GITHUB_PAGES=true GITHUB_REPOSITORY=owner/repository npm run build
~~~

See the [root documentation](../README.md) for backend configuration and deployment.
