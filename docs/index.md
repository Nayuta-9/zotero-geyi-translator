# Zotero Geyi Translator (`zotero-geyi-translator`) — Official Documentation

**`zotero-geyi-translator`** is an open-source Zotero 7–9 extension (`AGPL-3.0-or-later`) that integrates layout-preserving academic PDF translation, LaTeX mathematical formula preservation, and historical archive OCR into your Zotero research library.

- **Source Repository**: [github.com/Nayuta-9/zotero-geyi-translator](https://github.com/Nayuta-9/zotero-geyi-translator)
- **Zotero Plugin Overview & `.xpi` Download**: [https://www.geyi.net/zotero-plugin](https://www.geyi.net/zotero-plugin)

---

## 1. Architecture & Core Workflow

1. **Right-Click PDF Attachment Translation (`F3`)**
   - Select any journal item or PDF attachment in Zotero 7–9 and click **"Translate with Geyi"**.
   - Supports two-column IEEE/ACM/Springer/Elsevier papers with inline and display `LaTeX` equations, cross-page tables, and footnotes via [Geyi Academic PDF Translation](https://www.geyi.net/en/translate/pdf).
   - Documents with $\ge 100$ pages (such as academic monographs and textbooks) are automatically routed to the asynchronous long-document pipeline ([Full-Book Translation](https://www.geyi.net/en/translate/book)) to maintain cross-chapter terminology consistency.

2. **Passwordless Browser OAuth with SHA-256 PKCE Verification (`F2`)**
   - At login, the plugin generates a 32-byte cryptographically random secret locally and sends only its SHA-256 digest (`code_challenge`, `S256`) to the browser authorization page (`/plugin/authorize`).
   - After user confirmation in the browser, the plugin polls `POST /plugin/authorize/poll` by presenting the raw `code_verifier` in the request body (redacted from Zotero debug logs).
   - Before persisting any issued API key, the plugin displays a blocking confirmation dialog showing the full `account_email` returned by the server. If the user declines or closes the dialog, the plugin discards the key and immediately revokes it via `POST /plugin/key/revoke`.

3. **Automatic Bilingual Attachment & Version Management (`F5`)**
   - Completed translations are automatically imported back under the parent Zotero item as `{OriginalName}_Translated by Geyi.pdf` (with `(Bilingual)` or locale suffixes such as `(zh-TW)`), tagged with the translation pipeline, and accompanied by a structured task note.
   - Re-translating an existing item prompts the researcher to overwrite, create a versioned attachment (`_v2`), or cancel.

4. **Account Glossary Synchronization (`F6`)**
   - Personal terminology glossaries configured on [https://www.geyi.net/](https://www.geyi.net/) are automatically applied to all plugin translation jobs, ensuring domain-specific technical terms remain consistent across papers.

---

## 2. Installation & Local Build

```bash
npm install
npm test                  # Run Vitest unit test suite
npm run build             # Type-check with tsc and build build/*.xpi + update.json
```

In Zotero 7–9, open **Tools → Plugins**, click the gear icon, and select **Install Plugin From File…** to load the `.xpi` package.
