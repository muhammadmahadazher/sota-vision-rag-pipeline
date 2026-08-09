from app.core.temporal import TemporalObjectVerifier


def detection(label: str, confidence: float, bbox: list[float] | None = None) -> dict:
    return {
        "label": label,
        "confidence": confidence,
        "bbox": bbox or [10.0, 10.0, 90.0, 90.0],
    }


def test_single_frame_false_positive_is_hidden() -> None:
    verifier = TemporalObjectVerifier()
    objects, events, metrics = verifier.update([detection("wine glass", 0.98)])

    assert objects == []
    assert events == []
    assert metrics["tentative_tracks"] == 1


def test_person_is_confirmed_on_second_observation() -> None:
    verifier = TemporalObjectVerifier()
    verifier.update([detection("person", 0.91)])
    objects, events, _ = verifier.update(
        [detection("person", 0.95, [12.0, 11.0, 92.0, 91.0])]
    )

    assert len(objects) == 1
    assert objects[0]["track_id"] == "T-001"
    assert events == [{"type": "entered", "label": "person", "track_id": "T-001"}]


def test_ambiguous_class_requires_three_observations() -> None:
    verifier = TemporalObjectVerifier()
    verifier.update([detection("cell phone", 0.9)])
    second, _, _ = verifier.update([detection("cell phone", 0.92)])
    third, _, _ = verifier.update([detection("cell phone", 0.94)])

    assert second == []
    assert len(third) == 1


def test_duplicate_suppression_keeps_highest_confidence_box() -> None:
    verifier = TemporalObjectVerifier()
    low_confidence = detection("person", 0.5, [10.0, 10.0, 90.0, 90.0])
    high_confidence = detection("person", 0.96, [11.0, 11.0, 91.0, 91.0])

    verifier.update([low_confidence, high_confidence])
    objects, _, metrics = verifier.update([low_confidence, high_confidence])

    assert metrics["candidates"] == 1
    assert len(objects) == 1
    assert objects[0]["confidence"] > 0.9
