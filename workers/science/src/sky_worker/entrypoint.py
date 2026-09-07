from __future__ import annotations

import logging
import os
import signal
from threading import Event

from .main import main as daemon_main


logger = logging.getLogger("sky_worker")


def run_daemon() -> None:
    daemon_main()


def run_container_host() -> None:
    shutdown = Event()

    def request_shutdown(signum: int, _frame: object) -> None:
        logger.info(
            '{"event":"container_host_shutdown_requested","signal":%d}',
            signum,
        )
        shutdown.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)
    logger.info('{"event":"container_host_ready"}')
    shutdown.wait()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    mode = os.environ.get("WORKER_MODE", "daemon").strip().lower() or "daemon"
    if mode == "daemon":
        run_daemon()
        return 0
    if mode == "container-host":
        run_container_host()
        return 0
    raise RuntimeError("WORKER_MODE must be daemon or container-host")


if __name__ == "__main__":
    raise SystemExit(main())
