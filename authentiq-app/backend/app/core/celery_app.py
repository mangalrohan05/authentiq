import os
from celery import Celery

# Read Redis configuration from environment or fallback to localhost
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Initialize Celery app instance
celery_app = Celery(
    "authentiq",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.embedding_tasks"]
)

# Configure Celery execution settings
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    result_expires=1800, # Clean task results cache after 30 minutes
    broker_connection_timeout=2.0,
    broker_connection_retry=False,
    broker_connection_retry_on_startup=False,
    broker_transport_options={
        'max_retries': 1,
        'interval_start': 0.2,
        'interval_step': 0.2,
        'interval_max': 0.5,
        'socket_timeout': 2.0,
        'socket_connect_timeout': 2.0,
    },
    result_backend_transport_options={
        'retry_policy': {
            'timeout': 2.0,
            'max_retries': 1,
            'interval_start': 0.1,
            'interval_step': 0.1,
            'interval_max': 0.2,
        }
    },
    redis_backend_transport_options={
        'socket_timeout': 2.0,
        'socket_connect_timeout': 2.0,
        'retry_policy': {
            'timeout': 2.0,
            'max_retries': 1,
            'interval_start': 0.1,
            'interval_step': 0.1,
            'interval_max': 0.2,
        }
    }
)
