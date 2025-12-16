@echo off
REM EUTLAS Repository Cleanup - Batch Script Alternative
REM This is a simple wrapper for the PowerShell script

echo.
echo ========================================
echo   EUTLAS Repository Cleanup
echo ========================================
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: PowerShell is not available.
    echo Please install PowerShell or use Git Bash.
    pause
    exit /b 1
)

REM Run the PowerShell script
powershell.exe -ExecutionPolicy Bypass -File "%~dp0clean-repo.ps1"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Cleanup completed successfully!
) else (
    echo.
    echo Cleanup failed. Please check the errors above.
)

pause

