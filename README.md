# 格译 Geyi · Zotero 插件（zotero-geyi-translator）

在 Zotero 7–9 里一键翻译文献，译文自动挂回原条目。由[格译 Geyi](https://www.geyi.net) 云端翻译，复用你在网页端的账号、积分与术语表。（Jira: GEYI-328～330）

## 功能

- **单文件翻译主路径（F3）**：右键条目/PDF 附件 →「用格译翻译」→ 确认目标语言/管线/精度 → 提交云端；≥100 页的高精度 AI 重排任务自动使用慢速翻译，小文件仍走实时路径。
- **浏览器授权登录（F2）**：无需在插件里输密码。插件生成一次性 nonce 并打开系统浏览器；用户确认后，插件每 2 秒轮询后端 Device Flow 端点领取 API Key，不依赖浏览器 loopback/CORS/PNA。用户在网页取消、会员档位不足（需研究级及以上）或授权链接过期（10 分钟）时，插件立即停止轮询并说明原因，档位不足时给出会员方案入口；网络持续不通约 1 分钟也会停止并提示检查网络。凭证 base64 包装后存 Zotero 偏好（Zotero 无系统钥匙串，此为防随手翻文件的可达口径）。
- **任务进度（F4）**：条目侧边栏「格译任务」显示进行中与最近 20 条；活跃任务每 3 秒轮询，空闲自动停止；插件重启后用服务端列表与本地 job id 交集恢复，只展示插件自己发起的任务。
- **译文回填（F5）**：产物作为同条目子附件导入，命名为 `{原名}_Translated by Geyi.pdf` 并打管线 tag；繁體与双语对照以括号限定词区分（`… (zh-TW)` / `… (Bilingual)`），重复翻译加 `_v2`。重复翻译明确选择覆盖、生成新版本或取消；默认生成任务 note。右键插件译文可换管线重跑。
- **术语表联动（F6）**：账户个人术语全量自动应用。插件读取并展示当前术语条目数，缓存不超过 5 分钟；不提供术语表选择、“不使用”或条目级置顶，网页端提供管理入口。
- **设置面板（F7）**：账户余额/会员/术语数、默认目标语言/管线/精度/产物、自动 note、通知、并发上限、日志级别、反馈与隐私入口，修改即时生效。
- **埋点与反馈（F8）**：插件请求以 `GeyiZoteroPlugin/x.y.z` 标识，并以自定义头兜底；安装、登录、提交、完成/失败、工单、充值事件通过现有健康端点 best-effort 上报；反馈链接预填插件/Zotero/系统版本与最近任务 id。
- **安装与自升级（F1）**：`.xpi` 分发；`update.json` 指向 `https://www.geyi.net/plugin/`。中英双语跟随 Zotero 语言。
- **首次引导**：新安装或升级后的第一次启动弹出一个不阻塞的小窗口，说明如何登录、如何右键翻译、需研究级及以上会员（新注册账号含 1 天体验）；同一版本只出现一次。

## 与后端/网页端的对接

- 后端开放 API：`/v1/*`（GEYI-321/326，Bearer Key 鉴权）。授权流：`start` → 网页 `confirm` → 插件 `poll`（GEYI-326）。
- 网页端同意页 `https://www.geyi.net/plugin/authorize`、设备管理「Open API」页、下载页 `/download`（GEYI-327）。
- `/v1/translations` 列表按用户聚合，可能含网页端任务；插件只显示本地持久化过的 job id，避免混入非插件任务。

## 开发

```bash
npm install
npm start      # 启动 Zotero 并热重载(需本机装 Zotero 7–9 之一 + 配置 .env 的 Zotero 路径)
npm test       # Vitest 单测
npm run build  # tsc 类型检查 + 打包 build/*.xpi + 生成 update.json
```

技术栈：TypeScript + [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold) + [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)，支持 Zotero 7–9（`addon/manifest.json` 的 `strict_min_version` / `strict_max_version`）。

## 发布

**动 `src/` 或 `addon/` 就必须先 bump 版本**，顺序是 `npm version` → 推 tag → `publish:web`。原因是 Zotero 只在版本号**严格变大**时才升级：同版本号不同内容的包发出去，老用户既不会自动更新，手动装也看不出差别，症状是「已修已发但线上仍复现」（GEYI-424 踩过一次，那次是 `src/utils/config.ts` 里手写的版本号从没跟过 `package.json`，导致设置页与 UA 恒为 0.9.0）。

如果同版本号的包已经流出：**不要覆盖 stable 试图修复**——Zotero 同号一律不升级。唯一出路是 bump 一个新 patch 重发；被覆盖的 `v{version}/` 归档路径带一年 immutable 缓存，靠桶的 object versioning 恢复旧 generation，该版本号作废不再复用。

1. `npm run publish:web -- --dry-run`：运行测试与构建，校验版本、稳定下载地址及 XPI SHA-512，不上传文件。
2. `npm run publish:web`：重复上述校验，把版本化 XPI、稳定 XPI 和 `update.json` 依次上传到 GCS 桶，并回读验证版本与哈希（回读走 `https://www.geyi.net/plugin/*` 真实入口，路由与缓存头一起验）。更新清单最后上传，避免客户端读到悬空版本。
3. 以后发布插件不需要改动或部署官网/后端，只需插件仓 `main` 已同步后执行本命令。可用 `GEYI_PLUGIN_BUCKET=<bucket>` 覆盖默认发布桶。

**发布桶从 GEYI-894 起是前端静态桶 `gs://geyi-frontend-static`**（此前是专用桶 `gs://geyi-translator-plugin-releases`）。桶是**私有桶**，由 geyi-trans 的全局负载均衡代读，`/plugin/*` 交给 backend bucket `geyi-frontend-bucket` 服务——**对外 URL 一字未变**，仍是 `https://www.geyi.net/plugin/…`。

换桶的理由与插件无关：项目的 backend bucket 配额是 3 个且已满、提额被自动拒，而前端要给 `/assets/*` 单开一个 `FORCE_CACHE_ALL` 的 backend bucket 才能让 Cloud CDN 真正命中，槽位只能从插件这边腾。两个连带后果要知道：

- 前端仓 `geyi-frontend` 的发布脚本会把「不在本次构建产物里」的桶内对象当陈旧对象删掉，`plugin/` 前缀在那边有专门的保护（`scripts/deploy-static.sh` 的 `PROTECTED_PREFIXES`，发布日志里会打印「受保护(插件分发对象) N 个」）。**改本仓发布目标前先确认那道保护还在**，否则前端发一次版就会把插件分发整片删掉。
- 插件分发件现在与前端产物同桶，因此前端的 Cloud Build 账号 `geyi-static-deploy@geyi-trans.iam.gserviceaccount.com` 对它们也有写权限（此前只有项目 Owner/Editor 能写）。

老桶 `gs://geyi-translator-plugin-releases` 作为回滚件保留到 GEYI-894 结案 30 天后，里面 9 个对象与新桶逐字节相同。

### GitHub Release（插件商店用，GEYI-399）

插件商店 [syt2/zotero-addons-scraper](https://github.com/syt2/zotero-addons-scraper)（Zotero Addons 的数据源）按 **GitHub Releases** 抓取新版本，因此上架后每次发版都要留下一个挂着 `.xpi` 的 Release：

```bash
npm version patch && git push --follow-tags   # 打 v* tag 即触发 .github/workflows/release.yml
```

workflow 会校验 tag 与 `package.json` 版本一致，跑完验证门后创建 Release，**只挂 `geyi-translator.xpi`**——`update.json` 属于 GCS 那条链路，它的 `update_hash` 只匹配打它的那次构建，挂进 Release 只会得到一份自相矛盾的清单（见 `release.yml` 内注释）。两条分发链路互相独立：网页端（`publish:web` → GCS）面向官网下载页与自升级，GitHub Release 面向插件商店。

> 收录入口注意：`zotero-chinese/zotero-plugins` 已停止接受新插件提交（其站点 zotero-chinese.com 上的「请求收录插件」链接尚未更新），现行入口是 `syt2/zotero-addons-scraper` 的 `addons/` 目录，条目文件名为 `Nayuta-9@zotero-geyi-translator`。

> 商店多久能看到新版本：`addons/` 里的条目只记仓库名，版本靠上游定时抓 GitHub Releases（cron 每天 6 轮，实测漂移较大）。Zotero Addons 客户端直接读 scraper 的 `addon_infos.json`，只等这一轮；而 zotero-chinese.com 的插件页是**构建期**把数据烘进 bundle 的，还要再等它自己重新构建一次——所以网页上看到的版本天然比客户端里慢。发完版不必盯，也不要因为网页还是旧版本就怀疑发布失败。

## 已知限制与待验证

- F6 产品决议为账户个人术语全量自动应用：`/v1/glossaries` 用于只读展示账户术语条目数，翻译任务由后端自动使用整套个人术语；插件不提供术语表选择、“不使用”或条目级置顶。
- Zotero 的请求体接口不支持 `FormData`，插件统一走签名 URL 二段上传；设置页如实展示该策略，不提供无效的阈值开关。
- Windows 11 / macOS 14 / Ubuntu 22.04 全量回归、重启恢复、重复译文三选一和大文件上传仍需按 [`docs/qa-geyi-329-330.md`](docs/qa-geyi-329-330.md) 真机验证。

## License

AGPL-3.0-or-later


## 相关资源与多语种指南（Resources & Multilingual Guides）

- **官方网站与插件门户**：[格译 Geyi (geyi.net)](https://www.geyi.net) · [Zotero 插件专页](https://www.geyi.net/zotero-plugin) · [整书精译 (`/translate/book`)](https://www.geyi.net/translate/book) · [古籍与手稿提取 (`/document-extraction`)](https://www.geyi.net/document-extraction)
- **官方多语种导航与学术专栏**：[19 语种快速门户 (`geyinet.carrd.co`)](https://geyinet.carrd.co) · [Geyi Academic Newsletter (`geyi.beehiiv.com`)](https://geyi.beehiiv.com) · [Substack (`@geyinet`)](https://substack.com/@geyinet) · [日本语门户 (`lit.link/geyinet`)](https://lit.link/geyinet)
- **Zotero 插件与 19 语种文献精译/古籍 OCR 完整指南索引**：详见 [`docs/multilingual-guides.md`](docs/multilingual-guides.md)（含 [Zotero Bilingual Plugin Guide](https://telegra.ph/Geyi-Zotero-Bilingual-Translation-Plugin--One-Click-Academic-PDF--LaTeX-Translation-in-Zotero-67-10-19) 等各语种文档）
