"""SSE event bus for streaming document processing progress."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict


class EventBus:
    def __init__(self) -> None:
        self._subscribers: Dict[str, list[asyncio.Queue]] = {}
        self._history: Dict[str, list[dict]] = {}

    def subscribe(self, invoice_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        if invoice_id not in self._subscribers:
            self._subscribers[invoice_id] = []
        self._subscribers[invoice_id].append(queue)
        return queue

    def unsubscribe(self, invoice_id: str, queue: asyncio.Queue) -> None:
        if invoice_id in self._subscribers:
            if queue in self._subscribers[invoice_id]:
                self._subscribers[invoice_id].remove(queue)
            if not self._subscribers[invoice_id]:
                del self._subscribers[invoice_id]

    def get_history(self, invoice_id: str) -> list[dict]:
        return self._history.get(invoice_id, [])

    async def emit(
        self,
        invoice_id: str,
        stage: str,
        status: str,
        message: str,
        progress: float = 0.0,
        extra: Any = None,
    ) -> None:
        payload = {
            "invoice_id": invoice_id,
            "stage": stage,
            "status": status,
            "message": message,
            "progress": round(progress, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "extra": extra,
        }
        if invoice_id not in self._history:
            self._history[invoice_id] = []
        self._history[invoice_id].append(payload)

        if invoice_id in self._subscribers:
            for q in list(self._subscribers[invoice_id]):
                await q.put(payload)

    async def event_generator(self, invoice_id: str, request: Any = None) -> AsyncGenerator[dict, None]:
        queue = self.subscribe(invoice_id)
        history = self.get_history(invoice_id)
        try:
            yield {
                "event": "connected",
                "data": json.dumps({"invoice_id": invoice_id, "message": "Subscribed to pipeline events"}),
            }

            is_terminal = False
            for data in history:
                yield {
                    "event": "stage_event",
                    "data": json.dumps(data)
                }
                if data.get("stage") == "analyze" and data.get("status") in {"completed", "failed"}:
                    is_terminal = True

            if is_terminal:
                return

            while True:
                if request and await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield {
                        "event": "stage_event",
                        "data": json.dumps(data)
                    }
                    if data.get("stage") == "analyze" and data.get("status") in {"completed", "failed"}:
                        break
                except asyncio.TimeoutError:
                    yield {
                        "event": "ping",
                        "data": "keep-alive"
                    }
        finally:
            self.unsubscribe(invoice_id, queue)


event_bus = EventBus()
