# Cloudflare Pages 加密同步部署

Web 与 PWA 的自动同步依赖 Pages Functions 和 Workers KV。用户通过账号登录匹配同步空间。同步数据在浏览器内使用 AES-GCM 加密，KV 中只保存密文。

## 创建 KV

使用 Cloudflare Dashboard：

1. 打开 `Workers & Pages`。
2. 进入 `KV`，创建命名空间，例如 `life-system-sync`。
3. 打开 Pages 项目 `life-system-pwa`。
4. 进入 `Settings` -> `Bindings`。
5. 添加 KV namespace binding：

```text
Variable name: LIFE_SYNC
KV namespace: life-system-sync
```

生产环境和预览环境都可以绑定同一个命名空间。

## 部署

该版本包含 `functions/`，不能继续使用 Dashboard 的 ZIP 拖拽上传。推荐将 Pages 项目连接到 GitHub 仓库：

```text
https://github.com/<your-account>/life-system
```

Cloudflare Pages 构建配置：

```text
Build command: npm run build:pwa
Build output directory: dist
```

也可以使用 Wrangler：

```powershell
npx wrangler pages deploy dist --project-name life-system-pwa
```

## 使用

部署完成后：

1. 在 Web 页面进入 `设置`。
2. 注册同步账号。
3. 在安装版 PWA 的 `设置` 中登录相同账号。
4. 页面启动、回到前台和本机数据变更后会自动同步，也可以点击 `立即同步`。

账号密码用于登录校验，也用于在设备本地派生数据加密密钥。密码不会以明文保存到 KV。忘记密码后无法解密已有云端数据，请妥善保存。
