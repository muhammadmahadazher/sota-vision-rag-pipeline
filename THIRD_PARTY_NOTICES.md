# Third-party browser assets

The hosted demo includes a pinned browser runtime and detector so object detection does not depend on a runtime CDN:

- Transformers.js 3.8.1 browser runtime and ONNX Runtime Web assets, Apache-2.0. Source: https://github.com/huggingface/transformers.js/tree/3.8.1
- `onnx-community/rfdetr_nano-ONNX` q8 ONNX weights at revision `eae21cee0687a91bcf9fa071605c48d7705d2d91`, Apache-2.0. The q8 detector graph is bundled with this repository. Source: https://huggingface.co/onnx-community/rfdetr_nano-ONNX/tree/eae21cee0687a91bcf9fa071605c48d7705d2d91

The optional browser narrator downloads and caches its pinned model files on first use:

- `onnx-community/Florence-2-base-ft` mixed-precision ONNX weights at revision `e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f`, MIT. Source: https://huggingface.co/onnx-community/Florence-2-base-ft/tree/e88a44eaf3791a35eae0c5a47b3dbcd36e67eb6f

The project license does not replace the licenses or notices of these third-party components.