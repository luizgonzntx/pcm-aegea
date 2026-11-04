"""Verify that Cloudflare serves this checkout's build, without authentication."""
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BUILD = Path(__file__).resolve().parent.parent / "dist"
FILES = ("index.html", "app.js", "inventory.js", "ui.js", "style.css")
TARGETS = ["https://pcm-aegea-teresina.pages.dev"]
if os.environ.get("DEPLOYMENT_URL"):
    deployment = os.environ["DEPLOYMENT_URL"].rstrip("/")
    parsed = urllib.parse.urlsplit(deployment)
    if parsed.scheme != "https" or not (parsed.hostname or "").endswith(".pcm-aegea-teresina.pages.dev"):
        raise SystemExit("Unexpected Cloudflare deployment URL; refusing to verify another project.")
    TARGETS.insert(0, deployment)
revision = urllib.parse.quote(os.environ.get("GITHUB_SHA", "verify"), safe="")
for target in dict.fromkeys(TARGETS):
    for attempt in range(12):
        try:
            for filename in FILES:
                path = "" if filename == "index.html" else filename
                request = urllib.request.Request(
                    f"{target}/{path}?revision={revision}",
                    headers={"Cache-Control": "no-cache"},
                )
                with urllib.request.urlopen(request, timeout=20) as response:
                    if response.read() != (BUILD / filename).read_bytes():
                        raise ValueError(f"{filename}: published content differs from this build")
            print(f"Verified current dashboard build: {target}")
            break
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            if attempt == 11:
                raise SystemExit(f"Cloudflare verification failed: {target}: {error}") from error
            print(f"Waiting for Cloudflare publication ({attempt + 1}/12): {error}", flush=True)
            time.sleep(10)
