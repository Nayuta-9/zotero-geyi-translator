# 格译 Geyi · Zotero 插件（zotero-geyi-translator）

在 Zotero 7 里一键翻译文献，译文自动挂回原条目。由[格译 Geyi](https://www.geyi.net) 云端翻译，复用你在网页端的账号、积分与术语表。（Jira: GEYI-328）

## 功能（v0.9）

- **单文件翻译主路径（F3）**：右键条目/PDF 附件 →「用格译翻译」→ 选目标语言/管线/精度 → 提交云端 → 进度轮询 → 译文作为子附件挂回同一条目并打 tag。
- **浏览器授权登录（F2）**：无需在插件里输密码。生成一次性 nonce → 系统浏览器打开格译同意页 → 确认后浏览器把 Key 回写到本机 `127.0.0.1:23119/geyi/auth-callback`（本插件在 Zotero 内置 Server 上注册的端点，带 CORS + Private-Network-Access 头）；回写不通时回落「手动粘贴 Key」。凭证 base64 包装后存 Zotero 偏好（Zotero 无系统钥匙串，此为防随手翻文件的可达口径）。
- **设置面板（F7 精简）**：账户（登录/登出/邮箱）、默认目标语言/管线/精度、完成通知开关、网页控制台/下载页入口。
- **安装与自升级（F1）**：`.xpi` 分发；`update.json` 指向 `https://www.geyi.net/plugin/`。中英双语跟随 Zotero 语言。

## 与后端/网页端的对接

- 后端开放 API：`/v1/*`（GEYI-321/326，Bearer Key 鉴权）。授权流：`GET /api/v1/plugin/authorize/start` + 网页同意页 `POST /api/v1/plugin/authorize/confirm`（GEYI-326）。
- 网页端同意页 `https://www.geyi.net/plugin/authorize`、设备管理「Open API」页、下载页 `/download`（GEYI-327）。
- **loopback 契约**：网页同意页确认后 `POST http://127.0.0.1:<port>/geyi/auth-callback`，body `{state:<nonce>, api_key, api_base_url, ...}`；本插件校验 nonce 后落库。

## 开发

```bash
npm install
npm start      # 启动 Zotero 并热重载(需本机装 Zotero 7 + 配置 .env 的 Zotero 路径)
npm run build  # tsc 类型检查 + 打包 build/*.xpi + 生成 update.json
```

技术栈：TypeScript + [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) + [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)，仅支持 Zotero 7。

## 发布

1. `npm run build` → 产出 `build/geyi-translator.xpi` 与 `build/update.json`。
2. 把 xpi 复制为 **`zotero-geyi.xpi`**、连同 `update.json` 放到网页端仓库 `immersive_translator_frontend/public/plugin/`（`update.json` 的 `update_link` 已指向 `https://www.geyi.net/plugin/zotero-geyi.xpi`），推 main 部署。
3. 官网 `/download` 的下载按钮即生效。首个版本先自建 `update.json` 分发；官方插件目录提审推迟到 GA（GEYI-330 Q2）。

## 已知待验证（需真实 Zotero 环境）

- loopback 端点的 CORS/PNA 响应头在具体 Zotero 版本下是否被 `Zotero.Server` 如实下发（不行则走手动兜底，流程仍可完成）。若长期不稳，可改为「插件轮询后端取 Key」模型（更健壮，需后端加 poll 端点）。
- 大文件签名 URL 二段上传、100 篇随机 PDF 成功率（AC-05 ≥95%）等端到端指标需在真实 Zotero 打磨。

## License

AGPL-3.0-or-later
