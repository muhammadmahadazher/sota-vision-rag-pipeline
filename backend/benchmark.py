import timeit
import numpy as np

# Mocking the face object structure
class MockFace:
    def __init__(self):
        self.bbox = np.random.rand(4)
        self.det_score = np.random.rand()
        self.embedding = np.random.rand(512)
        self.landmark_2d_106 = np.random.rand(106, 2)
        self.gender = 1
        self.age = 25

def benchmark_append(face_results):
    faces = []
    for face in face_results:
        faces.append({
            "bbox": face.bbox.tolist(),
            "confidence": float(face.det_score),
            "embedding": face.embedding.tolist() if face.embedding is not None else None,
            "landmarks": face.landmark_2d_106.tolist() if face.landmark_2d_106 is not None else None,
            "gender": int(face.gender),
            "age": int(face.age)
        })
    return faces

def benchmark_list_comp(face_results):
    return [{
        "bbox": face.bbox.tolist(),
        "confidence": float(face.det_score),
        "embedding": face.embedding.tolist() if face.embedding is not None else None,
        "landmarks": face.landmark_2d_106.tolist() if face.landmark_2d_106 is not None else None,
        "gender": int(face.gender),
        "age": int(face.age)
    } for face in face_results]

if __name__ == '__main__':
    # Generate mock data
    face_results = [MockFace() for _ in range(100)] # 100 faces per frame for testing

    # Measure append
    time_append = timeit.timeit(lambda: benchmark_append(face_results), number=1000)
    print(f"Append Loop: {time_append:.6f} seconds")

    # Measure list comprehension
    time_list_comp = timeit.timeit(lambda: benchmark_list_comp(face_results), number=1000)
    print(f"List Comprehension: {time_list_comp:.6f} seconds")

    improvement = (time_append - time_list_comp) / time_append * 100
    print(f"Improvement: {improvement:.2f}%")
