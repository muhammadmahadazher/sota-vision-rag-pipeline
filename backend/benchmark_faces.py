import timeit
import random
import string

def generate_mock_results(num_faces, num_objects):
    faces = []
    for _ in range(num_faces):
        face = {
            "bbox": [random.random() * 100 for _ in range(4)],
            "age": random.randint(10, 80),
            "gender": random.choice(["Male", "Female"]),
            "embedding": [random.random() for _ in range(512)],
            "id": "".join(random.choices(string.ascii_letters, k=8))
        }
        faces.append(face)

    objects = []
    for _ in range(num_objects):
        obj = {
            "bbox": [random.random() * 100 for _ in range(4)],
            "label": random.choice(["person", "car", "dog"]),
            "confidence": random.random()
        }
        objects.append(obj)

    return {"faces": faces, "objects": objects}

def run_unoptimized(results):
    # Simulates what happens in stream.py currently
    # 1. current_metadata
    current_metadata = {
        "objects": results.get("objects", []),
        "faces": [
            {k: v for k, v in face.items() if k != "embedding"}
            for face in results.get("faces", [])
        ]
    }

    # 2. payload_metadata
    faces = results.get('faces', [])
    payload_metadata = {
        "timestamp": 123456789.0,
        "narrative": "test",
        "objects": results.get("objects", []),
        "faces": [
            {k: v for k, v in f.items() if k != "embedding"}
            for f in faces
        ]
    }

    # 3. payload
    payload = {
        "objects": results.get("objects", []),
        "faces": [
            {k: v for k, v in face.items() if k != "embedding"}
            for face in results.get("faces", [])
        ],
        "narrative": "test",
        "status": "Connected",
        "qdrant_latency_ms": 0.0,
        "device": "cpu"
    }

    return current_metadata, payload_metadata, payload

def run_optimized(results):
    # Simulates optimized version
    objects = results.get("objects", [])
    clean_faces = [
        {k: v for k, v in face.items() if k != "embedding"}
        for face in results.get("faces", [])
    ]

    current_metadata = {
        "objects": objects,
        "faces": clean_faces
    }

    payload_metadata = {
        "timestamp": 123456789.0,
        "narrative": "test",
        "objects": objects,
        "faces": clean_faces
    }

    payload = {
        "objects": objects,
        "faces": clean_faces,
        "narrative": "test",
        "status": "Connected",
        "qdrant_latency_ms": 0.0,
        "device": "cpu"
    }

    return current_metadata, payload_metadata, payload

if __name__ == "__main__":
    results = generate_mock_results(10, 20) # 10 faces, 20 objects

    unoptimized_time = timeit.timeit(lambda: run_unoptimized(results), number=10000)
    optimized_time = timeit.timeit(lambda: run_optimized(results), number=10000)

    print(f"Unoptimized time (10,000 runs): {unoptimized_time:.4f} seconds")
    print(f"Optimized time (10,000 runs): {optimized_time:.4f} seconds")
    print(f"Improvement: {((unoptimized_time - optimized_time) / unoptimized_time) * 100:.2f}%")
