import os
import cv2
import numpy as np
from unittest.mock import patch
from app.services.image_quality import validate_customer_image_bytes

def create_test_image(width=400, height=400, color=(128, 128, 128), text=None, blur_kernel=None, glare=False, high_contrast=True):
    img = np.zeros((height, width, 3), dtype=np.uint8)
    if high_contrast:
        # Half dark gray, half light gray to create high contrast
        img[:, :width//2] = (60, 60, 60)
        img[:, width//2:] = (190, 190, 190)
    else:
        img[:] = color
    if text:
        cv2.putText(img, text, (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    if glare:
        # Create a specular glare hotspot
        cv2.circle(img, (200, 200), 120, (255, 255, 255), -1)
    if blur_kernel:
        img = cv2.GaussianBlur(img, blur_kernel, 0)
    
    _, buffer = cv2.imencode(".png", img)
    return buffer.tobytes()

def test_quality_gate():
    print("=== Testing Image Quality Gate ===")
    
    # 1. Test clean, valid image (mocking YOLO product detection)
    clean_bytes = create_test_image(color=(128, 128, 128), text="Authentiq Product")
    mock_boxes = [{"region_type": "packaging", "bbox": [50, 50, 350, 350], "confidence": 0.95, "class_name": "bottle"}]
    
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(clean_bytes, image_type="front")
        print(f"Clean image: passed={res['passed']}, scoring={res['scoring']}")
        assert res["passed"] is True, "Clean image should pass"
        assert res["scoring"]["overall_quality"] >= 0.60
    
    # 2. Test blurry image
    blurry_bytes = create_test_image(color=(128, 128, 128), text="Authentiq Product", blur_kernel=(21, 21))
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(blurry_bytes, image_type="front")
        print(f"Blurry image: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is False, "Blurry image should fail"
        assert "blurry" in res["quality_flags"]

    # 3. Test dark image
    dark_bytes = create_test_image(color=(5, 5, 5), high_contrast=False)
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(dark_bytes, image_type="front")
        print(f"Dark image: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is False, "Dark image should fail"
        assert "too_dark" in res["quality_flags"]

    # 4. Test low resolution image
    small_bytes = create_test_image(width=100, height=100, high_contrast=False)
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(small_bytes, image_type="front")
        print(f"Small image: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is False, "Genuinely tiny image should fail"
        # Below the hard-min floor is now 'too_tiny'; 'too_small' is advisory (audit 1.12).
        assert "too_tiny" in res["quality_flags"]

    # 5. Test product not visible (should pass as soft warning)
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=([], {})):
        res = validate_customer_image_bytes(clean_bytes, image_type="front")
        print(f"Not visible: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is True, "Product not visible should pass as soft warning"
        assert "product_not_visible" in res["quality_flags"]

    # 6. Test product clipped at borders
    mock_clipped_boxes = [{"region_type": "packaging", "bbox": [2, 50, 350, 350], "confidence": 0.95, "class_name": "bottle"}]
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_clipped_boxes, {})):
        res = validate_customer_image_bytes(clean_bytes, image_type="front")
        print(f"Clipped: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is True, "Clipped product should be accepted as soft warning"
        assert "product_clipped" in res["quality_flags"]

    # 7. Test occlusion (hand overlapping, should pass as soft warning if occlusion <= 35%)
    mock_occlusion_boxes = [
        {"region_type": "packaging", "bbox": [50, 50, 350, 350], "confidence": 0.95, "class_name": "bottle"},
        {"region_type": "person", "bbox": [50, 50, 250, 250], "confidence": 0.85, "class_name": "person"}
    ]
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_occlusion_boxes, {})):
        res = validate_customer_image_bytes(clean_bytes, image_type="front")
        print(f"Occluded: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is True, "Occluded product should pass as soft warning"
        assert "occluded" in res["quality_flags"]


    # 8. Ordinary glare is advisory now, not a hard reject (audit 1.12). Only
    # EXTREME glare (> QUALITY_EXTREME_GLARE_RATIO, default 0.35) rejects; ordinary
    # phone-photo glare passes with a soft 'excessive_glare' flag + reshoot guidance.
    glare_bytes = create_test_image(color=(128, 128, 128), text="Authentiq Product", glare=True)
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(glare_bytes, image_type="front")
        print(f"Glare image: passed={res['passed']}, flags={res['quality_flags']}, reshoot={res['reshoot_instructions']}")
        assert res["passed"] is True, "Ordinary glare should pass as a soft warning"
        assert "excessive_glare" in res["quality_flags"]


    # 9. Test slightly blurred but usable image (must pass)
    usable_blur_bytes = create_test_image(color=(128, 128, 128), text="Authentiq Product", blur_kernel=(7, 7))
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(usable_blur_bytes, image_type="front")
        print(f"Slightly blurry: passed={res['passed']}, flags={res['quality_flags']}")
        assert res["passed"] is True, "Slightly blurry image should pass"
        assert "blurry" in res["quality_flags"]

    # 10. Test extremely bright/overexposed image (must fail)
    bright_bytes = create_test_image(color=(254, 254, 254), high_contrast=False)
    with patch("app.services.yolo_service.detect_raw_boxes", return_value=(mock_boxes, {})):
        res = validate_customer_image_bytes(bright_bytes, image_type="front")
        print(f"Bright image: passed={res['passed']}, flags={res['quality_flags']}")
        assert res["passed"] is False, "Extremely bright image should fail"
        assert "extreme_overexposed" in res["quality_flags"]

    print("[OK] All Image Quality Gate Tests Passed successfully!")

if __name__ == "__main__":
    test_quality_gate()

