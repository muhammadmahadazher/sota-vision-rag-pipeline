import numpy as np
import torch
from ultralytics import RTDETR
from insightface.app import FaceAnalysis
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VisionPipeline:
    def __init__(self, rtdetr_model_name: str = 'rtdetr-l.pt'):
        """
        Initializes the VisionPipeline with RT-DETR and InsightFace models.
        Attempts to target CUDA execution providers if available.
        """
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info(f"Using device: {self.device}")

        # Load RT-DETR model
        logger.info(f"Loading RT-DETR model: {rtdetr_model_name}")
        self.rtdetr = RTDETR(rtdetr_model_name)
        self.rtdetr.to(self.device)

        # Initialize InsightFace FaceAnalysis
        logger.info("Initializing InsightFace FaceAnalysis")
        providers = ['CUDAExecutionProvider', 'CPUExecutionProvider'] if self.device == 'cuda' else ['CPUExecutionProvider']
        self.face_analysis = FaceAnalysis(providers=providers)
        self.face_analysis.prepare(ctx_id=0 if self.device == 'cuda' else -1, det_size=(640, 640))

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Processes a raw BGR image frame.
        Executes object detection with RT-DETR and face localization/embedding with InsightFace.
        Returns a structured dictionary with results.
        """
        # 1. Object Detection with RT-DETR
        det_results = self.rtdetr.predict(frame, conf=0.25, verbose=False)
        objects = []
        for res in det_results:
            boxes = res.boxes.xyxy.cpu().numpy()
            scores = res.boxes.conf.cpu().numpy()
            labels = res.boxes.cls.cpu().numpy()
            names = res.names

            for box, score, label in zip(boxes, scores, labels):
                objects.append({
                    "bbox": box.tolist(),
                    "label": names[int(label)],
                    "confidence": float(score)
                })

        # 2. Face Analysis with InsightFace
        face_results = self.face_analysis.get(frame)
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

        return {
            "objects": objects,
            "faces": faces
        }
