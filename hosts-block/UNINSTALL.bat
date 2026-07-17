@echo off
rem Zdjecie blokady - wymaga hasla ustawionego przy instalacji.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-block.ps1"
