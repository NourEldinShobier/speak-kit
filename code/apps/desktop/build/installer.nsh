; Custom NSIS steps, included through nsis.include in electron-builder.yml.
;
; On uninstall (not when the installer replaces an older version: ${isUpdated}) this removes what Speak Kit downloaded or generated and
; can fetch again: the voice model, audio exports and the OCR language data. It keeps the library,
; settings and pairing token. The names repeat DOWNLOAD_ENTRIES in src/shared/app-data.ts; src/shared/app-data.test.ts keeps them in step.

!macro skRemoveDownload ROOT NAME
  ${if} ${FileExists} "${ROOT}\${NAME}\*.*"
    RMDir /r "${ROOT}\${NAME}"
    ${if} ${FileExists} "${ROOT}\${NAME}\*.*"
      DetailPrint "Could not remove ${NAME}: a file is in use. Delete ${ROOT}\${NAME} yourself."
    ${else}
      DetailPrint "Removed ${NAME}."
    ${endIf}
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Electron keeps per-user data under %APPDATA% even for an all-users install. SPEAKKIT_USER_DATA moves it (tests, portable setups).
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endIf}
    ReadEnvStr $R8 SPEAKKIT_USER_DATA
    ${if} $R8 == ""
      StrCpy $R8 "$APPDATA\@speakkit\desktop"
    ${endIf}

    DetailPrint "Removing the voice model Speak Kit downloaded."
    !insertmacro skRemoveDownload "$R8" "models"
    !insertmacro skRemoveDownload "$R8" "exports"
    !insertmacro skRemoveDownload "$R8" "IndexedDB"
    DetailPrint "Kept your library and settings in $R8."

    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
  ${endIf}
!macroend
