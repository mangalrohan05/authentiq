"""
WebSocket Connection Manager for Authentiq.

Tracks all active WebSocket connections and provides a broadcast
mechanism to push events to all connected dashboard clients.
"""

import logging
from typing import List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts messages."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WS client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Remove a disconnected WebSocket from the registry."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WS client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """
        Broadcast a JSON message to all active connections.
        Removes stale connections silently on send failure.
        """
        if not self.active_connections:
            return

        stale = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)

        for conn in stale:
            self.disconnect(conn)


# Singleton instance shared across all route modules
manager = ConnectionManager()
