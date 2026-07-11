import unittest
from unittest.mock import patch, MagicMock
import numpy as np
from app.core.inference import VisionPipeline

class TestVisionPipeline(unittest.TestCase):
    @patch('app.core.inference.YOLOWorld')
    @patch('app.core.inference.FaceAnalysis')
    def test_process_frame(self, MockFaceAnalysis, MockYOLOWorld):
        # Setup mock for YOLOWorld
        mock_yoloworld_instance = MagicMock()
        MockYOLOWorld.return_value = mock_yoloworld_instance

        # Setup dummy results for YOLOWorld
        mock_det_res = MagicMock()
        mock_det_res.boxes.xyxy.cpu.return_value.numpy.return_value = np.array([[10, 20, 100, 200]])
        mock_det_res.boxes.conf.cpu.return_value.numpy.return_value = np.array([0.95])
        mock_det_res.boxes.cls.cpu.return_value.numpy.return_value = np.array([0])
        mock_det_res.names = {0: "person"}
        mock_yoloworld_instance.predict.return_value = [mock_det_res]
        mock_yoloworld_instance.to = MagicMock()
        mock_yoloworld_instance.set_classes = MagicMock()

        # Setup mock for FaceAnalysis
        mock_face_analysis_instance = MagicMock()
        MockFaceAnalysis.return_value = mock_face_analysis_instance

        # Setup dummy results for FaceAnalysis
        mock_face = MagicMock()
        mock_face.bbox = np.array([15, 25, 95, 195])
        mock_face.det_score = 0.99
        mock_face.embedding = np.random.rand(512)
        mock_face.landmark_2d_106 = np.random.rand(106, 2)
        mock_face.gender = 1
        mock_face.age = 28
        mock_face_analysis_instance.get.return_value = [mock_face]

        # Initialize the pipeline (mocks will be injected)
        pipeline = VisionPipeline()

        # Create a dummy frame
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        # Call process_frame
        result = pipeline.process_frame(dummy_frame)

        # Verify YOLOWorld was called correctly
        mock_yoloworld_instance.predict.assert_called_once_with(dummy_frame, conf=0.25, verbose=False)

        # Verify FaceAnalysis was called correctly
        mock_face_analysis_instance.get.assert_called_once_with(dummy_frame)

        # Verify the output structure and values
        self.assertIn("objects", result)
        self.assertIn("faces", result)

        self.assertEqual(len(result["objects"]), 1)
        obj = result["objects"][0]
        self.assertEqual(obj["bbox"], [10, 20, 100, 200])
        self.assertEqual(obj["label"], "person")
        self.assertAlmostEqual(obj["confidence"], 0.95)

        self.assertEqual(len(result["faces"]), 1)
        face = result["faces"][0]
        self.assertEqual(face["bbox"], [15.0, 25.0, 95.0, 195.0])
        self.assertAlmostEqual(face["confidence"], 0.99)
        self.assertEqual(len(face["embedding"]), 512)
        self.assertEqual(len(face["landmarks"]), 106)
        self.assertEqual(face["gender"], 1)
        self.assertEqual(face["age"], 28)

    @patch('app.core.inference.YOLOWorld')
    @patch('app.core.inference.FaceAnalysis')
    def test_process_frame_missing_face_attributes(self, MockFaceAnalysis, MockYOLOWorld):
        """Test processing when face embedding or landmarks are None (e.g. failed to compute)"""
        # Setup mocks
        mock_yoloworld_instance = MagicMock()
        MockYOLOWorld.return_value = mock_yoloworld_instance
        mock_yoloworld_instance.predict.return_value = [] # No objects
        mock_yoloworld_instance.to = MagicMock()
        mock_yoloworld_instance.set_classes = MagicMock()

        mock_face_analysis_instance = MagicMock()
        MockFaceAnalysis.return_value = mock_face_analysis_instance

        # Face with None embedding and landmarks
        mock_face = MagicMock()
        mock_face.bbox = np.array([0, 0, 10, 10])
        mock_face.det_score = 0.5
        mock_face.embedding = None
        mock_face.landmark_2d_106 = None
        mock_face.gender = 0
        mock_face.age = 20
        mock_face_analysis_instance.get.return_value = [mock_face]

        pipeline = VisionPipeline()
        dummy_frame = np.zeros((10, 10, 3), dtype=np.uint8)
        result = pipeline.process_frame(dummy_frame)

        self.assertEqual(len(result["faces"]), 1)
        self.assertIsNone(result["faces"][0]["embedding"])
        self.assertIsNone(result["faces"][0]["landmarks"])

if __name__ == '__main__':
    unittest.main()
