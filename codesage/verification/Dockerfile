# Verifier image for the Module 6 sandbox (architecture.md 2.7).
# Built once by DockerBackend.ensure_image(); the patched repo is mounted at
# /workspace and the bundled scanner rules at /rules for re-scans.

FROM python:3.9-slim

RUN pip install --no-cache-dir bandit semgrep pytest httpx

# gitleaks ships as a static binary; pre-bake it so secret-rule re-scans work
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && GITLEAKS_VERSION=8.30.1 \
    && ARCH="$(dpkg --print-architecture)" \
    && curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${ARCH}.tar.gz" \
       | tar xz -C /usr/local/bin gitleaks \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
