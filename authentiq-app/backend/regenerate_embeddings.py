"""
Regenerate embeddings for all products with reference images missing vectors.

Run from the backend directory:
    python3 regenerate_embeddings.py
"""

import os
import sys
import asyncio
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from app.core.db import products_collection
from app.services.embedding_jobs import (
    process_product_pending_embeddings,
    summarize_embeddings,
)
from app.services.openclip_service import get_model_singleton


async def regenerate():
    singleton = get_model_singleton()
    if not singleton.ensure_loaded():
        print(f"ERROR: OpenCLIP failed to load: {singleton._load_error}")
        sys.exit(1)

    # Include archived products — issued QR codes may still reference them.
    all_products = list(products_collection.find({}))
    print(f"Found {len(all_products)} products (including archived)")

    success_count = 0
    fail_count = 0

    for product in all_products:
        product_id = product.get("id")
        name = product.get("name", "?")
        images = product.get("reference_images", [])
        if not images:
            continue

        pending = [
            img
            for img in images
            if not img.get("embedding_cached") or not img.get("embedding_vector")
        ]
        if not pending:
            print(f"  [{name}] All images already embedded — skip")
            continue

        print(f"\n[{name}] Processing {len(pending)} image(s)...")
        stats = await process_product_pending_embeddings(product_id)
        success_count += stats.get("success", 0)
        fail_count += stats.get("failed", 0)

        fresh = products_collection.find_one({"id": product_id})
        if fresh:
            summary = summarize_embeddings(fresh.get("reference_images", []))
            products_collection.update_one(
                {"id": product_id},
                {"$set": {**summary, "updated_at": datetime.utcnow()}},
            )
            print(f"  => Status: {summary['embeddings_status']}")

    print(
        f"\nDone. {success_count} generated, {fail_count} failed."
    )


if __name__ == "__main__":
    asyncio.run(regenerate())
