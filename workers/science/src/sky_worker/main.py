from __future__ import annotations

import logging

from .config import Config
from .gateway import Gateway
from .worker import Worker


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    config = Config.from_environment()
    Worker(Gateway(config)).run_forever()


if __name__ == "__main__":
    main()
