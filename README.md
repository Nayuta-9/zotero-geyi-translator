# 格译 Geyi · Zotero 插件（zotero-geyi-translator）

在 Zotero 7–9 里一键翻译文献，译文自动挂回原条目。由[格译 Geyi](https://www.geyi.net) 云端翻译，复用你在网页端的账号、积分与术语表。（Jira: GEYI-328～330）

## 功能（v0.9）

- **单文件翻译主路径（F3）**：右键条目/PDF 附件 →「用格译翻译」→ 确认目标语言/管线/精度 → 提交云端；≥100 页的高精度 AI 重排任务自动使用慢速翻译，小文件仍走实时路径。
- **浏览器授权登录（F2）**：无需在插件里输密码。插件生成一次性 nonce 并打开系统浏览器；用户确认后，插件每 2 秒轮询后端 Device Flow 端点领取 API Key，不依赖浏览器 loopback/CORS/PNA。凭证 base64 包装后存 Zotero 偏好（Zotero 无系统钥匙串，此为防随手翻文件的可达口径）。
- **任务进度（F4）**：条目侧边栏「格译任务」显示进行中与最近 20 条；活跃任务每 3 秒轮询，空闲自动停止；插件重启后用服务端列表与本地 job id 交集恢复，只展示插件自己发起的任务。
- **译文回填（F5）**：产物作为同条目子附件导入，按 `_zh` / `_bilingual` / `_v2` 命名并打管线 tag；重复翻译明确选择覆盖、生成新版本或取消；默认生成任务 note。右键插件译文可换管线重跑。
- **术语表联动（F6）**：账户个人术语全量自动应用。插件读取并展示当前术语条目数，缓存不超过 5 分钟；不提供术语表选择、“不使用”或条目级置顶，网页端提供管理入口。
- **设置面板（F7）**：账户余额/会员/术语数、默认目标语言/管线/精度/产物、自动 note、通知、并发上限、日志级别、反馈与隐私入口，修改即时生效。
- **埋点与反馈（F8）**：插件请求以 `GeyiZoteroPlugin/x.y.z` 标识，并以自定义头兜底；安装、登录、提交、完成/失败、工单、充值事件通过现有健康端点 best-effort 上报；反馈链接预填插件/Zotero/系统版本与最近任务 id。
- **安装与自升级（F1）**：`.xpi` 分发；`update.json` 指向 `https://www.geyi.net/plugin/`。中英双语跟随 Zotero 语言。

## 与后端/网页端的对接

- 后端开放 API：`/v1/*`（GEYI-321/326，Bearer Key 鉴权）。授权流：`start` → 网页 `confirm` → 插件 `poll`（GEYI-326）。
- 网页端同意页 `https://www.geyi.net/plugin/authorize`、设备管理「Open API」页、下载页 `/download`（GEYI-327）。
- `/v1/translations` 列表按用户聚合，可能含网页端任务；插件只显示本地持久化过的 job id，避免混入非插件任务。

## 开发

```bash
npm install
npm start      # 启动 Zotero 并热重载(需本机装 Zotero 7 + 配置 .env 的 Zotero 路径)
npm test       # Vitest 单测
npm run build  # tsc 类型检查 + 打包 build/*.xpi + 生成 update.json
```

技术栈：TypeScript + [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) + [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)，仅支持 Zotero 7。

## 发布

1. `npm run build` → 产出 `build/geyi-translator.xpi` 与 `build/update.json`。
2. 把 xpi 复制为 **`zotero-geyi.xpi`**、连同 `update.json` 放到网页端仓库 `immersive_translator_frontend/public/plugin/`（`update.json` 的 `update_link` 已指向 `https://www.geyi.net/plugin/zotero-geyi.xpi`），推 main 部署。
3. 官网 `/download` 的下载按钮即生效。首个版本先自建 `update.json` 分发；官方插件目录提审推迟到 GA（GEYI-330 Q2）。

## 已知限制与待验证

- F6 产品决议为账户个人术语全量自动应用：`/v1/glossaries` 用于只读展示账户术语条目数，翻译任务由后端自动使用整套个人术语；插件不提供术语表选择、“不使用”或条目级置顶。
- Zotero 的请求体接口不支持 `FormData`，插件统一走签名 URL 二段上传；设置页如实展示该策略，不提供无效的阈值开关。
- Windows 11 / macOS 14 / Ubuntu 22.04 全量回归、重启恢复、重复译文三选一和大文件上传仍需按 [`docs/qa-geyi-329-330.md`](docs/qa-geyi-329-330.md) 真机验证。

## License

AGPL-3.0-or-later
