# Peco 网站外观

现有 GitHub 仓库通过 Cloudflare Pages 自动部署，无需构建命令或新增依赖。

新版以纸白、蓝色和奶油黄为主色。公共页面共享 `site.css` 与 `site.js`；私人聊天使用独立的 `chat/chat.css`，会话与密码验证逻辑保持在原来的聊天服务中。

| 页面 | 用途 |
| --- | --- |
| `index.html` | 日常个人主页 |
| `blog/index.html` | 博客列表、图文阅读与管理编辑器 |
| `2.html` | 朋友与本站名片 |
| `3.html` | 留言板、匿名树洞 |
| `4.html` | 共享像素画布 |
| `postcard-studio.html` | 小龙邮局 · 明信片排版、导出与打印 |
| `postcard-3d-showcase-matte.html` | 官方明信片双卡 3D 预览 |
| `index_birth.html` | 生日特别页 |
| `2_birth.html` | 生日寄语 |
| `3_birth.html` | 生日留言入口 |
| `warning.html` | 建设中的页面 |
| `chat/index.html` | 密码保护的私人聊天 |

公共导航和页脚直接写在各页 HTML 中，关闭 JavaScript 后仍能使用页面链接。手机导航、复制本站名片、点赞与生日彩纸在 `site.js` 中。动画遵循系统的「减少动态效果」设置。

`comments.js` 保留原留言接口、回复、精选抽屉、管理员功能和 Turnstile 验证。普通留言与生日留言共用原来的 `page3` 数据，树洞继续使用 `treehole`，没有迁移或清空数据。验证码会根据容器宽度选用普通或紧凑尺寸。

`pixel.js` 保留原来的 48 × 48 棋盘和颜色索引。访问页面只读取棋盘；点击同步才写入颜色并保存 PNG 快照。导出图片使用浏览器 Canvas，以 960 × 960 PNG 保存，不依赖截图脚本。快照字段与现有 `/api/pixel?action=snapshot` 的 `image` 参数一致。

`assets/garden.svg` 是页面内的花园插画，`assets/favicon.svg` 是站点图标；小熊猫照片继续使用原来的 `image1.jpg`，生日头像使用原来的 `0.jpg`。`og-image.png` 是蓝黄配色的分享封面。

私人配置、启动日志、测试脚本和浏览器截图保留在 Git 忽略的 `.bridge-local` 中，不随仓库部署。

首页「制作明信片」进入独立的 `postcard-studio.html`。工坊的脚本、样式和插画都内嵌在该 HTML 中；上传图片与自动保存的设计保留在当前浏览器，可导出 PNG、SVG 或保存设计 JSON，并可按 154 × 104 mm 实际尺寸打印。点击工坊左上角的站点标志返回首页。

旁边的「预览官方明信片」打开 `postcard-3d-showcase-matte.html`，展示未盖章与盖章两版明信片，可拖动旋转、缩放、暂停或切换聚焦。图片和 Three.js 已内嵌，无法使用 WebGL 时切换为兼容展示；左上角可返回首页。

博客使用蓝黄主题下的独立样式与编辑器，发布权限沿用现有管理员入口。使用方式与数据库说明见 [README-blog.md](README-blog.md)。
