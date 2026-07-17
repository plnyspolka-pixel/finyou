@echo off
rem Autoinstaler blokady domen - podwojne klikniecie wystarczy.
rem Skrypt PowerShell sam poprosi o uprawnienia administratora (okno UAC).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-block.ps1"
