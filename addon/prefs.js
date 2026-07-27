/* 默认偏好(GEYI-328)。前缀 __prefsPrefix__ = extensions.zotero.geyi。
 * 凭证(apiKey / apiBaseUrl)不在此声明默认值 —— 授权后写入,登出清除。 */
pref("__prefsPrefix__.targetLanguage", "zh-CN");
pref("__prefsPrefix__.layoutMode", "reflow");
pref("__prefsPrefix__.precisionMode", "high");
pref("__prefsPrefix__.outputFormats", "pdf");
/* 处理档(GEYI-422)。默认 fast 是刻意的:慢速档判的是**专业级**权益
 * FEATURE_BATCH_SLOW,而插件的准入档位只要研究级。此前档位由 layoutMode+precisionMode
 * 自动推导,默认 reflow+high 恒推出 slow,于是研究级用户每次翻译都吃 403 —— 而他
 * 从没选过慢速档。现在由用户在设置页显式选。 */
pref("__prefsPrefix__.speedMode", "fast");
pref("__prefsPrefix__.welcomeShown", false);
pref("__prefsPrefix__.notifyOnComplete", true);
pref("__prefsPrefix__.autoNote", true);
/* 并发上限的权威在后端(task_service._TIER_ACTIVE,按档位 1/3/8),这里的默认值只是
 * 「不设限,听后端的」。留成 3 会把专业级用户压在后端允许值 8 之下。 */
pref("__prefsPrefix__.maxConcurrentTasks", 99);
pref("__prefsPrefix__.logLevel", "info");
pref("__prefsPrefix__.installTelemetrySent", false);
