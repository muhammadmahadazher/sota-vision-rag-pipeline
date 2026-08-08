import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_float(value: str | None, default: float) -> float:
    try:
        return float(value) if value is not None else default
    except ValueError:
        return default


def _as_int(value: str | None, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    app_name: str
    vision_mode: str
    vision_model: str
    api_token: str | None
    allowed_origins: tuple[str, ...]
    qdrant_url: str | None
    qdrant_api_key: str | None
    gemini_api_key: str | None
    gemini_model: str
    rag_strict: bool
    synthesis_interval_seconds: float
    max_payload_bytes: int

    @classmethod
    def from_env(cls) -> "Settings":
        origins = tuple(
            origin.strip()
            for origin in os.getenv(
                "ALLOWED_ORIGINS",
                "http://127.0.0.1:3000,http://localhost:3000",
            ).split(",")
            if origin.strip()
        )
        mode = os.getenv("VISION_MODE", "lite").strip().lower()
        if mode not in {"lite", "advanced", "auto"}:
            mode = "lite"
        token = os.getenv("API_TOKEN", "").strip() or None
        return cls(
            app_name=os.getenv("APP_NAME", "Aether Vision RAG API"),
            vision_mode=mode,
            vision_model=os.getenv("VISION_MODEL", "yolov8s-worldv2.pt"),
            api_token=token,
            allowed_origins=origins,
            qdrant_url=os.getenv("QDRANT_URL", "").strip() or None,
            qdrant_api_key=os.getenv("QDRANT_API_KEY", "").strip() or None,
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip() or None,
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            rag_strict=_as_bool(os.getenv("RAG_STRICT"), False),
            synthesis_interval_seconds=max(
                1.0,
                _as_float(os.getenv("SYNTHESIS_INTERVAL_SECONDS"), 4.0),
            ),
            max_payload_bytes=max(
                256 * 1024,
                _as_int(os.getenv("MAX_PAYLOAD_BYTES"), 5 * 1024 * 1024),
            ),
        )
