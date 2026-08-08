import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamController } from "./StreamController";

interface PostedMessage {
  type: string;
  [key: string]: unknown;
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  posted: PostedMessage[] = [];

  constructor(
    readonly url: string | URL,
    readonly options?: WorkerOptions,
  ) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: PostedMessage) {
    this.posted.push(message);
    if (message.type !== "analyze") return;
    window.setTimeout(() => {
      this.onmessage?.({
        data: { type: "progress", status: "progress", file: "model.onnx", progress: 72 },
      } as MessageEvent);
      this.onmessage?.({
        data: { type: "ready", runtime: "YOLOS-tiny · WASM" },
      } as MessageEvent);
      this.onmessage?.({
        data: {
          type: "result",
          id: message.id,
          width: 640,
          height: 421,
          elapsedMs: 84,
          runtime: "YOLOS-tiny · WASM",
          detections: [
            {
              label: "person",
              score: 0.93,
              box: { xmin: 20, ymin: 30, xmax: 210, ymax: 400 },
            },
          ],
        },
      } as MessageEvent);
    }, 0);
  }

  terminate() {}
}

describe("StreamController on-device video", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:aether-test-video"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "ended", {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true,
      get: () => 720,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true,
      get: () => 474,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["frame"], { type: "image/jpeg" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("analyzes an uploaded video without opening a WebSocket", async () => {
    const onPacketUpdate = vi.fn();
    const websocket = vi.fn();
    vi.stubGlobal("WebSocket", websocket);
    const { container, unmount } = render(
      <StreamController onPacketUpdate={onPacketUpdate} />,
    );

    expect(screen.getByRole("button", { name: "On-device" })).toHaveClass("is-active");
    expect(screen.getByRole("button", { name: /Analyze a video on this device/i })).toBeInTheDocument();

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const video = new File(["video"], "capture.mp4", { type: "video/mp4" });
    fireEvent.change(input!, { target: { files: [video] } });

    await waitFor(() => {
      expect(screen.getByText("On-device analysis")).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(websocket).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(String(FakeWorker.instances[0].url)).toContain("local-vision-worker.js");
    expect(FakeWorker.instances[0].options).toMatchObject({ type: "module" });
    expect(FakeWorker.instances[0].posted.some((message) => message.type === "analyze")).toBe(true);
    expect(onPacketUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objects: [expect.objectContaining({ label: "person", confidence: 0.93 })],
        device: "YOLOS-tiny · WASM",
      }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    unmount();
    expect(FakeWorker.instances[0].posted.some((message) => message.type === "dispose")).toBe(true);
  });

  it("keeps self-hosted processing an explicit separate mode", () => {
    render(<StreamController />);
    fireEvent.click(screen.getByRole("button", { name: "Self-hosted" }));

    expect(screen.getByRole("button", { name: "Self-hosted" })).toHaveClass("is-active");
    expect(screen.getByText(/Optional self-hosted processing/i)).toBeInTheDocument();
    expect(screen.getByText(/Start the local stack first/i)).toBeInTheDocument();
  });
});
