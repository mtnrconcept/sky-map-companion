from __future__ import annotations

from .config import Config
from .gateway import Gateway


def main() -> None:
    gateway = Gateway(Config.from_environment())
    gateway.execute("select 1 as healthy")


if __name__ == "__main__":
    main()
