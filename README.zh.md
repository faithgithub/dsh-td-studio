# dsh-td-studio

[English](README.md) | **中文**

> 作为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件的 TDengine AI 原生智能工作台。

`dsh-td-studio` 把 DeepSeek Harness 变成一个 TDengine 工作台：通过 REST 直连 TDengine，浏览 Schema、执行**只读** SQL、把自然语言转成 SQL 并出图、主动发现异常 —— 全部在 DSH 内完成。同一套 TDengine 能力也注册为 Agent 工具，在对话里以 ECharts / 表格 / 洞察卡片内联呈现。

---

## 功能

| 模块 | 说明 |
|---|---|
| **总览** | AI 规划的看板，使用 Apache ECharts 渲染，自适应 DSH 窗口，仅纵向滚动。 |
| **数据库** | 浏览库、超级表与普通表；查看表结构；SQL 编辑器支持上下文补全（关键字 / 表名 / 字段名，`Tab` 补全，`Cmd/Ctrl+Space` 手动触发）。 |
| **智能查询** | 自然语言 → 结构化 SQL → 图表。六道防幻觉机制：候选表检索、结构化 SQL 生成、静态只读校验、`EXPLAIN` 校验（失败安全降级）、执行限制、结果驱动的图表与数字核对。失败最多自动重试 2 次；SQL 可编辑、可重跑。 |
| **洞察（无问智推）** | 用确定性 SQL + 统计检出突变、趋势、越限、告警聚集四类异常。观察窗口可选 `1h / 6h / 24h / 7d`（默认 `24h`）。LLM 只负责写解读，且解读里的数字必须能在事实里核对。 |
| **对话内工具** | 注册 `td_query`、`td_insights`、`td_list_databases`、`td_list_tables`、`td_desc_table`、`td_connect`、`td_schema_refresh` 等 Agent 工具。结果以 ECharts / 表格 / 洞察卡片内联展示，并提供 **⤢ 全屏** 按钮跳转到对应页面。 |
| **安全** | 凭据使用 AES-256-GCM 加密存储在 `~/.dsh/td-studio/creds.json`；同源 REST 代理；只读约束；小白模式拦截 DDL。 |

---

## 环境要求

- **DeepSeek Harness** `>= 0.2.1-rc.5 < 0.3.0`
- **Node.js** `>= 20`
- **TDengine** 3.x，并开启 REST 接口（默认 `http://<host>:6041`）

> TDengine 3.x 企业版使用 **HTTP Basic Auth**，本插件不支持通过 URL query 传递 `user/password`。

---

## 安装

### 方式 A —— Discover 插件市场

1. 在 DSH 打开 **插件（Plugins）**，启用可选的 **Plugin Market** 组合包（**Discover** 标签默认关闭）。
2. 在 **Discover** 中添加索引地址：

   ```
   https://raw.githubusercontent.com/wuxinyang/dsh-td-studio/main/market/index.json
   ```

3. 搜索 `tdengine`，安装 **dsh-td-studio**，点击 **立即启用**。

### 方式 B —— 通过 Git 安装

在 **插件 → 添加插件** 中粘贴仓库地址：

```
https://github.com/wuxinyang/dsh-td-studio
```

或使用命令行：

```bash
dsh plugin add https://github.com/wuxinyang/dsh-td-studio
```

### 方式 C —— 本地开发链接

```bash
dsh plugin add link:/absolute/path/to/dsh-td-studio
```

安装完成后，在 **插件** 页打开该组合包；若提示 `restart-required`，重启 DSH 即可。

---

## 快速开始

1. 从 DSH 侧边栏打开 **TDengine Studio**。
2. 首次运行且没有任何凭据时，会自动创建演示连接（`localhost:6041`，`root/taosdata`）。
3. 用 **＋ 新连接** 添加你自己的集群：主机、端口、用户名、密码。凭据落盘前会先加密。
4. 在右上角选择数据库，开始浏览。

---

## 在对话里使用

Agent 可以直接调用 TDengine 工具，例如：

- `列出 db_new_energy_demo 里有哪些超级表`
- `查一下最近 24 小时每台风机的平均有功功率趋势`
- `扫描 db_new_energy_demo 最近 7 天的异常`
- `统计今天各站点的告警数量并画柱状图`

工具结果会以卡片内联展示：

- **⤢ 全屏** 跳转到对应页面（洞察 → 洞察页，查询 → SQL 工作台并预填 SQL）。
- 查询卡片提供 **📈 图表 / 📋 数据 / 🧾 SQL** 三个标签。
- 洞察卡片展示严重度、标题、叙述和指标对象。

---

## 默认只读

- 所有生成的 SQL 都会经过静态校验，只允许单条 `SELECT` / `WITH` / `SHOW` / `DESCRIBE` / `EXPLAIN`。
- 智能查询在缺失时自动补 `LIMIT`，小白模式下拒绝任何 DDL/DML。
- 每一条执行的 SQL 都可查看、复制、编辑后重新运行。

---

## 实现结构

```
dsh-td-studio/
├─ package.json          # DSH 组合包元信息（dsh.bundle / dsh.client）
├─ cordis.patch.yml      # Cordis 组合补丁
├─ icon.svg              # 组合包图标
├─ locale/{en,zh}.json   # 展示元信息 + 详情文档映射
├─ market/index.json     # DSH 插件市场索引（format 1）
├─ scripts/
│  └─ build-index.mjs    # 根据当前 commit 重新生成 market/index.json
└─ src/
   ├─ host.js            # Node 侧：REST 代理、凭据、Schema 缓存、
   │                     # Agent 工具、系统提示词、洞察引擎
   └─ client.js          # 浏览器侧：React 插槽、ECharts、SQL 编辑器、
   │                     # 聊天工具卡片渲染器
```

- **宿主半片**（`src/host.js`）注册 `/td-studio/api/*` 路由、Agent 工具和系统提示词片段，凭据始终留在宿主进程内。
- **客户端半片**（`src/client.js`）通过 `window.__ModuleLoader__` 加载，注册 `main` 面板、侧边栏入口和 `tool.call.toolview` 渲染器。无打包、无构建步骤，纯 `React.createElement`。
- **Schema 缓存** 每 60 秒刷新一次，并摘要注入 Agent 提示词，让模型了解当前的库、表、字段和标签。

---

## 开发

```bash
# 语法检查
node --check src/host.js
node --check src/client.js

# 提交发布版本后重新生成市场索引
node scripts/build-index.mjs
```

修改后重启 DSH（或使用 HMR）生效。macOS 上请优雅退出：

```bash
osascript -e 'quit app "DeepSeek Harness"'
```

> 不要使用 `kill -9`，可能损坏 Electron 的 Cookie 数据库。

---

## 许可证

MIT © 2026 wuxinyang
