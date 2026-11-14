@echo off
setlocal
rem Runs the command line of Speak Kit and passes its exit code on. The app is a window program with no console, so this file is what a terminal sees.
set "ELECTRON_RUN_AS_NODE=1"
set "SPEAKKIT_APP=%~dp0..\..\Speak Kit.exe"
"%SPEAKKIT_APP%" "%~dp0..\app\dist\cli\speakkit.js" %*
exit /b %errorlevel%
