@echo off
echo ===================================================
echo   TraumaHub - Plataforma docente de traumatologia
echo   Arranque local
echo ===================================================
echo.

echo [1/2] Levantando la base de datos PostgreSQL (Docker)...
docker compose up -d
if errorlevel 1 (
  echo.
  echo No se pudo levantar la base. Abra Docker Desktop y vuelva a intentarlo.
  pause
  exit /b 1
)

echo.
echo [2/2] Iniciando el servidor...
echo.
echo   Plataforma:  http://localhost:3000
echo   Entrar:      http://localhost:3000/entrar
echo   Panel:       http://localhost:3000/admin-panel
echo.
echo   Si es la primera vez:  http://localhost:3000/instalar
echo.
npm run dev
