@echo off
setlocal

if "%~1"=="" (
  echo Usage: hh-import.cmd ^<inputDir^> [importedDir]
  exit /b 1
)

set "INPUT_DIR=%~1"
set "IMPORTED_DIR=%~2"

if "%IMPORTED_DIR%"=="" set "IMPORTED_DIR=%INPUT_DIR%\imported"

node "%~dp0scripts\hh-folder-import-cli.mjs" --input "%INPUT_DIR%" --imported "%IMPORTED_DIR%"
