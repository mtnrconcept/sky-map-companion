from __future__ import annotations

import logging
import signal
from threading import Event

from .config import Config
from .gateway import Gateway
from .worker import Worker


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    config = Config.from_environment()
    shutdown = Event()

    def request_shutdown(signum: int, _frame: object) -> None:
        logging.getLogger("sky_worker").info(
            '{"event":"worker_shutdown_requested","signal":%d}', signum
        )
        shutdown.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)
    Worker(Gateway(config)).run_forever(shutdown)


if __name__ == "__main__":
    main()
