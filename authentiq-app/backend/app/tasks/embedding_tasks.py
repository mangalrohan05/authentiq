import asyncio
import logging
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(name="app.tasks.embedding_tasks.process_product_embeddings_task")
def process_product_embeddings_task(product_id: str) -> dict:
    """
    Background Celery task to generate embeddings for a product's reference images.
    """
    logger.info(f"[Celery Worker] Started embedding job for product_id={product_id}")
    
    # Deferred imports to avoid loading PyTorch / Singletons in the main process thread before Celery is ready
    from app.services.embedding_jobs import process_product_pending_embeddings
    import nest_asyncio
    
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    nest_asyncio.apply()
    
    try:
        # Run the async pending embeddings job to completion
        stats = loop.run_until_complete(process_product_pending_embeddings(product_id))
        logger.info(f"[Celery Worker] Completed embedding job for product_id={product_id}. Stats: {stats}")
        return stats
    except Exception as e:
        logger.error(f"[Celery Worker] Error processing embeddings for product_id={product_id}: {e}", exc_info=True)
        return {"success": 0, "failed": 1, "skipped": 0, "error": str(e)}
