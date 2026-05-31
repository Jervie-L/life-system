# iOS App Store 发布清单

当前仓库已使用 Capacitor 包装为 iOS App。Web 资源会内置到安装包中。iOS 版默认将数据保存在 App 沙盒内，不依赖服务器；本地 Web 开发仍使用 Python + SQLite。

## 发布前阻塞项

- 将 `capacitor.config.ts` 中的 `appId` 改为 Apple Developer 中实际注册的 Bundle ID。
- 将 `docs/privacy-policy.md` 中的占位内容补齐，发布为公开网页，并把 URL 填入 App Store Connect。
- 复制 `.env.ios.example` 为 `.env.ios`，填写隐私政策 URL。设置页会显示隐私政策入口。`.env.ios` 不提交到 Git。
- 在 App Store Connect 填写 App Privacy 数据收集说明。默认版本的数据仅保存在用户设备上，不上传到开发者服务器。
- 准备 App 图标、启动页、iPhone 截图、支持 URL、隐私政策 URL 和审核说明。

## 可选远程同步

如未来需要账号和多设备同步：

- 部署 HTTPS API，并增加用户认证、访问隔离、备份和删除账号/数据能力。不要直接暴露当前无鉴权的 `backend/server.py`。
- HTTPS API 需要允许 Capacitor App 的跨域请求，并仅开放实际需要的来源、方法和请求头。
- 在 `.env.ios` 中填写正式 API 地址。
- 重新核对隐私政策和 App Store Connect 的 App Privacy 数据收集声明。

## 在 macOS 上生成发布包

需要 macOS、当前版 Xcode、Apple Developer Program 账号和已注册的 Bundle ID。

```bash
npm ci
cp .env.ios.example .env.ios
# 编辑 .env.ios，填写已上线的隐私政策 URL
npm run build:ios
npm run open:ios
```

在 Xcode 中：

1. 打开 `ios/App/App.xcodeproj`。
2. 在 Signing & Capabilities 选择 Team，确认 Bundle Identifier。
3. 使用真机完成主要流程测试。
4. 选择 `Product > Archive`。
5. 在 Organizer 中上传到 App Store Connect，先走 TestFlight。

## 审核注意事项

- App Store 审核要求 App 不只是简单网页包装。提交前应至少加入适合移动端的核心能力，例如本地提醒、Face ID 解锁或离线记录。
- 当前后端只监听 `127.0.0.1:8765`，用于本地 Web 开发，不会打包到 iOS App。
- 如果启用远程 API，iOS 默认通过 App Transport Security 限制不安全连接，正式 API 应使用有效证书的 HTTPS。
- 如果未来发布版本加入登录，提交审核时准备可用的审核账号，确保后端在线。
