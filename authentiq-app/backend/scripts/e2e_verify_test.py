#!/usr/bin/env python3
"""Minimal E2E API test for embedding + verify-ai flow."""

import io
import json
import os
import sys
import time
import urllib.request
import urllib.error

API = os.getenv("API_BASE", "http://127.0.0.1:8000")

# Product with reference images on disk (Kodak Printer)
TEST_QR = os.getenv("TEST_QR", "2c7fd912-5b4b-4143-857f-e307c42f85a9")


def get(path: str):
    with urllib.request.urlopen(f"{API}{path}", timeout=30) as r:
        return r.status, json.loads(r.read().decode())


def post_multipart(path: str, fields: dict, files: dict):
    import uuid

    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    for name, value in fields.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.write(f"{value}\r\n".encode())
    for name, (filename, content, ctype) in files.items():
        body.write(f"--{boundary}\r\n".encode())
        body.write(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
        )
        body.write(f"Content-Type: {ctype}\r\n\r\n".encode())
        body.write(content)
        body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        f"{API}{path}",
        data=body.getvalue(),
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"raw": raw}
        return e.code, payload


def main():
    print("=== Authentiq E2E Verify Test ===\n")

    code, health = get("/health")
    print(f"[health] {code}: ai={health.get('ai', {})}")

    code, status = get(f"/scan/{TEST_QR}/status")
    print(f"[status] {code}: embeddings_ready={status.get('embeddings_ready')}")
    products = status.get("products") or []
    if not products:
        print("FAIL: no product on QR status")
        sys.exit(1)
    product_id = products[0]["id"]
    print(f"  product_id={product_id} name={products[0].get('name')}")

    # Tiny 1x1 JPEG
    jpeg = (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c"
        b"\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c"
        b"\x1c $.\' \",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x0b\x08"
        b"\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01"
        b"\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05"
        b"\x06\x07\x08\t\n\x0b\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04"
        b"\x03\x05\x05\x04\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A"
        b"\x06\x13Qa\x07\"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br"
        b"\x82\t\n\x16\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghij"
        b"stuvwxyz\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98"
        b"\x99\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7"
        b"\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6"
        b"\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3"
        b"\xf4\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00\x00?\x00"
        b"\xfb\xd5\x7f\xff\xd9"
    )
    files = {
        "front": ("front.jpg", jpeg, "image/jpeg"),
        "back": ("back.jpg", jpeg, "image/jpeg"),
        "label": ("label.jpg", jpeg, "image/jpeg"),
    }

    print("\n[verify-ai] POST (may take 60-120s on first model load)...")
    t0 = time.time()
    code, result = post_multipart(f"/scan/{TEST_QR}/verify-ai", {}, files)
    elapsed = time.time() - t0
    print(f"  status={code} elapsed={elapsed:.1f}s")

    if code == 200:
        ai = result.get("ai_result", {})
        print(f"  SUCCESS verdict={ai.get('status')} score={ai.get('authenticity_score')}")
        print(f"  session_id={result.get('session_id')}")
        sys.exit(0)

    detail = result.get("detail", result)
    print(f"  FAIL detail={json.dumps(detail, indent=2)[:500]}")
    sys.exit(1 if code not in (422, 503) else 2)


if __name__ == "__main__":
    main()
