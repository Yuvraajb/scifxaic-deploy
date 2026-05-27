#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate

if [ "$1" == "alerts" ]; then
    python test_alerts.py
else
    python fix_channel.py
    python main.py
fi
