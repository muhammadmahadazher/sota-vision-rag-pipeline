export type VisionMode = "browser" | "backend";

export type ConnectionState =
  | "demo"
  | "loading"
  | "connecting"
  | "connected"
  | "offline"
  | "error";

export interface DetectedObject {
  bbox: [number, number, number, number];
  label: string;
  confidence: number;
  track_id?: string;
}

export interface DetectedFace {
  bbox: [number, number, number, number];
  gender?: number;
  age?: number;
  confidence: number;
}

export interface AnalysisPacket {
  objects: DetectedObject[];
  faces: DetectedFace[];
  narrative: string;
  status: string;
  qdrant_latency_ms: number;
  device: string;
  fps: number;
  frame: { width: number; height: number };
  timestamp: number;
}

export interface DemoScene extends AnalysisPacket {
  id: string;
  label: string;
  visual: "studio" | "workshop" | "lobby" | "dispatch";
}

export const DEMO_SCENES: DemoScene[] = [
  {
    id: "studio-briefing",
    label: "Studio briefing",
    visual: "studio",
    objects: [
      { bbox: [118, 96, 350, 578], label: "person", confidence: 0.97, track_id: "P-01" },
      { bbox: [602, 318, 836, 522], label: "laptop", confidence: 0.93, track_id: "O-12" },
      { bbox: [526, 270, 916, 568], label: "desk", confidence: 0.89, track_id: "O-08" },
    ],
    faces: [{ bbox: [176, 104, 286, 232], confidence: 0.98 }],
    narrative:
      "A presenter has entered the studio and opened a laptop at the central desk. The workspace is stable, with no unexpected movement in the scene.",
    status: "Demo replay",
    qdrant_latency_ms: 18,
    device: "YOLO-World · sample",
    fps: 5,
    frame: { width: 1000, height: 650 },
    timestamp: 0,
  },
  {
    id: "workshop-inspection",
    label: "Workshop inspection",
    visual: "workshop",
    objects: [
      { bbox: [96, 122, 332, 590], label: "person", confidence: 0.96, track_id: "P-04" },
      { bbox: [528, 330, 694, 512], label: "power drill", confidence: 0.91, track_id: "O-31" },
      { bbox: [708, 210, 902, 512], label: "tool cabinet", confidence: 0.94, track_id: "O-19" },
      { bbox: [414, 414, 514, 544], label: "safety helmet", confidence: 0.87, track_id: "O-22" },
    ],
    faces: [{ bbox: [162, 132, 266, 252], confidence: 0.96 }],
    narrative:
      "One technician is inspecting the workbench. A power drill and safety helmet are visible; the helmet is currently on the bench rather than being worn.",
    status: "Demo replay",
    qdrant_latency_ms: 22,
    device: "YOLO-World · sample",
    fps: 5,
    frame: { width: 1000, height: 650 },
    timestamp: 0,
  },
  {
    id: "lobby-arrival",
    label: "Lobby arrival",
    visual: "lobby",
    objects: [
      { bbox: [176, 116, 396, 588], label: "person", confidence: 0.98, track_id: "P-07" },
      { bbox: [656, 142, 840, 584], label: "person", confidence: 0.95, track_id: "P-08" },
      { bbox: [732, 402, 888, 574], label: "suitcase", confidence: 0.92, track_id: "O-47" },
      { bbox: [412, 190, 612, 470], label: "display screen", confidence: 0.9, track_id: "O-44" },
    ],
    faces: [
      { bbox: [236, 124, 336, 238], confidence: 0.97 },
      { bbox: [696, 150, 792, 258], confidence: 0.94 },
    ],
    narrative:
      "A returning visitor is being joined by a second person carrying a suitcase. Similar lobby activity was observed earlier, but the luggage is new to this sequence.",
    status: "Demo replay",
    qdrant_latency_ms: 14,
    device: "YOLO-World · sample",
    fps: 5,
    frame: { width: 1000, height: 650 },
    timestamp: 0,
  },
  {
    id: "dispatch-check",
    label: "Dispatch check",
    visual: "dispatch",
    objects: [
      { bbox: [114, 108, 326, 586], label: "person", confidence: 0.97, track_id: "P-11" },
      { bbox: [470, 340, 674, 548], label: "package", confidence: 0.95, track_id: "O-62" },
      { bbox: [696, 306, 884, 548], label: "package", confidence: 0.93, track_id: "O-63" },
      { bbox: [412, 154, 618, 310], label: "barcode scanner", confidence: 0.88, track_id: "O-58" },
    ],
    faces: [{ bbox: [168, 116, 272, 234], confidence: 0.96 }],
    narrative:
      "The dispatch operator is scanning two packages at the outbound station. Both parcels remain inside the marked handoff area and the sequence is progressing normally.",
    status: "Demo replay",
    qdrant_latency_ms: 19,
    device: "YOLO-World · sample",
    fps: 5,
    frame: { width: 1000, height: 650 },
    timestamp: 0,
  },
];

export const EMPTY_PACKET: AnalysisPacket = {
  objects: [],
  faces: [],
  narrative: "",
  status: "Ready",
  qdrant_latency_ms: 0,
  device: "Standby",
  fps: 0,
  frame: { width: 1000, height: 650 },
  timestamp: 0,
};

export function isAnalysisPacket(value: unknown): value is Partial<AnalysisPacket> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.objects === undefined || Array.isArray(candidate.objects)) &&
    (candidate.faces === undefined || Array.isArray(candidate.faces)) &&
    (candidate.narrative === undefined || typeof candidate.narrative === "string")
  );
}
