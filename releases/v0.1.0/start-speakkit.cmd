@echo off
rem Starts the SpeakKit desktop app (engine + local server). Needs Node 24+ and pnpm; run `pnpm install` once in ..\..\code first.
cd /d "%~dp0..\..\code\apps\desktop"
call pnpm exec electron .
