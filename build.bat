@echo off
chcp 65001 > nul
echo ========================================================
echo   「ネットレスPDF」自動リビルドスクリプト
echo ========================================================
echo.

cd /d "%~dp0app"

echo [1/3] 自動テストを実行中...
call npm test
if %errorlevel% neq 0 (
    echo.
    echo 【エラー】自動テストが失敗しました。リビルドを中断します。
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] TypeScript 型チェックを実行中...
call npx tsc --noEmit
if %errorlevel% neq 0 (
    echo.
    echo 【エラー】型チェックでエラーが検出されました。リビルドを中断します。
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Windows アプリ (exe) をビルド中...
call npx tauri build
if %errorlevel% neq 0 (
    echo.
    echo 【エラー】Tauri アプリのビルドに失敗しました。
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo   ビルドが正常に完了しました！
echo   生成された exe ファイルの場所:
echo   %~dp0app\src-tauri\target\release\bundle\nsis\
echo ========================================================
echo.
pause
