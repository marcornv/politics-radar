#!/bin/sh
# Runs both halves of the Radar in one container. The AI service listens only inside the container
# (127.0.0.1), so the Host check in ia/radar_ia/main.py holds without extra configuration.
set -e

/app/ia/.venv/bin/uvicorn radar_ia.main:app --app-dir /app/ia --host 127.0.0.1 --port 8787 &

# Without summaries the site still works, so the AI service dying does not stop the container.
exec node server.js
