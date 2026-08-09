ARG PYTHON_IMAGE=python:3.12.13-slim-bookworm
FROM ${PYTHON_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TMPDIR=/var/data/tmp

RUN mkdir -p /var/data/tmp \
    && sed -i 's/^Components: main$/Components: main contrib/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        astrometry.net \
        astrometry-data-2mass-04 \
        astrometry-data-2mass-05 \
        astrometry-data-2mass-06 \
        astrometry-data-2mass-07 \
        astrometry-data-2mass-08-19 \
        ca-certificates \
        curl \
        libraw-bin \
    && test -n "$(find /usr/share/astrometry -type f -name 'index-*.fits' -print -quit)" \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system skyworker \
    && useradd --system --gid skyworker --home-dir /app skyworker \
    && chown -R skyworker:skyworker /var/data

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN python -m pip install .

USER skyworker
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -m sky_worker.healthcheck
ENTRYPOINT ["sky-science-worker"]
