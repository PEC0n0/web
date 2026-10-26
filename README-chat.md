# Peco 私人聊天

新增页面：**https://peco.ink/chat/**。原有页面与原有 `/api/comment`、`/api/like`、`/api/pixel` 保持原样。

手机浏览器输入独立密码后，能查看和继续这台电脑上的 Codex 对话、开启新对话、上传参考图、生成和修改图片、下载原图。手机不需要登录 ChatGPT。

## 1. 先在电脑使用

这台电脑已安装 Node.js 与 Codex。双击 `bridge/start.cmd`，然后打开：

**http://127.0.0.1:8787/chat/**

首次运行会在 `.bridge-local/access.txt` 生成网页密码、网站连接密钥。这个目录已被 Git 忽略，不要把它手动上传到网站或 GitHub。

也可以在仓库目录运行：

```powershell
npm run chat:setup
npm run chat:start
```

没有额外 npm 依赖。需要 Node.js 22 或更新版本。`npm run chat:doctor` 可检查电脑登录、图片生成和会话读取。Windows 默认优先选择桌面应用自带的 Codex，避免旧版 npm CLI 读不到桌面会话；桌面应用升级后会自动查找新版本。

## 2. 在 Cloudflare 建立电脑连接

打开 Cloudflare 控制台 → **Networking / 网络 → Tunnels / 隧道**。部分账号仍在 **Zero Trust → Networks → Connectors** 中显示入口。

1. 创建一个 `cloudflared` 隧道，例如命名 `peco-chat`。
2. 选择 Windows / 64-bit。此电脑的 `.bridge-local/tools/cloudflared.exe` 已准备好时，只需把面板安装命令最后的一长串 Token 单独复制到 `.bridge-local/tunnel-token.txt`，保存。重启 `chat:start` 会自动启动这个连接器。也可先单独运行 `node bridge/tunnel.mjs`。
3. 为隧道新增 **Published application / 发布应用**：

   | 字段 | 填写内容 |
   | --- | --- |
   | 子域名 | `chat-bridge` |
   | 域名 | `peco.ink` |
   | 服务类型 | `HTTP` |
   | 本机地址 | `127.0.0.1:8787` |

4. 保留原始 Host，不额外设置 HTTP Host Header。
5. 等隧道显示 Healthy / 正常。

若是在另一台电脑重新安装，先按 [Cloudflare 官方下载说明](https://developers.cloudflare.com/tunnel/downloads/) 安装 `cloudflared`，或把官方 Windows amd64 可执行文件放到 `.bridge-local/tools/cloudflared.exe`；连接器会优先使用本地文件，再查找 PATH。Token 只保存在电脑，不要粘贴到聊天或上传 GitHub。

`chat-bridge.peco.ink` 是电脑连接地址；手机日常仍访问 `peco.ink/chat/`。直接访问隧道的聊天 API 必须携带网站端的连接密钥。

不要将 Codex app-server 自身端口直接公开。这里通过本机 Node 服务验证密码和网站连接密钥，Codex 只通过本机标准输入/输出通信。

## 3. 在 Pages 配置两个变量

打开现有网站的 **Workers & Pages → 对应 Pages 项目 → Settings → Variables and Secrets**，在 **Production / 生产环境** 中添加：

| 变量 | 内容 |
| --- | --- |
| `CHAT_BRIDGE_URL` | `https://chat-bridge.peco.ink` |
| `CHAT_BRIDGE_TOKEN` | 本机 `.bridge-local/access.txt` 中同名变量的完整值，选择 Secret / 加密 |

保存后重新部署一次网站。原有 DB 绑定、Turnstile、部署分支和构建输出目录均保留。新增代码是原生 HTML/CSS/JS，不需要改变构建命令。

打开 **https://peco.ink/chat/**，输入 `.bridge-local/access.txt` 内的网页登录密码即可。

如果使用 `www.peco.ink`，电脑端已同时允许这两个域名。其他域名（包括 Pages 预览域名）需要先加入 `.bridge-local/config.json` 的 `origins`，然后重启电脑服务。

## 日常使用

- 电脑需要保持开机、联网，电脑中转服务与 Cloudflare Tunnel 都需要运行。手机关闭网页后，正在进行的任务仍在电脑上继续。
- 已有 Codex 会话可读取和继续。不要在电脑和手机上同时向同一段对话发送指令。
- 新对话默认只允许写入中转目录中的独立工作区；已有会话沿用原会话设置。需要确认的操作会显示在网页，网页不会自动批准。
- 参考图支持 PNG、JPEG、WebP，每张最多 12 MB、每次最多 4 张。生成图片点击预览，下方可下载原图。
- 登录会话最长 12 小时。点击退出立即撤销本次登录；重启电脑中转服务会使所有网页登录失效。密码连续错误 5 次后，该来源需等待 15 分钟。
- 这里连接的是本机 **Codex 应用/CLI** 会话。`chatgpt.com` 网站中的独立聊天记录不会自动导入。历史图片需原文件仍在电脑的生成图片或附件目录中。
- 使用电脑已有的 ChatGPT 登录与对应 Codex 额度，不使用额外 API Key。模型、绘图和额度以该账号实际可用能力为准。

## 更换密码或连接密钥

停止电脑中转服务。将 `.bridge-local/config.json` 和 `.bridge-local/access.txt` 移到本机备份目录，重新运行 `npm run chat:setup`。生成新连接密钥后，也要更新 Pages 的 `CHAT_BRIDGE_TOKEN` 并重新部署；不要移动 `assets` 或 `workspace`，这样原图与对话文件仍会保留。

如需自选密码，可把 `{ "password": "你自己设置的至少12位密码" }` 通过本机标准输入交给 `node bridge/setup.mjs`，不要把实际密码写入脚本或命令历史。

## 检查与排错

```powershell
npm test
npm run chat:doctor
```

| 页面提示 | 检查位置 |
| --- | --- |
| 电脑连接尚未配置 | Pages 生产环境的两个变量是否已保存，并重新部署 |
| 电脑暂时离线 | 电脑是否开机、`chat:start` 是否运行、Tunnel 是否 Healthy |
| 电脑连接验证失败 | Pages 与本机配置中的连接密钥是否一致 |
| 此网站未获连接授权 | 当前网页域名是否在本机配置的 `origins` 中 |
| 电脑尚未登录 | 先在电脑上的 Codex 登录，再点击网页右上角检查连接 |
| 历史图无法下载 | 原图片是否仍在本机，或是否来自另一个应用的聊天 |

实现使用普通 HTTP 长轮询传递回复，避免手机网络和代理对长连接的限制。电脑端保存会话和图片；网站前端不保存密码或聊天正文，也不接收电脑的 ChatGPT 登录令牌。

官方说明：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[图片生成](https://learn.chatgpt.com/docs/image-generation)、[Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/)。
