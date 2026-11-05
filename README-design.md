# Peco 网站外观

现有 GitHub 仓库通过 Cloudflare Pages 自动部署，无需构建命令或新增依赖。

2026-11-05 已将确认过的「林间慢车」风格应用到全站。正式首页使用 `assets/forest/home.css`、`home.js` 与原创 Canvas 场景 `landscape.js`；原始首页预览保留在 `/preview/forest-railway/`。场景按 UTC+8 连续插值天色，首页右下角可预览五个时段、拖动时间滑块或恢复实时。支持减少动态效果，动画在页面隐藏或场景离屏时暂停。蓝黄旧版完整快照为提交 `13f5bd2`，备份标签 `backup-blue-yellow-20261105`；源码 ZIP、完整 Git bundle 和恢复说明另外保存在工作区的 `backups/blue-yellow-2026-11-05/`。

新版以森林绿、奶油纸色与旧金色为主色，使用宋体标题与像素树标志。公共子页保留 `site.css` 布局与 `site.js` 交互，通过 `forest-theme.css` 统一导航、页脚与组件，`forest-scene.js` 添加随天色变化的景观条；公开信息和博客另由 `forest-content.css` 统一长文、奖状、编辑器。学习站和私人聊天分别加载 `study/forest.css`、`chat/forest.css`，两张明信片工具使用只作用于屏幕界面的主题，作品导出与打印保持原样。

| 页面 | 用途 |
| --- | --- |
| `index.html` | 日常个人主页 |
| `about/index.html` | 公开信息：个人介绍、学习与实践经历、邮箱联系 |
| `blog/index.html` | 博客列表、图文阅读与管理编辑器 |
| `2.html` | 朋友与本站名片 |
| `3.html` | 留言板、匿名树洞 |
| `4.html` | 共享像素画布 |
| `study/index.html` | 电力系统分析学习站：15 节课堂、36 道检查题、7 个交互实验 |
| `postcard-studio.html` | 小龙邮局 · 明信片排版、导出与打印 |
| `postcard-3d-showcase-matte.html` | 官方明信片双卡 3D 预览 |
| `index_birth.html` | 生日特别页 |
| `2_birth.html` | 生日寄语 |
| `3_birth.html` | 生日留言入口 |
| `warning.html` | 建设中的页面 |
| `chat/index.html` | 密码保护的私人聊天 |

公共导航和页脚直接写在各页 HTML 中，关闭 JavaScript 后仍能使用页面链接。手机导航、复制本站名片、点赞与生日彩纸在 `site.js` 中。动画遵循系统的「减少动态效果」设置。

公共页面的「公开信息」入口指向 `/about/`。页面以 Peco 署名，内容依据本人提供的学业、任职、竞赛和志愿材料整理，数据标注 2026 年 10 月的材料时间；宣传部副部长经历按已结束的学年表述。邮箱为 `2058064651@qq.com`，支持邮件链接和复制。宣传海报使用适合网页的 WebP 版本。

「奖状陈列」位于 `/about/#certificates`，包含四份个人荣誉与两份团队竞赛证书。图片由提供的原始照片或电子证书转换为 WebP，保留完整画面；点击后可放大、连续翻页或单独打开图片。关闭 JavaScript 时仍可通过图片链接查看。

iCAN「菲尼克斯杯」的竞赛记录与奖状卡片均提供「查看技术报告」按钮，打开 `/about/reports/ican-yiyandingzhen-report.pdf`。PDF 由本人提供的《医眼盯真技术报告》原始 Word 文件导出，在新标签页阅读。

首页「随便走走」中的「我的学习站」进入 `/study/`。学习站保留独立的课堂界面和浏览器学习记录，支持逐步例题、自测、错题复习与记录导出；课程菜单可返回 Peco 首页。三份引用的课件位于 `study/materials/`，课程内的原文件链接使用站内相对路径。

`comments.js` 保留原留言接口、回复、精选抽屉、管理员功能和 Turnstile 验证。普通留言与生日留言共用原来的 `page3` 数据，树洞继续使用 `treehole`，没有迁移或清空数据。验证码会根据容器宽度选用普通或紧凑尺寸。

`pixel.js` 保留原来的 48 × 48 棋盘和颜色索引。访问页面只读取棋盘；点击同步才写入颜色并保存 PNG 快照。导出图片使用浏览器 Canvas，以 960 × 960 PNG 保存，不依赖截图脚本。快照字段与现有 `/api/pixel?action=snapshot` 的 `image` 参数一致。

`assets/garden.svg` 在生日页保留为纪念插画，`assets/favicon.svg` 是森林绿和金色的站点图标；小熊猫照片继续使用原来的 `image1.jpg`，生日头像使用原来的 `0.jpg`。`og-image.png` 使用林间铁路主题的分享封面。

私人配置、启动日志、测试脚本和浏览器截图保留在 Git 忽略的 `.bridge-local` 中，不随仓库部署。

首页「制作明信片」进入独立的 `postcard-studio.html`。工坊的脚本、样式和插画都内嵌在该 HTML 中；上传图片与自动保存的设计保留在当前浏览器，可导出 PNG、SVG 或保存设计 JSON，并可按 154 × 104 mm 实际尺寸打印。点击工坊左上角的站点标志返回首页。

旁边的「预览官方明信片」打开 `postcard-3d-showcase-matte.html`，展示未盖章与盖章两版明信片，可拖动旋转、缩放、暂停或切换聚焦。图片和 Three.js 已内嵌，无法使用 WebGL 时切换为兼容展示；左上角可返回首页。

博客使用森林纸面主题下的独立样式与编辑器，发布权限沿用现有管理员入口。使用方式与数据库说明见 [README-blog.md](README-blog.md)。
