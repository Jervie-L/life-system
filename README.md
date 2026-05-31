# 人生系统

开源的个人管理应用，包含总看板、每日打卡、自控、存钱、身体、事业、日历待办、笔记和复盘模块。

Web 本地开发模式使用 React + SQLite。PWA、iOS 和 Android App 默认将数据保存在设备本地，不依赖远程后端。

## 隐私

- 仓库不包含任何用户数据库、日志、密钥或环境变量文件。
- 本地数据库默认位于 `data/life_system.sqlite3`，已通过 `.gitignore` 排除。
- PWA 与移动 App 的本地数据保存在浏览器或 App 沙盒中。

## 启动

推荐一键启动：

```powershell
.\start.ps1
```

也可以手动启动后端：

```powershell
python backend\server.py
```

再启动前端：

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
```

打开：

```text
http://127.0.0.1:5173
```

数据库文件：

```text
life-web\data\life_system.sqlite3
```

## iOS App

本项目已加入 Capacitor iOS 工程。App Store 发布准备和 macOS 构建步骤见：

```text
APP_STORE_RELEASE.md
```

## Android App

安装依赖并生成 Android 工程：

```powershell
npm install
npm run build:android
```

构建可直接安装的调试 APK：

```powershell
cd android
.\gradlew.bat assembleDebug
```

APK 输出位置：

```text
android\app\build\outputs\apk\debug\app-debug.apk
```
