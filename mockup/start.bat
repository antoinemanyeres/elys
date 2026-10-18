@echo off
rem Serves the project locally (needed for hold auto-detection) and opens the mockup.
cd /d "%~dp0.."
start "" http://localhost:8000/mockup/
python -m http.server 8000
