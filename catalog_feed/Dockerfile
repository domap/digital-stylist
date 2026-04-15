# Standalone catalog indexer: install digital-stylist (shared config + Chroma) then this package.
# Build from repository root: docker build -f catalog_feed/Dockerfile .
FROM python:3.13-slim-bookworm

WORKDIR /packages

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY pyproject.toml /packages/digital-stylist/
COPY digital_stylist /packages/digital-stylist/digital_stylist/
RUN pip install --upgrade pip && pip install /packages/digital-stylist

COPY catalog_feed /packages/stylist-catalog-feed
RUN pip install /packages/stylist-catalog-feed

ENV CHROMA_PERSIST_DIR=/app/chroma_data

WORKDIR /app

ENTRYPOINT ["digital-stylist-catalog-feed"]
CMD ["--help"]
