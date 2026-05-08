#!/bin/zsh
cd "$(dirname "$0")"
echo "StudyBridge is running at:"
echo "http://127.0.0.1:5173"
echo ""
echo "Keep this window open while using StudyBridge."
python3 -m http.server 5173 --bind 127.0.0.1
