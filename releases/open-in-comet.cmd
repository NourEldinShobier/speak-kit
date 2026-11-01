@echo off
rem Opens a separate Comet window with the SpeakKit extension loaded, in its own profile, next to a running Comet.
rem The profile lives in %LOCALAPPDATA%\SpeakKit\comet-profile, so your normal Comet session, tabs and logins are untouched
rem (and not available in this window). Comet honours --load-extension when the profile directory is its own; the flag is
rem ignored when it is passed to a profile that is already open, which is why the normal profile cannot be used while Comet runs.
rem
rem Usage:  open-in-comet.cmd [path-to-unpacked-extension]
rem Default extension folder: the production build in code\apps\extension\dist (pnpm exec vp build in code\apps\extension).

setlocal
set "COMET=C:\Program Files\Perplexity\Comet\Application\comet.exe"
set "EXT=%~1"
if "%EXT%"=="" set "EXT=%~dp0..\code\apps\extension\dist"
set "PROFILE=%LOCALAPPDATA%\SpeakKit\comet-profile"

if not exist "%COMET%" (
  echo Comet was not found at "%COMET%".
  exit /b 1
)
if not exist "%EXT%\manifest.json" (
  echo No extension build in "%EXT%". Run: pnpm exec vp build   in code\apps\extension
  exit /b 1
)

start "" "%COMET%" --user-data-dir="%PROFILE%" --load-extension="%EXT%" --no-first-run --no-default-browser-check
echo Started a separate Comet window with SpeakKit loaded from "%EXT%".
echo Pair it in the extension options (chrome://extensions, SpeakKit, Details, Extension options) with the token shown in the SpeakKit app.
endlocal
