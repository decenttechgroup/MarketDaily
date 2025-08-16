@echo off
echo ========================================
echo       市场日报 - Market Daily
echo ========================================
echo.

echo 正在检查Node.js环境...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未检测到Node.js，请先安装Node.js 16+
    pause
    exit /b 1
)

echo 正在安装后端依赖...
call npm install
if %errorlevel% neq 0 (
    echo 错误: 后端依赖安装失败
    pause
    exit /b 1
)

echo 正在安装前端依赖...
cd client
call npm install
if %errorlevel% neq 0 (
    echo 错误: 前端依赖安装失败
    pause
    exit /b 1
)
cd ..

echo 正在构建前端应用...
cd client
call npm run build
if %errorlevel% neq 0 (
    echo 错误: 前端构建失败
    pause
    exit /b 1
)
cd ..

echo 正在检查配置文件...
if not exist .env (
    echo 正在创建配置文件...
    copy .env.example .env
    echo 请编辑 .env 文件配置必要的参数
)

echo.
echo ========================================
echo 安装完成！现在可以启动应用:
echo   npm start       - 生产模式
echo   npm run dev     - 开发模式
echo.
echo 默认访问地址: http://localhost:3000
echo 默认管理员账户: admin@example.com / admin123
echo ========================================
echo.
pause
