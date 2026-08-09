from __future__ import annotations

import json
import logging
from pathlib import Path
import tempfile
from threading import Event, Thread

from .gateway import Gateway
from .handlers import Handlers
from .models import Job, StageOutcome


logger = logging.getLogger("sky_worker")


class Worker:
    def __init__(self, gateway: Gateway, worker_id: str | None = None):
        self.gateway = gateway
        self.worker_id = worker_id or gateway.config.worker_id
        self.handlers = Handlers(gateway)

    def run_once(self) -> bool:
        job = self.gateway.lease()
        if job is None:
            return False
        context = {
            "job_id": str(job.id),
            "upload_id": str(job.upload_id) if job.upload_id else None,
            "stage": job.status,
            "attempt": job.attempts,
            "pipeline_version": job.pipeline_version,
        }
        logger.info(json.dumps({"event": "job_started", **context}))
        try:
            if not self.gateway.heartbeat(job):
                raise RuntimeError("job lease expired before processing")
            stop_heartbeat = Event()
            lease_lost = Event()

            def keep_lease_alive() -> None:
                lease_seconds = int(getattr(self.gateway.config, "lease_seconds", 300))
                interval = max(5.0, lease_seconds / 3)
                while not stop_heartbeat.wait(interval):
                    try:
                        if not self.gateway.heartbeat(job):
                            lease_lost.set()
                            return
                    except Exception:
                        lease_lost.set()
                        logger.exception(json.dumps({"event": "job_heartbeat_failed", **context}))
                        return

            heartbeat_thread = Thread(target=keep_lease_alive, name=f"heartbeat-{job.id}", daemon=True)
            heartbeat_thread.start()
            try:
                with tempfile.TemporaryDirectory(prefix=f"sky-job-{job.id}-") as temp:
                    outcome = self.handlers.handle(job, Path(temp).resolve())
            finally:
                stop_heartbeat.set()
                heartbeat_thread.join(timeout=5)
            if lease_lost.is_set():
                raise RuntimeError("job lease expired during processing")
            self.gateway.transition(job, outcome.next_status, outcome.progress, outcome.result)
            logger.info(json.dumps({"event": "job_transitioned", "next_stage": outcome.next_status, **context}))
        except (ValueError, LookupError) as error:
            try:
                self.gateway.fail(job, error.__class__.__name__.upper(), str(error), None)
            except Exception:
                logger.exception(json.dumps({"event": "job_rejection_record_failed", **context}))
            logger.warning(json.dumps({"event": "job_rejected", "error_type": error.__class__.__name__, **context}))
        except Exception as error:
            delay = min(900, 2 ** min(job.attempts, 8))
            try:
                self.gateway.fail(job, error.__class__.__name__.upper(), str(error), delay)
            except Exception:
                logger.exception(json.dumps({"event": "job_failure_record_failed", **context}))
            logger.exception(json.dumps({"event": "job_failed", "retry_seconds": delay, **context}))
        return True

    def run_forever(self, stop_event: Event | None = None) -> None:
        shutdown = stop_event or Event()
        while not shutdown.is_set():
            if not self.run_once():
                shutdown.wait(self.gateway.config.poll_seconds)
