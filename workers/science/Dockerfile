ARG PYTHON_IMAGE=python:3.12.13-slim-bookworm
FROM ${PYTHON_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends astrometry.net ca-certificates curl libraw-bin \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system skyworker \
    && useradd --system --gid skyworker --home-dir /app skyworker

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN python -m pip install .

USER skyworker
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -m sky_worker.healthcheck
ENTRYPOINT ["sky-science-worker"]
