import os
import yaml
import numpy as np
import torch
import ultralytics
from ultralytics import YOLOWorld
from insightface.app import FaceAnalysis
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VisionPipeline:
    def __init__(self, model_name: str = 'yolov8s-worldv2.pt'):
        """
        Initializes the VisionPipeline with YOLO-World pre-trained on Objects365 vocabulary
        and InsightFace FaceAnalysis with hardware execution fallback lifecycles.
        """
        # Load Objects365 class names list from Ultralytics cfg
        try:
            path = os.path.join(os.path.dirname(ultralytics.__file__), 'cfg', 'datasets', 'Objects365.yaml')
            with open(path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f)
            class_names = list(data['names'].values())
            logger.info(f"Loaded {len(class_names)} classes from Objects365 dataset YAML.")
        except (OSError, yaml.YAMLError) as e:
            logger.warning(f"Could not load Objects365 class names list: {e}. Using default COCO vocabulary.")
            class_names = None

        # 1. Load YOLO-World model with hardware fallback
        try:
            if torch.cuda.is_available():
                self.device = 'cuda'
                logger.info("Attempting CUDA device mount for YOLO-World detector...")
                self.rtdetr = YOLOWorld(model_name)
                self.rtdetr.to(self.device)
                logger.info("YOLO-World successfully mounted on CUDA GPU.")
            else:
                raise RuntimeError("CUDA is not available on this host.")
        except Exception as e:
            logger.warning(f"CUDA initialization failed for detector: {e}. Falling back to CPU.")
            self.device = 'cpu'
            self.rtdetr = YOLOWorld(model_name)
            self.rtdetr.to('cpu')

        # Set vocabulary classes
        if class_names:
            try:
                self.rtdetr.set_classes(class_names)
                logger.info("Successfully set YOLO-World classes to Objects365 vocabulary.")
            except Exception as e:
                logger.error(f"Error setting classes on YOLO-World: {e}")

        # 2. Initialize InsightFace FaceAnalysis with hardware fallback
        try:
            if self.device == 'cuda':
                logger.info("Attempting CUDAExecutionProvider mount for FaceAnalysis...")
                self.face_analysis = FaceAnalysis(providers=['CUDAExecutionProvider'])
                self.face_analysis.prepare(ctx_id=0, det_size=(640, 640))
                logger.info("FaceAnalysis successfully mounted on CUDA Execution Provider.")
            else:
                raise RuntimeError("Device is CPU, skipping CUDAExecutionProvider.")
        except Exception as e:
            logger.warning(f"CUDA execution provider failed for FaceAnalysis: {e}. Falling back to CPUExecutionProvider.")
            self.face_analysis = FaceAnalysis(providers=['CPUExecutionProvider'])
            self.face_analysis.prepare(ctx_id=-1, det_size=(640, 640))

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Processes a raw BGR image frame.
        Executes object detection with YOLO-World and face localization/embedding with InsightFace.
        Returns a structured dictionary with results.
        """
        # 1. Object Detection with YOLO-World
        det_results = self.rtdetr.predict(frame, conf=0.25, verbose=False)
        objects = []
        for res in det_results:
            boxes = res.boxes.xyxy.cpu().numpy()
            scores = res.boxes.conf.cpu().numpy()
            labels = res.boxes.cls.cpu().numpy()
            names = res.names

            objects.extend({
                "bbox": box.tolist(),
                "label": names[int(label)],
                "confidence": float(score)
            } for box, score, label in zip(boxes, scores, labels))

        # 2. Face Analysis with InsightFace
        face_results = self.face_analysis.get(frame)
        faces = [{
            "bbox": face.bbox.tolist(),
            "confidence": float(face.det_score),
            "embedding": face.embedding.tolist() if face.embedding is not None else None,
            "landmarks": face.landmark_2d_106.tolist() if face.landmark_2d_106 is not None else None,
            "gender": int(face.gender),
            "age": int(face.age)
        } for face in face_results]

        return {
            "objects": objects,
            "faces": faces
        }
