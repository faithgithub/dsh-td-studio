# dsh-td-studio

**English** | [中文](README.zh.md)

> TDengine AI-native workbench as a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin.

`dsh-td-studio` turns DeepSeek Harness into a TDengine studio. It connects directly to a TDengine cluster over REST, browses schema, runs **read-only** SQL, converts natural language into SQL with charts, and proactively surfaces anomalies — all inside DSH. The same TDengine tools are also available to the agent in chat and render as inline ECharts / table / insight cards.

---

## Features

| Module | What it does |
|---|---|
| **Overview** | AI-planned dashboard rendered with Apache ECharts, auto-fits the DSH window, vertical scroll only. |
| **Database** | Browse databases, super tables and normal tables; schema inspector; SQL editor with context-aware autocomplete (keywords, tables, columns; `Tab` to complete, `Cmd/Ctrl+Space` to trigger). |
| **Intelligent Query** | Natural language → structured SQL → chart. Six defenses against hallucination: candidate-table retrieval, structured SQL generation, static read-only validation, `EXPLAIN` check (with safe fallback), execution limits, and result-grounded charts and numbers. Auto-retries at most twice; the SQL is editable and re-runnable. |
| **Insights (no-question recommendation)** | Deterministic SQL + statistics detect spikes, trends, threshold breaches and alarm clusters. Selectable observation window `1h / 6h / 24h / 7d` (default `24h`). The LLM only writes the narrative and every number is checked against the facts. |
| **Chat-native tools** | `td_query`, `td_insights`, `td_list_databases`, `td_list_tables`, `td_desc_table`, `td_connect`, `td_schema_refresh` are registered as agent tools. Results render inline as ECharts / table / insight cards with a **⤢ Open full screen** button that deep-links into the matching tab. |
| **Security** | AES-256-GCM encrypted credentials under `~/.dsh/td-studio/creds.json`; same-origin REST proxy; read-only enforcement; DDL blocked in rookie mode. |

---

## Requirements

- **DeepSeek Harness** `>= 0.2.1-rc.5 < 0.3.0`
- **Node.js** `>= 20`
- **TDengine** 3.x with the REST interface enabled (default `http://<host>:6041`)

> TDengine 3.x enterprise uses **HTTP Basic Auth**. URL query credentials (`?user=&password=`) are not supported by this plugin.

---

## Install

### Option A — Discover (plugin market index)

1. In DSH open **Plugins**, and enable the optional **Plugin Market** bundle (the **Discover** tab is shipped off by default).
2. In **Discover**, add this index URL:

   ```
   https://raw.githubusercontent.com/wuxinyang/dsh-td-studio/main/market/index.json
   ```

3. Search for `tdengine`, install **dsh-td-studio**, then choose **Enable now**.

### Option B — Install from Git

In **Plugins → Add plugin**, paste the repository URL:

```
https://github.com/wuxinyang/dsh-td-studio
```

Or from the CLI:

```bash
dsh plugin add https://github.com/wuxinyang/dsh-td-studio
```

### Option C — Local development link

```bash
dsh plugin add link:/absolute/path/to/dsh-td-studio
```

After installing, switch the bundle on in **Plugins** and restart DSH if it reports `restart-required`.

---

## Quick start

1. Open **TDengine Studio** from the DSH sidebar.
2. On first run a demo connection (`localhost:6041`, `root/taosdata`) is created automatically if no credentials exist.
3. Use **＋ New connection** to add your own cluster: host, port, user, password. Credentials are encrypted before being written to disk.
4. Pick a database in the top-right selector and start exploring.

---

## Use it from chat

The agent can call the TDengine tools directly. Try:

- `列出 db_new_energy_demo 里有哪些超级表`
- `查一下最近 24 小时每台风机的平均有功功率趋势`
- `扫描 db_new_energy_demo 最近 7 天的异常`
- `统计今天各站点的告警数量并画柱状图`

Tool results appear as inline cards:

- **⤢ Open full screen** jumps to the matching page (Insights → Insights tab, queries → SQL workbench with the SQL pre-filled).
- Query cards offer **📈 Chart / 📋 Data / 🧾 SQL** tabs.
- Insight cards show severity, title, narrative and target metric.

---

## Read-only by design

- All generated SQL passes a static validator that only allows a single `SELECT` / `WITH` / `SHOW` / `DESCRIBE` / `EXPLAIN` statement.
- The intelligent-query pipeline adds `LIMIT` when missing and rejects any DDL/DML in rookie mode.
- You can inspect every SQL the plugin runs, copy it, edit it and run it again.

---

## How it works

```
dsh-td-studio/
├─ package.json          # DSH bundle metadata (dsh.bundle / dsh.client)
├─ cordis.patch.yml      # Cordis composition patch
├─ icon.svg              # Bundle icon
├─ locale/{en,zh}.json   # Display metadata + detail document mapping
├─ market/index.json     # DSH plugin-market index (format 1)
├─ scripts/
│  └─ build-index.mjs    # Regenerates market/index.json from the current commit
└─ src/
   ├─ host.js            # Node-side plugin: REST proxy, credentials, schema cache,
   │                     # agent tools, system prompt, insights engine
   └─ client.js          # Browser-side plugin: React slots, ECharts, SQL editor,
   │                     # chat tool-card renderers
```

- **Host half** (`src/host.js`) registers routes under `/td-studio/api/*`, agent tools, and a system-prompt section. Credentials never leave the host process.
- **Client half** (`src/client.js`) is loaded through `window.__ModuleLoader__`, registers the `main` panel, the sidebar entry and the `tool.call.toolview` renderers. No bundler and no build step — plain `React.createElement`.
- **Schema cache** is refreshed every 60 seconds and summarized into the agent prompt so the model knows the current databases, tables, columns and tags.

---

## Development

```bash
# syntax check
node --check src/host.js
node --check src/client.js

# regenerate the marketplace index after committing a release
node scripts/build-index.mjs
```

Restart DSH (or use HMR) to load changes. On macOS, quit gracefully:

```bash
osascript -e 'quit app "DeepSeek Harness"'
```

> Avoid `kill -9`: it can corrupt Electron's cookie database.

---

## License

MIT © 2026 wuxinyang
