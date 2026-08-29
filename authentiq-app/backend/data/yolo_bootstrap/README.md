# YOLO authenticity region dataset (bootstrap)

Fine-tuned YOLO improves logo / hologram / serial detection beyond COCO defaults.
Until a custom model exists, Authentiq uses **YOLOv8n COCO proposals + heuristic ROIs**.

## Directory layout

```
data/yolo_bootstrap/
  images/
    train/
    val/
  labels/
    train/   # YOLO txt: class cx cy w h (normalized)
    val/
  classes.txt
  annotations_manifest.jsonl
```

## `classes.txt` (recommended)

```
logo
label
serial
hologram
qr
packaging
seal
text
security_mark
```

## Manual annotation workflow

1. Export vendor reference images from `static/reference_images/`.
2. Label with [Label Studio](https://labelstud.io/), CVAT, or Roboflow (YOLO export).
3. Place images under `images/train` and labels under `labels/train`.
4. Train: `yolo detect train data=data/yolo_bootstrap/dataset.yaml model=yolov8n.pt epochs=50`
5. Set `AUTHENTIQ_YOLO_MODEL=/path/to/best.pt` in `.env`.

## `annotations_manifest.jsonl` (one line per image)

```json
{"image": "images/train/sample_001.jpg", "product_id": "...", "view_type": "labels", "annotator": "vendor", "notes": "hologram upper-right"}
```

## Minimum viable dataset

- **50–100 images** per class for a pilot (mixed lighting / angles).
- Prioritize: `logo`, `label`, `serial`, `hologram`, `qr`.
- Include hard negatives (counterfeit samples) in a separate `counterfeit/` split later.

## Future pipeline

- Auto-suggest boxes from heuristic + vendor confirmation UI.
- Active learning: flag low `regional_similarity` verifications for re-labeling.
