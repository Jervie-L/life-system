# 无 Mac 安装到 iPhone

不使用 App Store 和 Xcode 时，可以将本项目作为 PWA 安装到 iPhone 主屏幕。PWA 版默认将数据保存在当前设备，不依赖 Python 后端。

## 构建

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build:pwa
```

将生成的 `dist` 文件夹部署到任意 HTTPS 静态网站托管服务。不要直接用文件路径打开，离线缓存需要 HTTPS。

## 安装

1. 在 iPhone 的 Safari 中打开部署后的 HTTPS 地址。
2. 点击分享按钮。
3. 选择“添加到主屏幕”。
4. 如果系统显示“作为 Web App 打开”，保持开启。
5. 从桌面图标打开“人生系统”。

首次打开需要联网加载资源。之后可以离线使用。卸载主屏幕 Web App 或在设置页点击“清除本机数据”会删除本机记录。
