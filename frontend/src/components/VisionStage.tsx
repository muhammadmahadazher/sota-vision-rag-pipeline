import { Pause, Play, ScanLine, ShieldCheck, SkipForward } from "lucide-react";
import {
  ConnectionState,
  DemoScene,
  DetectedFace,
  DetectedObject,
} from "@/lib/vision";

interface DetectionOverlayProps {
  objects: DetectedObject[];
  faces: DetectedFace[];
  frame: { width: number; height: number };
  threshold: number;
  showLabels: boolean;
}

export function DetectionOverlay({
  objects,
  faces,
  frame,
  threshold,
  showLabels,
}: DetectionOverlayProps) {
  const safeWidth = frame.width || 1;
  const safeHeight = frame.height || 1;
  const toStyle = (bbox: [number, number, number, number]) => ({
    left: `${(bbox[0] / safeWidth) * 100}%`,
    top: `${(bbox[1] / safeHeight) * 100}%`,
    width: `${((bbox[2] - bbox[0]) / safeWidth) * 100}%`,
    height: `${((bbox[3] - bbox[1]) / safeHeight) * 100}%`,
  });

  return (
    <div className="detection-layer" aria-hidden="true">
      {objects
        .filter((object) => object.confidence >= threshold)
        .map((object, index) => (
          <div
            className="detection-box detection-box--object"
            style={toStyle(object.bbox)}
            key={`${object.track_id ?? object.label}-${index}`}
          >
            {showLabels && (
              <span className="detection-label">
                {object.label}
                <strong>{Math.round(object.confidence * 100)}</strong>
              </span>
            )}
          </div>
        ))}
      {faces
        .filter((face) => face.confidence >= threshold)
        .map((face, index) => (
          <div
            className="detection-box detection-box--face"
            style={toStyle(face.bbox)}
            key={`face-${index}`}
          >
            {showLabels && (
              <span className="detection-label detection-label--face">
                face
                <strong>{Math.round(face.confidence * 100)}</strong>
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

export function DemoSceneVisual({ visual }: { visual: DemoScene["visual"] }) {
  return (
    <div className={`demo-visual demo-visual--${visual}`}>
      <div className="demo-visual__glow" />
      <div className="demo-visual__window">
        <span />
        <span />
        <span />
      </div>
      <div className="demo-visual__display">
        <ScanLine size={22} />
        <span>Context stream</span>
      </div>
      <div className="demo-visual__person">
        <span className="demo-visual__head" />
        <span className="demo-visual__body" />
      </div>
      <div className="demo-visual__desk" />
      <div className="demo-visual__object" />
      <div className="demo-visual__floor" />
    </div>
  );
}

export function StatusDot({ state }: { state: ConnectionState }) {
  return <span className={`status-dot status-dot--${state}`} />;
}

interface DemoControlsProps {
  scene: DemoScene;
  running: boolean;
  onToggle: () => void;
  onNext: () => void;
}

export function DemoControls({ scene, running, onToggle, onNext }: DemoControlsProps) {
  return (
    <div className="demo-caption">
      <div>
        <span>Now replaying</span>
        <strong>{scene.label}</strong>
      </div>
      <div className="stage-controls">
        <button onClick={onToggle} aria-label={running ? "Pause demo" : "Play demo"}>
          {running ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button onClick={onNext} aria-label="Next demo scene">
          <SkipForward size={17} />
        </button>
      </div>
    </div>
  );
}

export function StreamPrivacyChip({ isDemo }: { isDemo: boolean }) {
  return (
    <span className="privacy-chip">
      <ShieldCheck size={13} /> {isDemo ? "Sample data" : "Local stream"}
    </span>
  );
}
