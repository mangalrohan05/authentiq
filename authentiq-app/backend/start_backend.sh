#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
source venv/bin/activate
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
