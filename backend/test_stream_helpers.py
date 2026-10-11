from app.api.stream import _public_faces


def test_public_faces_empty():
    assert _public_faces([]) == []


def test_public_faces_keep_valid_keys():
    faces = [{"box": [0, 0, 10, 10], "name": "John", "score": 0.99}]
    assert _public_faces(faces) == faces


def test_public_faces_filter_keys():
    faces = [
        {
            "box": [0, 0, 10, 10],
            "embedding": [0.1, 0.2],
            "landmarks": [[1, 2], [3, 4]],
            "gender": "male",
            "age": 30,
        }
    ]
    expected = [{"box": [0, 0, 10, 10]}]
    assert _public_faces(faces) == expected


def test_public_faces_filter_none():
    faces = [{"box": [0, 0, 10, 10], "name": None, "score": None}]
    expected = [{"box": [0, 0, 10, 10]}]
    assert _public_faces(faces) == expected


def test_public_faces_complex():
    faces = [
        {"box": [0, 0, 10, 10], "name": "John", "embedding": [0.1]},
        {"box": [20, 20, 30, 30], "name": None, "age": 25},
        {},
    ]
    expected = [
        {"box": [0, 0, 10, 10], "name": "John"},
        {"box": [20, 20, 30, 30]},
        {},
    ]
    assert _public_faces(faces) == expected
