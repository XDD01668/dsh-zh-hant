# dsh-zh-hant

在 DeepSeek Harness（DSH）Web 介面中，把顯示出來的簡體中文轉為**香港繁體中文**（OpenCC `s2hk`），英文、數字、程式碼與可編輯輸入維持原樣。所有轉換都可以即時還原。

## 轉換範圍

- 轉換：畫面中的一般文字、對話訊息、選單、設定、提示與 Tooltip；以及 `title`、`aria-label`、`aria-description`、`aria-placeholder`、`placeholder`、`alt`、`aria-valuetext`，和按鈕類 `<input>` 的 `value`。
- 不轉換：`<pre>`、`<code>`、`<kbd>`、`<samp>`、`<textarea>`、`<input>`、`contenteditable`、`role="textbox"`、Monaco／xterm／CodeMirror 編輯器，以及任何帶有 `data-zh-hant-ignore` 的節點。
- 不修改：`href`、`src`、`id`、`class`、`style`、`data-*`、`lang`，也不寫入任何 DSH 的會話資料或設定檔。

轉換採香港標準字形（例如「設置」「賬號」「登錄」「裏面」「為什麼」），不會引入粵語口語詞彙。

## 使用方式

1. 開啟「設定」→「通用設定」。
2. 找到「繁體中文轉換」列，以開關啟用或停用；預設為啟用。
3. 停用時，外掛會把每一個曾改寫的文字節點與屬性還原為改寫前的原文。

網址參數可覆寫單次載入的行為，不會改動已儲存的偏好：

- `?zh-hant=0`、`off`、`false`：本次載入停用轉換。
- `?zh-hant=1`、`on`、`true`：本次載入強制啟用。
- `?zh-hant=selftest`：載入後在 Console 輸出內建自我測試結果。
- `?zh-hant=audit`：載入後掃描目前 DOM，列出仍會被轉換的文字與屬性（不寫入畫面），便於檢查覆蓋率。

瀏覽器 Console 也可使用：

```js
window.__dshZhHant.toggle();
window.__dshZhHant.isEnabled();
window.__dshZhHant.stats();
window.__dshZhHant.selfTest();
window.__dshZhHant.audit();
window.__dshZhHant.dispose();
```

## 可逆性設計

每個被改寫的 Text 節點／屬性，都會在 `WeakMap` 中記錄「改寫前字串」與「本次寫入字串」。停用或外掛卸載時：

- 只有在目前值仍等於外掛寫入的值時，才還原為改寫前字串。
- 若應用程式已把該節點改成別的值，則以應用程式的新值為準，外掛不覆蓋。
- 不使用反向 OpenCC 轉換，也不持久化任何文字對照表。

## 建置與測試

```bash
# 需要 Node.js 22+
node scripts/build.mjs          # 將 vendor/opencc.cn2t.umd.cjs 內嵌進 client.js
node scripts/test-converter.mjs # 轉換案例、冪等性、ASCII/emoji 與效能檢查
node --check client.js
```

`scripts/build.mjs` 會驗證 vendored UMD 的大小與 SHA-256，避免替換成非預期版本。

## 目錄

- `client.js`：瀏覽器端單檔外掛（已內嵌 OpenCC）。
- `index.js`：Host 端空實作，僅供 bundle patch 掛載。
- `src/client.template.js`：`client.js` 的可讀原始碼。
- `vendor/opencc.cn2t.umd.cjs`：`opencc-js@1.4.2` UMD 建置。
- `scripts/`：建置與轉換測試。
- `locale/`：外掛市集的中英文中介資料。

## 已知限制

- 無法轉換 Shadow DOM、iframe、canvas、瀏覽器原生對話框或視窗標題列中的文字。
- 少數以 CSS `content` 或非標準屬性提供的文字可能不在轉換範圍。
- 若應用程式恰好把某節點改成與外掛寫入值相同的繁體字串，停用時可能還原成較早的簡體原文；此為可逆性契約的已知邊界。
- 複製行為取決於應用程式是從 DOM 或從內部資料複製：從 DOM 複製時會取得畫面上的繁體字，從內部資料複製時仍為原始簡體。

## 授權

本外掛以 MIT 授權釋出。內嵌的 `opencc-js` 為 MIT AND Apache-2.0；詳見 `THIRD_PARTY_LICENSES.md` 與 `LICENSES/`。
