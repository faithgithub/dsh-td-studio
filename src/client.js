/**
 * dsh-td-studio 浏览器半片。
 *
 * 页面结构：
 *   ├─ 📊 总览  (Dashboard · 自动生成 + AI 创建 Panel)
 *   ├─ 🗂 数据库 (Schema 树 + SQL Editor · 小白/资深双模式)
 *   ├─ 💬 智能查询 (自然语言 → SQL → 执行 → 可视化)
 *   └─ 💡 洞察  (无问智推 · 主动推荐值得关注的分析)
 *
 * 风格：Grafana Dark（深蓝灰 + 荧光蓝主色），CSS 统一 tds- 前缀。
 */

window.__ModuleLoader__.load({
  id: 'dsh-td-studio',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback } = React

    const PANEL_ID = 'td-studio'
    // 聊天卡片 → 全屏工作台的导航：pendingNav 在面板挂载时消费一次
    let pendingNav = null
    let navigateToStudio = null
    const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#6366f1']
    const SQL_KEYWORDS = [
      'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
      'AS', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL', 'ASC', 'DESC',
      'DISTINCT', 'UNION', 'ALL', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
      'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'TRUE', 'FALSE',
      'INTERVAL', 'PARTITION', 'SLIDING', 'FILL', 'NOW', '_wstart', '_wend', '_wduration',
      'COUNT', 'AVG', 'SUM', 'MAX', 'MIN', 'FIRST', 'LAST', 'TOP', 'BOTTOM', 'SPREAD',
      'PERCENTILE', 'APERIODIC', 'MODE', 'UNIQUE', 'TAIL', 'DIFF', 'DERIVATIVE', 'IRATE',
      'MAVG', 'STATECOUNT', 'STATEDURATION', 'ELAPSED', 'HISTOGRAM', 'LAST_ROW',
      'ABS', 'ROUND', 'CAST', 'IFNULL', 'TO_ISO8601', 'TO_UNIXTIMESTAMP', 'TIMEDIFF',
      'SHOW', 'DESCRIBE', 'USE', 'TABLES', 'STABLES', 'DATABASES', 'TAGS', 'TBNAME',
    ]

    /* ============================================================
     * 基础工具
     * ============================================================ */

    const apiBase = '/td-studio/api'
    const proxyBase = '/td-studio/proxy/rest/sql'

    function tdsApi(path, init) {
      return fetch(apiBase + path, init).then(async (r) => {
        const text = await r.text()
        let body
        try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
        if (!r.ok) throw new Error(body.error || ('HTTP ' + r.status))
        return body
      })
    }

    /** POST 并保留非 2xx 的响应体（智能问数需要读取 error.stage） */
    async function tdsPost(path, payload) {
      try {
        const r = await fetch(apiBase + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload || {}),
        })
        const text = await r.text()
        let body
        try { body = text ? JSON.parse(text) : {} } catch { body = { error: text } }
        return { status: r.status, body: body || {} }
      } catch (err) {
        return { status: 0, body: { ok: false, error: { stage: 'network', message: err.message } } }
      }
    }

    function num(v) {
      const n = Number(v)
      return isNaN(n) ? 0 : n
    }

    function cls(...parts) { return parts.filter(Boolean).join(' ') }

    /* ============================================================
     * CSS（DeepSeek Harness 风格 · 统一 tds- 前缀）
     * ============================================================ */

    const CSS = `
    .tds-root { background:transparent; color:#d8d9dd; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; min-height:100%; }
    .tds-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 10px; padding:10px 16px; border-bottom:1px solid #2f3038; background:rgba(12,16,24,.9); backdrop-filter:blur(8px); position:sticky; top:0; z-index:10; }
    .tds-head-left { display:flex; align-items:center; gap:12px; }
    .tds-head-left b { font-size:14px; color:#e5e6eb; font-weight:600; }
    .tds-head-right { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; }
    .tds-connect { background:#232428; color:#d8d9dd; border:1px solid #2f3038; border-radius:4px; padding:4px 10px; font-size:12px; cursor:pointer; min-width:0; max-width:100%; flex-shrink:1; text-overflow:ellipsis; }
    .tds-connect.off { background:#2a2020; border-color:#3a2a2a; color:#d48a8a; }
    .tds-connect.on  { background:#1d2a22; border-color:#2a3a2e; color:#8fd4a6; }
    .tds-mode-toggle { display:flex; background:#232428; border-radius:4px; padding:2px; font-size:12px; }
    .tds-mode-toggle button { padding:4px 10px; border:none; background:transparent; color:#8f9095; cursor:pointer; border-radius:2px; }
    .tds-mode-toggle button.tds-active { background:#e5e6eb; color:#1a1b1f; font-weight:600; }
    .tds-topnav { display:flex; gap:0; border-bottom:1px solid #2f3038; overflow-x:auto; scrollbar-width:none; }
    .tds-topnav::-webkit-scrollbar { display:none; }
    .tds-topnav-tab { padding:10px 20px; cursor:pointer; color:#8f9095; border-bottom:2px solid transparent; font-size:13px; }
    .tds-topnav-tab:hover { color:#d8d9dd; }
    .tds-topnav-tab.tds-active { color:#e5e6eb; border-bottom-color:#3b82f6; }
    .tds-main { padding:16px; width:100%; box-sizing:border-box; max-width:none; margin:0; min-width:0; }
    .tds-loading { display:flex; align-items:center; justify-content:center; padding:40px; color:#8f9095; }
    .tds-empty { padding:30px; text-align:center; color:#5f6065; }
    .tds-btn { background:#3b82f6; color:#fff; border:none; border-radius:4px; padding:8px 16px; font-size:13px; cursor:pointer; font-weight:500; }
    .tds-btn:hover { background:#60a5fa; }
    .tds-btn:disabled { background:#2f3038; color:#5f6065; cursor:not-allowed; }
    .tds-btn-ghost { background:transparent; color:#3b82f6; border:1px solid #3b82f6; }
    .tds-btn-sm { padding:4px 10px; font-size:12px; }
    .tds-input { background:#232428; color:#d8d9dd; border:1px solid #2f3038; border-radius:4px; padding:8px 12px; font-size:13px; width:100%; box-sizing:border-box; }
    .tds-input:focus { outline:none; border-color:#3b82f6; }
    .tds-card { background:#232428; border:1px solid #2f3038; border-radius:6px; padding:14px; }
    .tds-card-title { font-size:13px; color:#d8d9dd; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between; }
    .tds-card-title b { font-weight:600; }

    /* 连接向导 */
    .tds-wizard { width:100%; max-width:520px; box-sizing:border-box; margin:60px auto; padding:30px; }
    .tds-wizard h1 { font-size:20px; color:#e5e6eb; margin-bottom:6px; }
    .tds-wizard p { color:#8f9095; margin-bottom:24px; font-size:13px; }
    .tds-wizard label { display:block; font-size:12px; color:#8f9095; margin-bottom:4px; margin-top:10px; }
    .tds-wizard .tds-row { display:flex; gap:10px; }
    .tds-wizard .tds-row > div { flex:1; }
    .tds-wizard-actions { display:flex; gap:10px; margin-top:20px; }
    .tds-wizard-status { margin-top:16px; padding:10px; border-radius:4px; font-size:12px; }
    .tds-wizard-status.ok { background:#1d2a22; color:#8fd4a6; }
    .tds-wizard-status.err { background:#2a2020; color:#d48a8a; }

    /* Schema 树 */
    .tds-browse-layout { display:flex; gap:16px; }
    .tds-schema-tree { width:280px; background:#232428; border:1px solid #2f3038; border-radius:6px; padding:10px; max-height:calc(100vh - 180px); overflow-y:auto; }
    .tds-tree-node { padding:3px 6px; cursor:pointer; border-radius:3px; font-size:12px; color:#d8d9dd; }
    .tds-tree-node:hover { background:#2f3038; }
    .tds-tree-node.tds-active { background:rgba(59,130,246,.15); color:#60a5fa; }
    .tds-tree-indent { padding-left:14px; }
    .tds-tree-icon { margin-right:5px; }
    .tds-main-panel { flex:1; min-width:0; }

    /* SQL Editor */
    .tds-sql-editor { background:#232428; border:1px solid #2f3038; border-radius:6px; margin-bottom:10px; }
    .tds-sql-toolbar { display:flex; gap:6px; padding:8px; border-bottom:1px solid #2f3038; align-items:center; }
    .tds-sql-textarea { width:100%; min-height:120px; background:#1a1b1f; color:#d8d9dd; border:none; padding:10px; font-family:Menlo,Monaco,"Courier New",monospace; font-size:12px; resize:vertical; outline:none; }
    .tds-sql-meta { padding:6px 10px; font-size:11px; color:#5f6065; border-top:1px solid #2f3038; }
    .tds-sql-wrap { position:relative; }
    .tds-autocomplete { position:absolute; left:10px; top:100%; z-index:30; min-width:220px; max-width:360px; max-height:200px; overflow-y:auto; background:#1a1b1f; border:1px solid #3a3b40; border-radius:4px; box-shadow:0 6px 18px rgba(0,0,0,.45); padding:4px 0; }
    .tds-ac-item { padding:5px 12px; font-family:Menlo,Monaco,monospace; font-size:12px; color:#c8cad0; cursor:pointer; white-space:nowrap; }
    .tds-ac-item:hover, .tds-ac-item.tds-ac-active { background:rgba(59,130,246,.18); color:#60a5fa; }
    .tds-ac-kind { color:#5f6065; font-size:10px; margin-left:8px; }
    .tds-result-table { width:100%; border-collapse:collapse; font-size:12px; }
    .tds-result-table th { background:#2f3038; color:#8f9095; padding:6px 10px; text-align:left; font-weight:500; position:sticky; top:0; }
    .tds-result-table td { padding:4px 10px; border-top:1px solid #232428; font-family:Menlo,Monaco,monospace; color:#d8d9dd; word-break:break-all; }
    .tds-result-table tr:hover td { background:#232428; }
    .tds-result-wrap { max-height:360px; overflow:auto; border:1px solid #2f3038; border-radius:4px; }

    /* 点选式查询表单（小白模式） */
    .tds-form-query { display:flex; flex-direction:column; gap:10px; }
    .tds-form-row { display:flex; gap:10px; align-items:flex-end; }
    .tds-form-row > div { flex:1; }
    .tds-form-chips { display:flex; gap:6px; flex-wrap:wrap; }
    .tds-chip { background:#2f3038; border:1px solid #3a3b40; border-radius:14px; padding:4px 10px; font-size:11px; cursor:pointer; color:#8f9095; }
    .tds-chip.tds-active { background:rgba(59,130,246,.15); border-color:#3b82f6; color:#60a5fa; }

    /* Chat */
    .tds-chat { max-width:900px; margin:0 auto; }
    .tds-chat-messages { display:flex; flex-direction:column; gap:12px; margin-bottom:20px; }
    .tds-chat-msg { background:#232428; border:1px solid #2f3038; border-radius:6px; padding:12px; color:#d8d9dd; }
    .tds-chat-msg.tds-user { background:#1e2735; border-color:#3b82f6; }
    .tds-chat-msg-head { display:flex; gap:8px; font-size:11px; color:#5f6065; margin-bottom:6px; }
    .tds-chat-input { display:flex; gap:10px; align-items:flex-end; }
    .tds-chat-input textarea { flex:1; min-height:60px; }

    /* 智能问数 */
    .tds-ask { width:100%; max-width:1100px; margin:0 auto; display:flex; flex-direction:column; gap:14px; }
    .tds-ask-head { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; }
    .tds-ask-sub { margin-left:8px; font-size:11px; color:#6b7280; }
    .tds-ask-range { display:flex; gap:6px; align-items:center; font-size:11px; color:#6b7280; }
    .tds-ask-list { display:flex; flex-direction:column; gap:14px; }
    .tds-ask-presets { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
    .tds-ask-q { align-self:flex-end; max-width:80%; box-sizing:border-box; padding:8px 12px; border-radius:10px; font-size:13px;
      background:rgba(59,130,246,.14); border:1px solid rgba(59,130,246,.4); color:#dbeafe; }
    .tds-ask-card { background:linear-gradient(160deg,rgba(10,32,58,.85),rgba(6,18,36,.85)); border:1px solid rgba(0,190,255,.14); border-radius:10px; padding:14px; min-width:0; }
    .tds-ask-answer { font-size:13px; line-height:1.6; color:#d8d9dd; margin-bottom:10px; }
    .tds-ask-tabs { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
    .tds-ask-tab { background:transparent; border:1px solid #2f3038; color:#8f9095; border-radius:6px; padding:3px 10px; font-size:12px; cursor:pointer; }
    .tds-ask-tab.tds-active { border-color:#00c8ff; color:#00c8ff; background:rgba(0,200,255,.08); }
    .tds-ask-chart { min-height:200px; }
    .tds-ask-stat { display:flex; align-items:baseline; justify-content:center; padding:26px 0; }
    .tds-ask-sqlbox { width:100%; box-sizing:border-box; font-family:Menlo,Monaco,monospace; font-size:12px; line-height:1.5;
      background:#1a1b1f; color:#cfe9ff; border:1px solid #2f3038; border-radius:6px; padding:10px; resize:vertical; }
    .tds-ask-sql-actions { display:flex; gap:8px; margin-top:8px; }
    .tds-ask-meta { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-top:10px; font-size:11px; color:#6b7280; }
    .tds-ask-badge { border:1px solid #2f3038; border-radius:10px; padding:1px 8px; }
    .tds-ask-badge.ok { color:#10b981; border-color:rgba(16,185,129,.4); }
    .tds-ask-badge.warn { color:#f59e0b; border-color:rgba(245,158,11,.4); }
    .tds-ask-assume { margin-top:8px; font-size:11px; color:#8f9095; }
    .tds-ask-error { border:1px solid rgba(239,68,68,.4); background:rgba(239,68,68,.08); color:#fca5a5;
      border-radius:8px; padding:10px; font-size:12px; word-break:break-word; }
    .tds-ask-clarify { border:1px solid rgba(245,158,11,.4); background:rgba(245,158,11,.08); color:#fcd34d;
      border-radius:8px; padding:10px; font-size:12px; }
    .tds-ask-loading { font-size:12px; color:#8f9095; padding:4px 0; }
    .tds-ask-input { display:flex; gap:10px; align-items:flex-end; }
    .tds-ask-input textarea { flex:1; min-height:56px; box-sizing:border-box; }
    .tds-ask-table { max-height:340px; }

    /* 洞察（无问智推） */
    .tds-insights { display:flex; flex-direction:column; gap:12px; }
    .tds-insight-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 12px; padding:10px 14px;
      background:rgba(10,32,58,.7); border:1px solid rgba(0,190,255,.14); border-radius:10px; }
    .tds-insight-head-left { display:flex; align-items:center; gap:10px; flex-wrap:wrap; min-width:0; }
    .tds-insight-head-left b { font-size:14px; color:#e6f2ff; }
    .tds-insight-sub { font-size:11px; color:#6b7280; }
    .tds-insight-filters { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .tds-insight-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
    .tds-insight-card { position:relative; display:flex; flex-direction:column; gap:8px; min-width:0;
      background:linear-gradient(160deg,rgba(10,32,58,.85),rgba(6,18,36,.85)); border:1px solid rgba(0,190,255,.14);
      border-radius:10px; padding:12px 14px 12px 18px; }
    .tds-insight-card::before { content:''; position:absolute; left:0; top:10px; bottom:10px; width:4px; border-radius:4px; background:var(--bar,#eab308); }
    .tds-insight-top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
    .tds-insight-kind { font-size:10px; padding:1px 7px; border-radius:8px; background:rgba(0,120,255,.12); color:#7fb6e8; }
    .tds-insight-sev { margin-left:auto; font-size:11px; font-weight:600; color:#d8d9dd; font-variant-numeric:tabular-nums; }
    .tds-insight-title { font-size:14px; font-weight:600; color:#e6f2ff; }
    .tds-insight-narrative { font-size:12px; line-height:1.6; color:#b8c2cf; }
    .tds-insight-facts { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:#8f9095; }
    .tds-insight-facts b { color:#cfe9ff; font-weight:600; font-variant-numeric:tabular-nums; }
    .tds-insight-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:2px; align-items:center; }
    .tds-insight-actions button { background:transparent; border:1px solid #2f3038; color:#9db4cc; border-radius:6px; padding:3px 10px; font-size:11px; cursor:pointer; }
    .tds-insight-actions button:hover { border-color:#00c8ff; color:#00c8ff; }
    .tds-insight-actions button.tds-danger:hover { border-color:rgba(239,68,68,.6); color:#fca5a5; }
    .tds-insight-detail { width:min(900px,100%); max-height:86vh; overflow-y:auto; }
    .tds-insight-factgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin:10px 0; }
    .tds-insight-fact { background:#1a1b1f; border:1px solid #2f3038; border-radius:6px; padding:8px 10px; }
    .tds-insight-fact span { display:block; font-size:10px; color:#6b7280; margin-bottom:2px; }
    .tds-insight-fact b { font-size:14px; color:#cfe9ff; font-variant-numeric:tabular-nums; }
    .tds-insight-section { font-size:11px; color:#6b7280; margin:12px 0 6px; }

    /* 根容器：仅纵向滚动，宽度跟随宿主窗口（不产生横向滚动条） */
    .tds-root { background:transparent; color:#d8d9dd; font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; height:100%; width:100%; min-width:0; min-height:0; flex:1 1 auto; align-self:stretch; overflow-y:auto; overflow-x:hidden; box-sizing:border-box; padding:0; }

    /* Dashboard — 参考 dsh-td-power 的 Card 风格（蓝调细边框 + 渐变） */
    .tds-dash-header { display:flex; flex-wrap:wrap; gap:8px 10px; align-items:center; margin-bottom:14px; padding:10px 14px; background:rgba(10,32,58,.88); border:1px solid rgba(0,190,255,.14); border-radius:10px; }
    /* 24 列等分宽度：跟随宿主窗口自适应，不产生横向滚动 */
    .tds-dash-grid { display:grid; grid-template-columns:repeat(24, minmax(0, 1fr)); grid-auto-rows:48px; gap:10px; padding-bottom:24px; width:100%; box-sizing:border-box; }
    .tds-panel { background:linear-gradient(160deg,rgba(10,32,58,.88),rgba(6,18,36,.88)); border:1px solid rgba(0,190,255,.14); border-radius:10px; padding:10px 14px 14px; position:relative; min-width:0; container-type:inline-size; box-shadow:inset 0 0 24px rgba(0,120,255,.06); display:flex; flex-direction:column; }
    .tds-panel:hover { border-color:rgba(0,190,255,.32) }
    .tds-panel:hover .tds-panel-actions { opacity:1 }
    .tds-panel-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex:none }
    .tds-panel-head b { font-size:13px; font-weight:600; color:#cfe9ff; padding-left:10px; border-left:3px solid #00c8ff; letter-spacing:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
    .tds-panel-actions { display:flex; gap:2px; opacity:0; transition:opacity .15s }
    .tds-panel-actions button { background:transparent; border:1px solid transparent; color:#7ea6c9; width:22px; height:22px; border-radius:3px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; justify-content:center; line-height:1; padding:0 }
    .tds-panel-actions button:hover { background:rgba(0,150,255,.15); color:#fff; border-color:rgba(0,190,255,.4) }
    .tds-panel-actions button.tds-danger:hover { background:rgba(255,120,120,.15); color:#ff9c9c; border-color:rgba(255,92,92,.4) }
    .tds-panel-type-badge { font-size:10px; color:#6f95b8; padding:1px 6px; background:rgba(0,120,255,.08); border-radius:8px; letter-spacing:.5px }
    /* 面板 body 撑满剩余空间 */
    .tds-panel > :not(.tds-panel-head) { flex:1; min-height:0; overflow:hidden }

    /* Stat 面板 — 居中大数字 */
    .tds-stat { font-size:clamp(18px, 3.4vw, 34px); font-weight:600; color:#00d4ff; font-variant-numeric:tabular-nums; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis }
    .tds-stat-unit { font-size:12px; color:#6f95b8; margin-left:4px; font-weight:400 }
    .tds-stat-wrap { display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; gap:2px; text-shadow:0 0 16px rgba(0,212,255,.35) }
    /* 面板变窄时（宿主窗口缩小）自动缩小关键数字，避免被裁切 */
    @container (max-width: 200px) { .tds-stat { font-size:19px } .tds-stat-unit { font-size:10px } }
    @container (max-width: 140px) { .tds-stat { font-size:15px } }

    /* Chart 基础样式 + 图例（参考 .tdp-chart / .tdp-legend） */
    .tds-chart { width:100%; overflow:hidden }
    .tds-chart svg { display:block }
    .tds-chart-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:#a8c8e6; padding-left:44px; margin-top:4px }
    .tds-chart-legend i { display:inline-block; width:10px; height:3px; border-radius:2px; margin-right:5px; vertical-align:middle; background:#00d4ff }
    /* 方案预览态 */
    .tds-plan-preview { background:#1e1f23; border:1px solid #2f3038; border-radius:6px; padding:14px; margin-bottom:14px; }
    .tds-plan-preview-title { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:4px; }
    .tds-plan-preview-title b { font-size:15px; color:#e5e6eb; font-weight:600; }
    .tds-plan-preview-desc { color:#8f9095; font-size:12px; margin-bottom:12px; }
    .tds-plan-preview-list { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px; margin-bottom:12px; }
    .tds-plan-preview-item { background:#232428; border:1px solid #2f3038; border-radius:4px; padding:10px 12px; display:flex; align-items:flex-start; gap:8px; }
    .tds-plan-preview-item .tds-type-tag { font-size:10px; padding:2px 6px; border-radius:3px; flex-shrink:0; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
    .tds-type-stat { background:rgba(59,130,246,.15); color:#60a5fa; }
    .tds-type-line { background:rgba(16,185,129,.15); color:#34d399; }
    .tds-type-table { background:rgba(245,158,11,.15); color:#fbbf24; }
    .tds-plan-preview-item .tds-pp-title { font-size:12px; color:#d8d9dd; font-weight:500; margin-bottom:2px; }
    .tds-plan-preview-item .tds-pp-sql { font-family:Menlo,Monaco,monospace; font-size:10px; color:#5a6478; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px; }
    .tds-plan-preview-actions { display:flex; gap:8px; justify-content:flex-end; }

    /* 总览 · AI 规划 */
    .tds-overview-empty { width:100%; max-width:620px; box-sizing:border-box; margin:56px auto; padding:34px 30px; text-align:center; background:#1e1f23; border:1px dashed #3a3b40; border-radius:10px; }
    .tds-hero-icon { font-size:42px; line-height:1; margin-bottom:12px; }
    .tds-overview-empty h2 { font-size:18px; color:#e5e6eb; margin:0 0 8px; }
    .tds-overview-empty p { color:#8f9095; font-size:13px; margin:0 0 8px; }
    .tds-overview-empty .tds-hero-sub { color:#5f6065; font-size:12px; margin:0 0 20px; }
    .tds-plan-steps { margin-top:14px; font-size:12px; color:#5a6478; }
    .tds-plan-badge { background:rgba(59,130,246,.15); color:#60a5fa; border-radius:4px; padding:3px 8px; font-size:11px; font-weight:600; }
    .tds-plan-chat { margin-top:14px; background:#1e1f23; border:1px solid #2f3038; border-radius:8px; padding:12px; }
    .tds-plan-msgs { display:flex; flex-direction:column; gap:8px; max-height:200px; overflow-y:auto; margin-bottom:10px; }
    .tds-plan-msg { font-size:12px; line-height:1.6; padding:8px 10px; border-radius:6px; max-width:88%; background:#26272c; color:#c8cad0; }
    .tds-plan-msg.user { align-self:flex-end; background:#1e2735; color:#dbe6f5; }
    .tds-plan-msg.ai { align-self:flex-start; }
    .tds-suggest-chips { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
    .tds-plan-input { display:flex; gap:8px; align-items:center; }

    /* AI 重画弹窗 */
    .tds-modal-mask { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:200; padding:16px; }
    .tds-modal { width:min(520px, 100%); box-sizing:border-box; background:#1e1f23; border:1px solid #3a3b40; border-radius:10px; padding:18px; box-shadow:0 24px 64px rgba(0,0,0,.55); }
    .tds-modal-title { font-size:14px; font-weight:600; color:#e5e6eb; margin-bottom:6px; }
    .tds-modal-desc { font-size:12px; color:#8f9095; margin-bottom:10px; }
    .tds-modal-textarea { min-height:96px; resize:vertical; margin-bottom:12px; font-family:inherit; line-height:1.5; }
    .tds-modal-actions { display:flex; gap:8px; align-items:center; justify-content:flex-end; }
    .tds-modal-hint { margin-right:auto; font-size:11px; color:#5f6065; }

    /* 洞察 */
    .tds-insights { display:flex; flex-direction:column; gap:12px; }
    .tds-insight-card { background:#232428; border:1px solid #2f3038; border-radius:6px; padding:14px; display:flex; gap:14px; align-items:flex-start; }
    .tds-insight-badge { background:rgba(59,130,246,.15); color:#60a5fa; border-radius:4px; padding:3px 8px; font-size:11px; font-weight:600; flex-shrink:0; }
    .tds-insight-body { flex:1; }
    .tds-insight-body b { font-size:13px; color:#e5e6eb; display:block; margin-bottom:4px; }
    .tds-insight-body p { color:#8f9095; font-size:12px; margin:0 0 6px; }
    .tds-insight-body .tds-sub { color:#5f6065; font-size:11px; }

    /* Alert */
    .tds-alert { background:#2a2020; border:1px solid #3a2a2a; color:#d48a8a; border-radius:4px; padding:10px; font-size:12px; margin:8px 0; }
    .tds-alert.ok { background:#1d2a22; border-color:#2a3a2e; color:#8fd4a6; }

    /* 图表基础样式 */
    .tds-chart { width:100%; height:100%; overflow:hidden; }
    .tds-chart svg { width:100%; height:100%; }
    .tds-chart text { fill:#5f6065; font-size:10px; }

    /* 聊天内联工具卡片（tool.call.toolview） */
    .tds-tool { border:.5px solid #2f3038; border-radius:8px; background:#1b1c20; color:#c8cad0; margin:4px 0; overflow:hidden; font-size:12px; }
    .tds-tool-head { display:flex; align-items:center; gap:8px; padding:8px 12px; cursor:pointer; user-select:none; }
    .tds-tool-head:hover { background:#202126; }
    .tds-tool-dot { width:7px; height:7px; border-radius:50%; background:#3b82f6; flex:none; }
    .tds-tool-dot.running { background:#f59e0b; animation:tds-pulse 1.1s ease-in-out infinite; }
    .tds-tool-dot.error { background:#ef4444; }
    .tds-tool-dot.ok { background:#10b981; }
    @keyframes tds-pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
    .tds-tool-name { font-weight:600; color:#e5e6eb; flex:none; }
    .tds-tool-sum { color:#7a7c82; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }
    .tds-tool-chev { color:#5f6065; flex:none; transition:transform .12s; }
    .tds-tool-chev.open { transform:rotate(90deg); }
    .tds-tool-open { flex:none; border:.5px solid #34353b; background:#232428; color:#9aa0aa; border-radius:5px; padding:2px 8px; font-size:11px; line-height:16px; cursor:pointer; opacity:.85; }
    .tds-tool-open:hover { color:#dbe6f5; border-color:#3b82f6; background:#1e2735; opacity:1; }
    .tds-tool-body { padding:0 12px 12px; }
    .tds-tool-tabs { display:flex; gap:6px; margin:2px 0 8px; flex-wrap:wrap; }
    .tds-tool-tab { border:.5px solid #34353b; background:#232428; color:#8f9095; border-radius:5px; padding:3px 10px; font-size:11px; cursor:pointer; }
    .tds-tool-tab.active { color:#dbe6f5; border-color:#3b82f6; background:#1e2735; }
    .tds-tool-table-wrap { max-height:300px; overflow:auto; border:.5px solid #2a2b30; border-radius:6px; }
    .tds-tool-table { width:100%; border-collapse:collapse; font-size:11px; }
    .tds-tool-table th { position:sticky; top:0; background:#232428; color:#9aa0aa; font-weight:600; text-align:left; }
    .tds-tool-table th, .tds-tool-table td { padding:5px 10px; border-bottom:.5px solid #2a2b30; white-space:nowrap; }
    .tds-tool-table td { color:#c8cad0; }
    .tds-tool-sql { background:#15161a; border:.5px solid #2a2b30; border-radius:6px; padding:8px 10px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; color:#9ecbff; white-space:pre-wrap; word-break:break-word; max-height:160px; overflow:auto; }
    .tds-tool-err { color:#d48a8a; background:#2a2020; border:.5px solid #3a2a2a; border-radius:6px; padding:8px 10px; font-size:12px; }
    .tds-tool-empty { color:#7a7c82; font-size:12px; padding:8px 0; }
    .tds-tool-insight { border:.5px solid #2a2b30; border-radius:6px; padding:8px 10px; margin-bottom:6px; background:#202126; }
    .tds-tool-insight-head { display:flex; align-items:center; gap:8px; }
    .tds-tool-insight-title { font-size:12px; color:#e5e6eb; font-weight:600; }
    .tds-tool-insight p { margin:4px 0 0; color:#8f9095; font-size:11px; line-height:1.5; }
    .tds-tool-meta { display:flex; gap:12px; color:#7a7c82; font-size:11px; margin-bottom:8px; flex-wrap:wrap; }

    /* 隐藏 */
    .tds-hidden { display:none !important; }
    `

    function installStyle() {
      if (typeof document === 'undefined') return () => {}
      const id = 'dsh-td-studio-style'
      if (document.getElementById(id)) return () => {}
      const el = document.createElement('style')
      el.id = id
      el.textContent = CSS
      document.head.appendChild(el)
      return () => { el.remove() }
    }

    /* ============================================================
     * 错误边界
     * ============================================================ */

    class Boundary extends React.Component {
      constructor(p) { super(p); this.state = { err: null } }
      static getDerivedStateFromError(err) { return { err } }
      componentDidCatch(err, info) { console.error('[tds-boundary]', err, info) }
      render() {
        if (this.state.err) return h('div', { className: 'tds-alert' }, '组件渲染异常：' + this.state.err.message)
        return this.props.children
      }
    }

    /* ============================================================
     * 图标（SVG inline）
     * ============================================================ */

    function StudioIcon(props) {
      const size = (props && props.size) || 16
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('rect', { x: 3, y: 3, width: 7, height: 7 }),
        h('rect', { x: 14, y: 3, width: 7, height: 7 }),
        h('rect', { x: 3, y: 14, width: 7, height: 7 }),
        h('path', { d: 'M14 17.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0' }))
    }

    /* ============================================================
     * ECharts 动态加载 + 封装（CDN 方式，宿主无 npm 包时用全局变量）
     * ============================================================ */

    let _echartsLoading = null
    function loadECharts() {
      if (window.echarts) return Promise.resolve(window.echarts)
      if (_echartsLoading) return _echartsLoading
      _echartsLoading = new Promise((resolve, reject) => {
        const existing = document.getElementById('tds-echarts-cdn')
        if (existing) {
          existing.addEventListener('load', () => resolve(window.echarts), { once: true })
          existing.addEventListener('error', () => reject(new Error('ECharts CDN 加载失败')), { once: true })
          return
        }
        const s = document.createElement('script')
        s.id = 'tds-echarts-cdn'
        s.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js'
        s.async = true
        s.onload = () => resolve(window.echarts)
        s.onerror = () => reject(new Error('ECharts CDN 加载失败，请检查网络'))
        document.head.appendChild(s)
      }).catch((err) => {
        _echartsLoading = null
        throw err
      })
      return _echartsLoading
    }

    /** Grafana dark 风格 palette / 基础 option 模板 */
    const ECHARTS_THEME = {
      palette: ['#00c8ff', '#3b82f6', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'],
      textStyle: { color: '#cfe9ff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' },
    }

    function StatChart({ value, unit, thresholds }) {
      return h('div', { className: 'tds-stat-wrap' },
        h('span', { className: 'tds-stat' }, fmt2(value)),
        unit ? h('span', { className: 'tds-stat-unit' }, unit) : null)
    }

    /** 坐标轴刻度：大数字用万/亿，避免窄图里被裁切 */
    function axisNum(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return ''
      const abs = Math.abs(n)
      if (abs >= 1e8) return String(Math.round(n / 1e7) / 10) + '亿'
      if (abs >= 1e4) return String(Math.round(n / 1e2) / 100) + '万'
      return fmt2(n)
    }

    /** [列定义, 行数组] → [{列名: 值}]，给 ECharts 用 */
    function rowsToObjects(columns, rows) {
      const cols = columns || []
      return (rows || []).map((r) => {
        const o = {}
        for (let i = 0; i < cols.length; i++) o[cols[i].name] = r[i]
        return o
      })
    }

    function GaugeChart({ value, min = 0, max = 100, title = '' }) {
      // 仪表盘（echarts）
      const ref = useRef(null)
      useEffect(() => {
        let inst
        loadECharts().then((ec) => {
          if (!ref.current) return
          inst = ec.init(ref.current, null, { renderer: 'canvas' })
          const opt = {
            backgroundColor: 'transparent',
            series: [{
              type: 'gauge', startAngle: 200, endAngle: -20,
              min, max,
              progress: { show: true, width: 10, itemStyle: { color: '#00c8ff' } },
              axisLine: { lineStyle: { width: 10, color: [[1, 'rgba(0,190,255,.18)']] } },
              pointer: { show: false },
              axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
              title: { offsetCenter: [0, '70%'], color: '#a8c8e6', fontSize: 12 },
              detail: { offsetCenter: [0, '40%'], color: '#00d4ff', fontSize: 28, fontWeight: 600, formatter: '{value}' },
              data: [{ value: num(value), name: title }],
            }],
          }
          inst.setOption(opt)
          const ro = new ResizeObserver(() => inst && inst.resize())
          ro.observe(ref.current)
          inst.__ro = ro
          return () => { ro.disconnect(); inst?.dispose(); inst = null }
        }).catch(() => {})
        return () => { inst?.dispose(); inst = null }
      }, [value, min, max, title])
      return h('div', { ref, style: { width: '100%', height: '100%', minHeight: 120 } })
    }

    /* 小工具：保留最多两位小数（整数不补零，小数保留最多两位） */
    function fmt2(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return v == null ? v : String(v)
      const rounded = Math.round(n * 100) / 100
      // 整数不加 .00，小数不补尾零
      return String(rounded)
    }

    /** SVG 自绘折线图（echarts 不可用时降级用）*/
    function LineChartFallback({ rows, xField, series, height = 200 }) {
      const ref = useRef(null)
      const [w, setW] = useState(520)
      useEffect(() => {
        if (!ref.current || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver((entries) => { setW(Math.max(260, entries[0]?.contentRect.width || 520)) })
        ro.observe(ref.current)
        return () => ro.disconnect()
      }, [])
      const sList = (series || []).filter(Boolean)
      if (!Array.isArray(rows) || !rows.length || !sList.length) return h('div', { ref }, h('div', { className: 'tds-empty' }, '无数据'))
      const PL = 44, PR = 14, PT = 10, PB = 26
      const iw = w - PL - PR, ih = height - PT - PB
      const n = rows.length
      const xs = rows.map((r) => { const v = r[xField]; if (v == null) return ''; const s = String(v); return s.length > 10 ? s.slice(5, 16).replace('T', ' ') : s })
      const allVals = []
      sList.forEach((s) => rows.forEach((r) => allVals.push(num(r[s.field]))))
      let yMin = Math.min(0, ...allVals), yMax = Math.max(1, ...allVals)
      if (yMin >= yMax) { yMax = yMin + 1 }
      const yRange = yMax - yMin || 1
      const xAt = (i) => PL + (iw * i) / Math.max(1, n - 1)
      const yAt = (v) => PT + ih - (ih * (num(v) - yMin)) / yRange
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + yRange * t)
      const labelIdx = []
      for (let k = 0; k < 6; k++) { const i = Math.round(((n - 1) * k) / 5); if (!labelIdx.includes(i)) labelIdx.push(i) }
      const children = []
      ticks.forEach((t, i) => {
        const y = yAt(t)
        children.push(h('line', { key: 'g' + i, x1: PL, x2: w - PR, y1: y, y2: y, stroke: '#5a6478', strokeOpacity: 0.18, strokeDasharray: '3 4' }))
        children.push(h('text', { key: 't' + i, x: PL - 6, y: y + 3.5, textAnchor: 'end', fontSize: 10, fill: '#6b6f78' }, fmt2(t)))
      })
      labelIdx.forEach((i, k) => children.push(h('text', { key: 'x' + k, x: xAt(i), y: height - 8, textAnchor: 'middle', fontSize: 10, fill: '#6b6f78' }, xs[i])))
      children.push(h('line', { key: 'bx', x1: PL, x2: w - PR, y1: PT + ih, y2: PT + ih, stroke: '#3a3b40' }))
      sList.forEach((s, si) => {
        const color = s.color || ECHARTS_THEME.palette[si % ECHARTS_THEME.palette.length]
        let d = ''
        for (let i = 0; i < n; i++) { d += (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ' ' + yAt(rows[i][s.field]).toFixed(1) + ' ' }
        const area = d + `L${xAt(n - 1).toFixed(1)} ${yAt(yMin).toFixed(1)} L${xAt(0).toFixed(1)} ${yAt(yMin).toFixed(1)} Z`
        children.push(h('path', { key: 'a' + si, d: area, fill: color, fillOpacity: 0.1 }))
        children.push(h('path', { key: 'l' + si, d, fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinejoin: 'round', strokeLinecap: 'round' }))
      })
      return h('div', { ref, style: { width: '100%', height: height + 'px' } },
        h('svg', { width: w, height, viewBox: `0 0 ${w} ${height}` }, children),
        sList.length > 1 ? h('div', { className: 'tds-chart-legend' }, sList.map((s, i) => h('span', { key: i },
          h('i', { style: { background: s.color || ECHARTS_THEME.palette[i % ECHARTS_THEME.palette.length] } }), s.name || s.field))) : null)
    }

    function LineChart({ rows, xField, series, height = 220, chartType = 'line' }) {
      const ref = useRef(null)
      const instRef = useRef(null)
      const [useFallback, setUseFallback] = useState(false)
      const [initTick, setInitTick] = useState(0)

      // mount 时 init echarts + ResizeObserver
      useEffect(() => {
        let cancelled = false
        function initEcharts() {
          if (!ref.current || cancelled) return
          try {
            instRef.current = window.echarts.init(ref.current, null, { renderer: 'canvas' })
            const onResize = () => instRef.current && instRef.current.resize()
            window.addEventListener('resize', onResize)
            const ro = new ResizeObserver(() => instRef.current && instRef.current.resize())
            ro.observe(ref.current)
            instRef.current.__ro = ro
            instRef.current.__onResize = onResize
            setInitTick((x) => x + 1)
          } catch (e) {
            console.warn('[tds] echarts init failed, fallback:', e.message)
            setUseFallback(true)
          }
        }

        if (window.echarts && typeof window.echarts.init === 'function') { initEcharts() }
        else {
          loadECharts().then(() => { if (!cancelled && window.echarts) initEcharts() })
            .catch((e) => { console.warn('[tds] echarts load failed, fallback:', e.message); setUseFallback(true) })
        }

        return () => {
          cancelled = true
          if (instRef.current) {
            try { instRef.current.__ro?.disconnect?.() } catch {}
            try { instRef.current.__onResize && window.removeEventListener('resize', instRef.current.__onResize) } catch {}
            try { instRef.current.dispose() } catch {}
            instRef.current = null
          }
        }
      }, [])

      // rows/series/initTick 变化时 setOption（都是最新 props，新闭包）
      useEffect(() => {
        if (!instRef.current) return
        const sList = (series || []).filter(Boolean)
        if (!Array.isArray(rows) || !rows.length || !sList.length) { try { instRef.current.clear() } catch {} return }
        const xs = rows.map((r) => {
          const v = r[xField]; if (v == null) return ''
          const s = String(v); return s.length > 10 ? s.slice(5, 16).replace('T', ' ') : s
        })
        const seriesData = sList.map((s, i) => {
          const color = s.color || ECHARTS_THEME.palette[i % ECHARTS_THEME.palette.length]
          const item = {
            name: s.name || s.field || ('series' + (i + 1)),
            type: chartType === 'bar' ? 'bar' : 'line',
            itemStyle: { color },
            emphasis: { focus: 'series' },
            data: rows.map((r) => num(r[s.field])),
          }
          if (chartType === 'bar') {
            item.barMaxWidth = 32
          } else {
            item.smooth = true
            item.symbol = 'circle'
            item.symbolSize = 4
            item.showSymbol = false
            item.lineStyle = { width: 1.8, color }
            item.areaStyle = { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
              { offset: 0, color: color + '44' },
              { offset: 1, color: color + '02' } ] } }
          }
          return item
        })
        try {
          instRef.current.setOption({
            backgroundColor: 'transparent',
            tooltip: {
              trigger: 'axis',
              backgroundColor: 'rgba(10,32,58,.96)',
              borderColor: 'rgba(0,190,255,.28)',
              textStyle: { color: '#e5e6eb', fontSize: 12 },
              axisPointer: { type: 'cross', lineStyle: { color: 'rgba(0,190,255,.35)', width: 1 } },
              formatter: function(params) {
                if (!Array.isArray(params)) params = [params]
                let html = `<div style="color:#cfe9ff;font-size:11px;margin-bottom:4px">${params[0].axisValue}</div>`
                params.forEach((p) => {
                  html += `<div style="display:flex;gap:8px;font-size:12px;color:#e5e6eb">${p.marker}${p.seriesName} <span style="margin-left:auto;color:#a8c8e6">${fmt2(p.value)}</span></div>`
                })
                return html
              },
            },
            legend: { show: sList.length > 1, top: 4, right: 8, textStyle: { color: '#a8c8e6', fontSize: 11 }, itemWidth: 10, itemHeight: 3, icon: 'rect' },
            grid: { top: 30, right: 12, bottom: 28, left: 46 },
            xAxis: { type: 'category', boundaryGap: chartType === 'bar', data: xs, axisLine: { lineStyle: { color: '#3a3b40' } }, axisTick: { show: false }, axisLabel: { color: '#6b6f78', fontSize: 10 } },
            yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#6b6f78', fontSize: 10, formatter: (v) => axisNum(v) }, splitLine: { lineStyle: { color: 'rgba(90,100,120,.18)', type: 'dashed' } } },
            dataZoom: [{ type: 'inside', start: 0, end: 100, zoomOnMouseWheel: 'shift', moveOnMouseWheel: false }],
            series: seriesData,
          }, true)
        } catch (e) { console.warn('[tds] echarts setOption failed:', e.message) }
      }, [rows, xField, series, initTick, chartType])

      // fallback 只用 useState 驱动（只在 init 明确失败后才切过去）
      if (useFallback) return h(LineChartFallback, { rows, xField, series, height })
      // 始终渲染 ref 容器 div（等 useEffect 里 init 填充）
      return h('div', { ref, style: { width: '100%', height: height + 'px' } })
    }

    function BarChart({ items, height = 180, vertical = true }) {
      if (!Array.isArray(items) || !items.length) return h('div', { className: 'tds-empty' }, '无数据')
      const w = 400, chartH = height
      const pad = { top: 10, right: 10, bottom: 32, left: 70 }
      const innerW = w - pad.left - pad.right
      const innerH = chartH - pad.top - pad.bottom
      const max = Math.max(...items.map((i) => num(i.value))) || 1

      if (vertical) {
        const bw = innerW / items.length * 0.7
        return h('div', { className: 'tds-chart' },
          h('svg', { viewBox: `0 0 ${w} ${chartH}` },
            items.map((it, i) => {
              const bh = (num(it.value) / max) * innerH
              const bx = pad.left + (innerW / items.length) * i + (innerW / items.length - bw) / 2
              const by = pad.top + innerH - bh
              return h('g', { key: i },
                h('rect', { x: bx, y: by, width: bw, height: bh, fill: COLORS[i % COLORS.length], rx: 2 }),
                h('text', { x: bx + bw / 2, y: chartH - pad.bottom + 14, textAnchor: 'middle', fontSize: 9, fill: '#8a93a6' }, it.name))
            })))
      }
      // horizontal
      const bh = innerH / items.length * 0.6
      return h('div', { className: 'tds-chart' },
        h('svg', { viewBox: `0 0 ${w} ${chartH}` },
          items.map((it, i) => {
            const bw = (num(it.value) / max) * innerW
            const by = pad.top + (innerH / items.length) * i + (innerH / items.length - bh) / 2
            return h('g', { key: i },
              h('text', { x: pad.left - 6, y: by + bh / 2 + 3, textAnchor: 'end', fontSize: 9, fill: '#8a93a6' }, it.name),
              h('rect', { x: pad.left, y: by, width: bw, height: bh, fill: COLORS[i % COLORS.length], rx: 2 }))
          })))
    }

    function PieChart({ items, size = 160 }) {
      if (!Array.isArray(items) || !items.length) return h('div', { className: 'tds-empty' }, '无数据')
      const cx = size / 2, cy = size / 2, r = size / 2 - 8
      const total = items.reduce((s, i) => s + num(i.value), 0) || 1
      let start = -Math.PI / 2
      const paths = items.map((it, i) => {
        const frac = num(it.value) / total
        const angle = frac * Math.PI * 2
        const end = start + angle
        const large = frac > 0.5 ? 1 : 0
        const x1 = cx + r * Math.cos(start)
        const y1 = cy + r * Math.sin(start)
        const x2 = cx + r * Math.cos(end)
        const y2 = cy + r * Math.sin(end)
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
        start = end
        return h('path', { key: i, d, fill: COLORS[i % COLORS.length], stroke: '#1a1f2e', strokeWidth: 1 })
      })
      return h('div', { className: 'tds-chart', style: { display: 'flex', alignItems: 'center', gap: 16 } },
        h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` }, paths),
        h('div', null, items.map((it, i) =>
          h('div', { key: i, style: { fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
            h('span', { style: { background: COLORS[i % COLORS.length], width: 10, height: 10, borderRadius: 2, display: 'inline-block' } }),
            `${it.name}: ${Math.round(num(it.value))}`))))
    }

    /* ============================================================
     * 图表 Spec 分发（与老插件 ChartBySpec 兼容）
     * ============================================================ */

    function ChartBySpec({ spec, rows }) {
      if (!spec || !rows || !rows.length) return h('div', { className: 'tds-empty' }, '无数据')
      const type = spec.chart || spec.type || 'line'
      if (type === 'stat') {
        const v = spec.field ? (rows[0]?.[spec.field] ?? 0) : (rows[0]?.[0] ?? 0)
        return h(StatChart, { value: spec.format ? spec.format(v) : v, unit: spec.unit, thresholds: spec.thresholds })
      }
      if (type === 'line') {
        const series = (spec.series || []).map((s) => ({
          field: s.field || s.name,
          name: s.name || s.field,
          color: s.color || COLORS[0],
        }))
        return h(LineChart, { rows, xField: spec.xField || 'ts', series, height: spec.height || 180 })
      }
      if (type === 'bar') {
        const items = rows.map((r, i) => ({
          name: r[spec.labelField || 'name'] || String(i),
          value: num(r[spec.valueField || 'value']),
        }))
        return h(BarChart, { items, height: spec.height || 180, vertical: spec.vertical !== false })
      }
      if (type === 'pie') {
        const items = rows.map((r) => ({ name: r[spec.labelField || 'name'], value: num(r[spec.valueField || 'value']) }))
        return h(PieChart, { items })
      }
      return h('div', { className: 'tds-empty' }, '图表类型：' + type)
    }

    /* ============================================================
     * 连接向导
     * ============================================================ */

    function ConnectionWizard({ onDone }) {
      const [name, setName] = useState('')
      const [host, setHost] = useState('localhost')
      const [port, setPort] = useState('6041')
      const [user, setUser] = useState('root')
      const [password, setPassword] = useState('taosdata')
      const [testing, setTesting] = useState(false)
      const [testResult, setTestResult] = useState(null)

      async function test() {
        setTesting(true)
        setTestResult(null)
        try {
          const res = await tdsApi('/connections', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'test',
              connection: { host, port: Number(port), user, pass: password, protocol: 'http' },
            }),
          })
          setTestResult(res.ok
            ? { ok: true, text: `✅ ${res.message}（版本 ${res.version}）` }
            : { ok: false, text: `❌ ${res.message}` })
        } catch (err) {
          setTestResult({ ok: false, text: `❌ ${err.message}` })
        } finally { setTesting(false) }
      }

      async function save() {
        const displayName = name || `${host}:${port}`
        await tdsApi('/connections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'save',
            connection: { name: displayName, host, port: Number(port), user, pass: password, protocol: 'http', readonly: false, demo: false },
          }),
        })
        onDone && onDone()
      }

      return h('div', { className: 'tds-wizard' },
        h('h1', null, '欢迎使用 TDengine Studio'),
        h('p', null, '请先连接一个 TDengine 数据库。所有凭据会加密存储在本地，不会上传到任何服务器。'),
        h('label', null, '连接名称'),
        h('input', { className: 'tds-input', placeholder: '例如：生产环境 TDengine', value: name, onChange: (e) => setName(e.target.value) }),
        h('div', { className: 'tds-row' },
          h('div', null,
            h('label', null, '主机'),
            h('input', { className: 'tds-input', value: host, onChange: (e) => setHost(e.target.value) })),
          h('div', null,
            h('label', null, '端口'),
            h('input', { className: 'tds-input', value: port, onChange: (e) => setPort(e.target.value) }))),
        h('div', { className: 'tds-row' },
          h('div', null,
            h('label', null, '用户名'),
            h('input', { className: 'tds-input', value: user, onChange: (e) => setUser(e.target.value) })),
          h('div', null,
            h('label', null, '密码'),
            h('input', { className: 'tds-input', type: 'password', value: password, onChange: (e) => setPassword(e.target.value) }))),
        h('div', { className: 'tds-wizard-actions' },
          h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: test, disabled: testing }, testing ? '测试中…' : '🔍 测试连接'),
          h('button', { className: 'tds-btn', onClick: save, disabled: !testResult?.ok }, '💾 保存并继续')),
        testResult && h('div', { className: cls('tds-wizard-status', testResult.ok ? 'ok' : 'err') }, testResult.text),
        h('div', { style: { marginTop: 20, fontSize: 11, color: '#5a6478' } },
          '💡 提示：TDengine 默认端口 6041。如果是本地 Docker 容器，host 填 localhost。'))
    }

    /* ============================================================
     * 主容器
     * ============================================================ */

    const TOP_TABS = [
      { id: 'overview', label: '📊 总览' },
      { id: 'browse',   label: '🗂 数据库' },
      { id: 'ask',      label: '💬 智能查询' },
      { id: 'insights', label: '💡 洞察' },
    ]

    function MonitorPanel() {
      const [health, setHealth] = useState(null)
      const [connections, setConnections] = useState([])
      const [activeId, setActiveId] = useState(null)
      const [mode, setMode] = useState('rookie') // 'rookie' | 'pro'
      const [tab, setTab] = useState('overview')
      const [showSetup, setShowSetup] = useState(false)
      const [bootError, setBootError] = useState(null)
      const [dbs, setDbs] = useState([])
      const [activeDb, setActiveDb] = useState(null)
      const [askSeed, setAskSeed] = useState(null)
      const [browseSeed, setBrowseSeed] = useState(null)

    async function refreshAll() {
      try {
        const h = await tdsApi('/health')
        const c = await tdsApi('/connections')
        setHealth(h)
        setConnections(c.list || [])
        setActiveId(c.activeId)
        setBootError(null)
      } catch (err) {
        setBootError(err.message || String(err))
      }
    }

      useEffect(() => {
        refreshAll()
        const t = setInterval(refreshAll, 10000)
        return () => clearInterval(t)
      }, [])

      // 消费来自聊天卡片的导航意图（面板每次切换都会重新挂载）
      useEffect(() => {
        if (!pendingNav) return
        const target = pendingNav
        pendingNav = null
        if (target.tab) setTab(target.tab)
        if (target.sql) setBrowseSeed({ text: target.sql, ts: Date.now() })
      }, [])

      // 连接切换后拉取库清单；表结构可能异步刷新，空列表重试几次
      useEffect(() => {
        let cancelled = false
        let timer = null
        async function loadDbs(retry) {
          try {
            const s = await tdsApi('/schema')
            if (cancelled) return
            const list = (Array.isArray(s.dbs) ? s.dbs : [])
              .map((d) => (typeof d === 'string' ? d : d.name)).filter(Boolean)
            setDbs(list)
            if (list.length) {
              setActiveDb((cur) => (cur && list.includes(cur) ? cur : (list.includes('power') ? 'power' : list[0])))
            } else if (retry > 0) {
              timer = setTimeout(() => loadDbs(retry - 1), 3000)
            }
          } catch {
            if (!cancelled && retry > 0) timer = setTimeout(() => loadDbs(retry - 1), 3000)
          }
        }
        if (!activeId) { setDbs([]); setActiveDb(null); return }
        loadDbs(3)
        return () => { cancelled = true; if (timer) clearTimeout(timer) }
      }, [activeId])

      const activeConn = connections.find((c) => c.id === activeId)
      // 损坏（无法解密）的凭据不进入可选列表，避免再次把 activeId 指向它
      const usableConnections = connections.filter((c) => !c.broken)

      if (!health) return h('div', { className: 'tds-root' },
        h('div', { className: 'tds-loading' }, bootError
          ? h('div', null,
              h('div', { className: 'tds-alert' }, '启动失败：' + bootError),
              h('button', { className: 'tds-btn tds-btn-ghost', style: { marginTop: 12 }, onClick: refreshAll }, '重试'))
          : '加载中…'))

      if (!usableConnections.length || showSetup) {
        return h('div', { className: 'tds-root' },
          h('div', { className: 'tds-head' },
            h('div', { className: 'tds-head-left' },
              h(StudioIcon, { size: 20 }),
              h('b', null, 'TDengine Studio')),
            h('div', { className: 'tds-head-right' })),
          h(Boundary, null, h(ConnectionWizard, {
            onDone: () => { setShowSetup(false); refreshAll() },
          })))
      }

      return h('div', { className: 'tds-root' },
        h('div', { className: 'tds-head' },
          h('div', { className: 'tds-head-left' },
            h(StudioIcon, { size: 20 }),
            h('b', null, activeConn ? activeConn.name : 'TDengine Studio'),
            h('span', { className: cls('tds-connect', health.tdengine?.ok ? 'on' : 'off') },
              health.tdengine?.ok ? '● 已连接' : '○ 离线')),
          h('div', { className: 'tds-head-right' },
            h('select', { className: 'tds-connect', value: activeId || '', onChange: (e) => {
              const id = e.target.value
              tdsApi('/connections', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'activate', id }) }).then(refreshAll)
              setActiveId(id)
            } },
              usableConnections.map((c) => h('option', { key: c.id, value: c.id }, c.name + (c.demo ? ' (演示)' : '')))),
            h('select', { className: 'tds-connect', value: activeDb || '', title: '选择数据库', onChange: (e) => setActiveDb(e.target.value || null) },
              dbs.length
                ? dbs.map((d) => h('option', { key: d, value: d }, '🗄 ' + d))
                : h('option', { value: '' }, '无可用库')),
            h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => setShowSetup(true) }, '＋ 新连接'),
            h('div', { className: 'tds-mode-toggle', title: '小白模式隐藏 SQL，资深模式显示完整 SQL Editor + DDL 开关' },
              h('button', { className: cls(mode === 'rookie' && 'tds-active'), onClick: () => setMode('rookie') }, '🧒 小白'),
              h('button', { className: cls(mode === 'pro' && 'tds-active'), onClick: () => setMode('pro') }, '🧑‍💻 资深')))),

        h('div', { className: 'tds-topnav' },
          TOP_TABS.map((t) => h('div', { key: t.id, className: cls('tds-topnav-tab', tab === t.id && 'tds-active'), onClick: () => setTab(t.id) }, t.label))),

        h('div', { className: 'tds-main' },
          h(Boundary, null,
            tab === 'overview' && h(OverviewTab, { connection: activeConn, mode, health, activeDb, dbs }),
            tab === 'browse'   && h(BrowseTab,   { connection: activeConn, mode, health, initialDb: activeDb, seedSql: browseSeed }),
            tab === 'ask'      && h(AskTab,      { connection: activeConn, mode, health, activeDb, seed: askSeed }),
            tab === 'insights' && h(InsightsTab, { connection: activeConn, mode, health, activeDb,
              onAsk: (card) => { setAskSeed({ text: card.ask_question || '', ts: Date.now() }); setTab('ask') } }))))
    }

    /* ============================================================
     * Tab 占位组件（Phase 0 先搭好，后续逐 Phase 填充）
     * ============================================================ */

    function OverviewTab({ connection, mode, activeDb }) {
      // plan 有两种状态：未批准（draft）—— 只展示方案摘要卡片；已批准 —— 面板真正渲染 SQL
      const [plan, setPlan] = useState(null)
      const [approved, setApproved] = useState(false)
      const [planning, setPlanning] = useState(false)
      const [planError, setPlanError] = useState(null)
      const [messages, setMessages] = useState([])
      const [input, setInput] = useState('')
      const [model, setModel] = useState(null)
      // AI 重画：目标面板 + 弹窗里的需求输入
      const [redrawTarget, setRedrawTarget] = useState(null)
      const [redrawInput, setRedrawInput] = useState('')

      useEffect(() => {
        tdsApi('/ai/model').then((m) => setModel(m)).catch(() => setModel({ available: false }))
      }, [connection?.id])

      // 切换数据库 → 全部清空
      useEffect(() => { setPlan(null); setApproved(false); setMessages([]); setPlanError(null); setInput('') }, [activeDb])

      async function requestPlan(message, opts = {}) {
        if (!activeDb || planning) return
        const text = String(message || '').trim()
        setPlanning(true)
        setPlanError(null)
        if (text && !opts.silent) setMessages((prev) => [...prev, { role: 'user', text }])
        const body = {
          db: activeDb,
          mode,
          message: text,
          plan: plan ? { title: plan.title, summary: plan.summary, panels: plan.panels } : null,
          history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }
        if (opts.targetPanel) body.targetPanel = opts.targetPanel
        try {
          const res = await tdsApi('/ai/plan', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
          const newPlan = { title: res.title, summary: res.summary, panels: Array.isArray(res.panels) ? res.panels : [] }
          setPlan(newPlan)
          if (res.model) setModel({ available: true, model: res.model })
          if (res.reply && !opts.silent) setMessages((prev) => [...prev, { role: 'ai', text: res.reply }])
          if (text) setInput('')
        } catch (err) {
          setPlanError(err.message)
        } finally {
          setPlanning(false)
        }
      }

      function deletePanel(panelId) {
        if (!plan) return
        setPlan({ ...plan, panels: plan.panels.filter((p) => p.id !== panelId) })
        setMessages((prev) => [...prev, { role: 'user', text: `删除面板 ${panelId}` },
          { role: 'ai', text: '已移除该面板。' }])
      }

      function redrawPanel(panel) {
        if (!plan) return
        setRedrawTarget(panel)
        setRedrawInput('')
        setPlanError(null)
      }

      function submitRedraw() {
        const target = redrawTarget
        const text = redrawInput.trim()
        if (!target || !text || planning) return
        setRedrawTarget(null)
        setRedrawInput('')
        requestPlan(`重画「${target.title}」：${text}`, { targetPanel: target })
      }

      if (!activeDb) {
        return h('div', { className: 'tds-overview-empty' },
          h('div', { className: 'tds-hero-icon' }, '🗄'),
          h('h2', null, '先选择一个数据库'),
          h('p', null, '在右上角的「选择数据库」里挑一个库，再让 AI 为它规划总览。'))
      }

      // ====== 空态 ======
      if (!plan) {
        return h('div', { className: 'tds-overview-empty' },
          h('div', { className: 'tds-hero-icon' }, '📊'),
          h('h2', null, '为「' + activeDb + '」规划总览'),
          h('p', null, model?.available
            ? 'AI 将分析表结构，自动生成指标卡与趋势图（当前模型：' + model.model + '）'
            : 'AI 将分析表结构，自动生成指标卡与趋势图'),
          h('p', { className: 'tds-hero-sub' }, '先给你一份方案，确认后再开始渲染数据。你还能边看边改。'),
          h('button', { className: 'tds-btn', disabled: planning, onClick: () => requestPlan('') },
            planning ? '⏳ AI 正在规划…' : '✨ AI 规划开启'),
          planning ? h('div', { className: 'tds-plan-steps' }, '读取表结构 → 挑选关键指标 → 生成查询 → 排版面板') : null,
          planError ? h('div', { className: 'tds-alert', style: { marginTop: 14 } }, planError) : null)
      }

      // ====== 方案预览态（draft，未批准） ======
      if (!approved) {
        return h('div', null,
          h('div', { className: 'tds-plan-preview' },
            h('div', { className: 'tds-plan-preview-title' },
              h('span', { className: 'tds-plan-badge' }, 'AI 方案'),
              h('b', null, plan.title || (activeDb + ' 总览')),
              h('span', { style: { color: '#5a6478', fontSize: 11, marginLeft: 'auto' } }, '共 ' + plan.panels.length + ' 个面板')),
            h('div', { className: 'tds-plan-preview-desc' }, plan.summary || 'AI 为你规划了一页总览，下面是面板清单。确认即可开始渲染，或者继续用对话调整。'),
            h('div', { className: 'tds-plan-preview-list' },
              plan.panels.map((p) => {
                const typeCls = p.type === 'stat' ? 'tds-type-stat' : p.type === 'line' ? 'tds-type-line' : 'tds-type-table'
                return h('div', { key: p.id, className: 'tds-plan-preview-item' },
                  h('span', { className: cls('tds-type-tag', typeCls) }, p.type),
                  h('div', { style: { flex: 1, minWidth: 0 } },
                    h('div', { className: 'tds-pp-title' }, p.title),
                    h('div', { className: 'tds-pp-sql', title: p.sql }, p.sql)))
              })),
            h('div', { className: 'tds-plan-preview-actions' },
              h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => { setPlan(null); setMessages([]) } }, '🗑 重开'),
              h('button', { className: 'tds-btn tds-btn-sm', onClick: () => setApproved(true) }, '✅ 确认生成面板'))),
          h('div', { className: 'tds-plan-chat' },
            h('div', { className: 'tds-card-title' },
              h('b', null, '💬 和 AI 继续调整方案'),
              h('span', { style: { color: '#5a6478', fontSize: 11 } }, planning ? '规划中…' : (model?.model || ''))),
            messages.length ? h('div', { className: 'tds-plan-msgs' },
              messages.map((m, i) => h('div', { key: i, className: cls('tds-plan-msg', m.role === 'user' ? 'user' : 'ai') }, m.text))) : null,
            h('div', { className: 'tds-suggest-chips' },
              ['加一个告警数量统计', '精简到 4 个面板', '按设备类型拆分', '都改成 24 小时趋势'].map((s) =>
                h('div', { key: s, className: 'tds-chip', onClick: () => requestPlan(s) }, s))),
            h('div', { className: 'tds-plan-input' },
              h('input', {
                className: 'tds-input', value: input, disabled: planning,
                placeholder: '告诉 AI 想怎么改，例如：再加一个告警严重程度分布',
                onChange: (e) => setInput(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) requestPlan(input.trim()) } },
              }),
              h('button', { className: 'tds-btn', disabled: planning || !input.trim(), onClick: () => requestPlan(input.trim()) }, planning ? '思考中…' : '发送'))))
      }

      // ====== 已批准：面板渲染态 ======
      return h('div', null,
        h('div', { className: 'tds-dash-header' },
          h('div', null,
            h('b', null, '📊 ' + (plan.title || (activeDb + ' 总览'))),
            plan.summary ? h('div', { className: 'tds-sub', style: { marginTop: 2 } }, plan.summary) : null),
          h('div', { style: { flex: 1 } }),
          h('span', { className: 'tds-plan-badge' }, '已生成'),
          h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', disabled: planning, onClick: () => requestPlan('重新规划这一页，保留最重要的问题') }, planning ? '规划中…' : '🔄 整体重规划'),
          h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => { setApproved(false) } }, '👁 查看方案')),
        planError ? h('div', { className: 'tds-alert' }, planError) : null,
        plan.panels.length
          ? h('div', { className: 'tds-dash-grid' },
              plan.panels.map((p) => h('div', { key: p.id, className: 'tds-panel',
                style: { gridColumn: `${p.grid.x + 1} / span ${p.grid.w}`, gridRow: `${p.grid.y + 1} / span ${p.grid.h}` } },
                h('div', { className: 'tds-panel-head' },
                  h('b', null, p.title),
                  h('div', { className: 'tds-panel-actions' },
                    h('span', { className: 'tds-panel-type-badge' }, p.type),
                    h('button', { title: '让 AI 重画', onClick: () => redrawPanel(p), disabled: planning }, '🎨'),
                    h('button', { title: '删除面板', className: 'tds-danger', onClick: () => deletePanel(p.id) }, '🗑'))),
                h(DummyPanelBody, { panel: p, connection }))))
          : h('div', { className: 'tds-alert ok' }, '当前没有面板了，可以用下面的对话让 AI 再加几个。'),
        h('div', { className: 'tds-plan-chat' },
          h('div', { className: 'tds-card-title' },
            h('b', null, '💬 和 AI 继续调整'),
            h('span', { style: { color: '#5a6478', fontSize: 11 } }, planning ? '规划中…' : (model?.model || ''))),
          messages.length ? h('div', { className: 'tds-plan-msgs' },
            messages.map((m, i) => h('div', { key: i, className: cls('tds-plan-msg', m.role === 'user' ? 'user' : 'ai') }, m.text))) : null,
          h('div', { className: 'tds-suggest-chips' },
            ['再补两张关键趋势图', '精简到 4 个面板', '按设备类型拆分', '布局更紧凑一些'].map((s) =>
              h('div', { key: s, className: 'tds-chip', onClick: () => requestPlan(s) }, s))),
          h('div', { className: 'tds-plan-input' },
            h('input', {
              className: 'tds-input', value: input, disabled: planning,
              placeholder: '告诉 AI 想怎么改，例如：再加一个告警数量统计',
              onChange: (e) => setInput(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) requestPlan(input.trim()) } },
            }),
            h('button', { className: 'tds-btn', disabled: planning || !input.trim(), onClick: () => requestPlan(input.trim()) }, planning ? '思考中…' : '发送'))),
        redrawTarget ? h('div', { className: 'tds-modal-mask', onClick: () => setRedrawTarget(null) },
          h('div', { className: 'tds-modal', onClick: (e) => e.stopPropagation() },
            h('div', { className: 'tds-modal-title' }, '🎨 AI 重画 · ' + redrawTarget.title),
            h('div', { className: 'tds-modal-desc' }, '描述你希望怎么改，AI 会按你的要求重画这个面板；位置和大小保持不变。'),
            h('textarea', {
              className: 'tds-input tds-modal-textarea', rows: 4, autoFocus: true,
              value: redrawInput,
              placeholder: '例如：改成 24 小时按小时聚合的折线图；或换成统计总数的大数字卡片',
              onChange: (e) => setRedrawInput(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Escape') { setRedrawTarget(null); return }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitRedraw() }
              },
            }),
            h('div', { className: 'tds-modal-actions' },
              h('span', { className: 'tds-modal-hint' }, 'Cmd/Ctrl + Enter 提交，Esc 关闭'),
              h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => setRedrawTarget(null) }, '取消'),
              h('button', { className: 'tds-btn tds-btn-sm', disabled: !redrawInput.trim() || planning, onClick: submitRedraw }, planning ? '重画中…' : '开始重画'))))
        : null)
    }

    function DummyPanelBody({ panel, connection }) {
      const [rows, setRows] = useState(null)
      const [err, setErr] = useState(null)
      useEffect(() => {
        setRows(null); setErr(null)
        tdsApi('/query', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sql: panel.sql, db: panel.db }),
        }).then((r) => setRows({ columns: r.column_meta, rows: r.data, type: panel.type }))
          .catch((e) => setErr(e.message))
      }, [panel.id, panel.sql, panel.db])

      if (err) return h('div', { className: 'tds-alert' }, err)
      if (!rows) return h('div', { className: 'tds-loading' }, '查询中…')
      if (!rows.rows?.length) return h('div', { className: 'tds-empty' }, '无数据')

      if (rows.type === 'stat') {
        const v = rows.rows[0]?.[0] ?? 0
        return h(StatChart, { value: v })
      }
      if (rows.type === 'line') {
        const objs = rows.rows.map((r) => {
          const obj = {}
          rows.columns.forEach((c, j) => obj[c[0]] = r[j])
          return obj
        })
        const series = panel.series && panel.series.length
          ? panel.series.map((s, i) => ({ ...s, color: s.color || COLORS[i % COLORS.length] }))
          : [{ field: rows.columns[1]?.[0] || 'value', name: rows.columns[1]?.[0] || 'value', color: '#00c8ff' }]
        // 图表高度跟随面板网格高度（48px/行 + 间距，扣掉标题与内边距）
        const gh = panel.grid?.h || 6
        const chartH = Math.max(150, gh * 48 + (gh - 1) * 10 - 62)
        return h(LineChart, { rows: objs, xField: panel.xField || 'ts', series, height: chartH })
      }
      if (rows.type === 'table') {
        return h('div', { className: 'tds-result-wrap', style: { height: '100%', maxHeight: 'none' } },
          h('table', { className: 'tds-result-table' },
            h('thead', null, h('tr', null,
              rows.columns.map((c, i) => h('th', { key: i }, Array.isArray(c) ? c[0] : String(c))))),
            h('tbody', null, rows.rows.map((r, ri) => h('tr', { key: ri },
              r.map((v, ci) => h('td', { key: ci }, v === null || v === undefined ? '—' : String(v))))))))
      }
      return h('div', { className: 'tds-empty' }, rows.type + ' 渲染中…')
    }

    function FieldChips({ table, db, onSql }) {
      if (!table?.columns) return null
      return h('div', { className: 'tds-form-chips' },
        table.columns.map((c) => h('div', {
          key: c.name,
          className: 'tds-chip',
          onClick: () => {
            const cols = table.columns.filter((cc) => !cc.isTag).slice(0, 10).map((cc) => cc.name)
            onSql && onSql(`USE ${db};\nSELECT ${cols.join(', ')} FROM ${table.tbname} LIMIT 50`)
          },
        }, c.name + ` (${c.type})${c.isTag ? ' 🏷TAG' : ''}`)))
    }

    function BrowseTab({ connection, mode, initialDb, seedSql }) {
      const [schema, setSchema] = useState({ dbs: [], tables: [] })
      const [loading, setLoading] = useState(true)
      const [activeDb, setActiveDb] = useState(null)
      const [activeTable, setActiveTable] = useState(null)
      const [sql, setSql] = useState('')
      const [sqlResult, setSqlResult] = useState(null)
      const [showSqlEditor, setShowSqlEditor] = useState(mode === 'pro')
      const [executing, setExecuting] = useState(false)
      const [execErr, setExecErr] = useState(null)
      const [suggestions, setSuggestions] = useState([])
      const [acIndex, setAcIndex] = useState(0)
      const taRef = useRef(null)

      useEffect(() => {
        setLoading(true)
        tdsApi('/schema').then((s) => { setSchema(s); setLoading(false) }).catch((e) => { setExecErr(e.message); setLoading(false) })
      }, [connection?.id])

      // 跟随右上角的数据库选择
      useEffect(() => {
        if (initialDb) { setActiveDb(initialDb); setActiveTable(null) }
      }, [initialDb])

      // 来自聊天卡片的 SQL 预填（「全屏」跳转时带入）
      useEffect(() => {
        if (seedSql && seedSql.text) {
          setSql(seedSql.text)
          setShowSqlEditor(true)
        }
      }, [seedSql && seedSql.ts])

      async function runSql(dbArg) {
        if (!sql.trim()) return
        const db = dbArg !== undefined ? dbArg : activeDb
        setExecuting(true); setExecErr(null); setSqlResult(null)
        try {
          const res = await tdsApi('/query', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sql, db }),
          })
          setSqlResult(res)
        } catch (err) { setExecErr(err.message) }
        finally { setExecuting(false) }
      }

      async function onDbClick(dbName) {
        setActiveDb(dbName); setActiveTable(null)
        setSql('SHOW TABLES;')
        if (mode === 'pro') setShowSqlEditor(true)
        setExecuting(true); setExecErr(null); setSqlResult(null)
        try {
          const res = await tdsApi('/query', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sql: 'SHOW TABLES;', db: dbName }),
          })
          setSqlResult(res)
        } catch (err) { setExecErr(err.message) }
        finally { setExecuting(false) }
      }

      async function onTableClick(tb) {
        setActiveTable(tb)
        const previewSql = `SELECT * FROM \`${tb.tbname}\` LIMIT 10`
        setSql(previewSql)
        if (mode === 'pro') setShowSqlEditor(true)
        setExecuting(true); setExecErr(null); setSqlResult(null)
        try {
          const res = await tdsApi('/query', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sql: previewSql, db: activeDb }) })
          setSqlResult(res)
        } catch (err) { setExecErr(err.message) }
        finally { setExecuting(false) }
      }

      const activeTables = (schema.tables || []).find((g) => g.db === activeDb)?.tables || []
      const allTables = Array.isArray(schema.tables)
        ? schema.tables.flatMap((g) => (Array.isArray(g.tables) ? g.tables.map((t) => ({ ...t, db: g.db })) : []))
        : []

      /* ---------- SQL 自动补全 ---------- */

      function computeSuggestions(value, caret, force) {
        const before = String(value || '').slice(0, caret ?? 0)
        const m = before.match(/[A-Za-z_][\w$]*$/)
        // 关键字后跟空格时也主动弹出候选（贴近常用 SQL 客户端）
        const boundary = /\b(select|from|where|group\s+by|order\s+by|having|and|or|on|interval|partition\s+by)\s+$/i.test(before)
        if (!m && !force && !boundary) { setSuggestions([]); return }
        const prefix = m ? m[0].toLowerCase() : ''
        // 找最近的 FROM <表名>，之后优先补全该表的字段（再混入关键字）
        const froms = [...before.matchAll(/\bfrom\s+`?([\w$]+)`?/gi)]
        const fromTable = froms.length ? froms[froms.length - 1][1].toLowerCase() : null
        const t = fromTable ? allTables.find((x) => x.tbname.toLowerCase() === fromTable) : null
        let pool = []
        if (t) {
          pool = [
            ...t.columns.map((c) => ({ text: c.name, kind: c.isTag ? 'tag' : c.type })),
            ...SQL_KEYWORDS.map((k) => ({ text: k, kind: 'keyword' })),
          ]
        } else {
          pool = [
            ...SQL_KEYWORDS.map((k) => ({ text: k, kind: 'keyword' })),
            ...schema.dbs.map((d) => ({ text: d.name, kind: 'db' })),
            ...activeTables.map((t) => ({ text: t.tbname, kind: t.type === 'STABLE' ? 'stable' : 'table' })),
            ...(activeTable?.columns || []).map((c) => ({ text: c.name, kind: c.isTag ? 'tag' : 'column' })),
          ]
        }
        const seen = new Set()
        const out = []
        for (const item of pool) {
          const key = item.text.toLowerCase()
          if (seen.has(key) || !key.startsWith(prefix)) continue
          if (key === prefix && !force) continue
          seen.add(key)
          out.push(item)
          if (out.length >= 8) break
        }
        setSuggestions(out)
        setAcIndex(0)
      }

      function applySuggestion(item) {
        if (!item) return
        const ta = taRef.current
        const caret = ta ? ta.selectionStart : sql.length
        const before = sql.slice(0, caret)
        const m = before.match(/[A-Za-z_][\w$]*$/)
        const start = m ? caret - m[0].length : caret
        const next = sql.slice(0, start) + item.text + sql.slice(caret)
        setSql(next)
        setSuggestions([])
        requestAnimationFrame(() => {
          const el = taRef.current
          if (!el) return
          const pos = start + item.text.length
          el.focus()
          el.setSelectionRange(pos, pos)
        })
      }

      function insertText(str) {
        const ta = taRef.current
        const caret = ta ? ta.selectionStart : sql.length
        const next = sql.slice(0, caret) + str + sql.slice(caret)
        setSql(next)
        setSuggestions([])
        requestAnimationFrame(() => {
          const el = taRef.current
          if (!el) return
          const pos = caret + str.length
          el.focus()
          el.setSelectionRange(pos, pos)
        })
      }

      function onSqlChange(e) {
        setSql(e.target.value)
        computeSuggestions(e.target.value, e.target.selectionStart)
      }

      function onSqlKeyDown(e) {
        const mod = e.metaKey || e.ctrlKey
        if (mod && e.key === 'Enter') { e.preventDefault(); runSql(); return }
        // Ctrl/Cmd+Space：手动弹出全部候选（典型 SQL 客户端行为）
        if (mod && e.key === ' ') { e.preventDefault(); computeSuggestions(sql, e.target.selectionStart, true); return }
        // Tab 永远不切走焦点：有候选则补全，否则插入两个空格缩进
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault()
          if (suggestions.length) applySuggestion(suggestions[acIndex])
          else insertText('  ')
          return
        }
        if (suggestions.length) {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAcIndex((i) => (i + 1) % suggestions.length); return }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAcIndex((i) => (i - 1 + suggestions.length) % suggestions.length); return }
          if (e.key === 'Enter') { e.preventDefault(); applySuggestion(suggestions[acIndex]); return }
          if (e.key === 'Escape') { e.preventDefault(); setSuggestions([]); return }
        }
      }

      const iconFor = (tb) => tb.type === 'STABLE' ? '🗂' : tb.type === 'CHILD' ? '📄' : '📋'
      const dbTree = schema.dbs.length === 0
        ? h('div', { className: 'tds-empty' }, '未找到数据库')
        : schema.dbs.map((db) => {
            const isOpen = activeDb === db.name
            const children = isOpen ? activeTables.map((tb) =>
              h('div', { key: tb.tbname, className: 'tds-tree-indent' },
                h('div', {
                  className: cls('tds-tree-node', activeTable?.tbname === tb.tbname && 'tds-active'),
                  onClick: () => onTableClick(tb),
                }, h('span', { className: 'tds-tree-icon' }, iconFor(tb)), tb.tbname))) : null
            return h('div', { key: db.name },
              h('div', {
                className: cls('tds-tree-node', isOpen && 'tds-active'),
                onClick: () => onDbClick(db.name),
              }, h('span', { className: 'tds-tree-icon' }, '📁'), db.name),
              children)
          })

      const rookieForm = activeDb ? h('div', { className: 'tds-card', style: { marginBottom: 10 } },
        h('div', { className: 'tds-card-title' },
          h('b', null, '🔎 点选查询'),
          h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => setShowSqlEditor(true) }, '👀 显示 SQL')),
        h('div', { className: 'tds-form-row' },
          h('div', null,
            h('label', null, '库'),
            h('select', { className: 'tds-input', value: activeDb, onChange: (e) => onDbClick(e.target.value) },
              schema.dbs.map((db) => h('option', { key: db.name, value: db.name }, db.name)))),
          h('div', null,
            h('label', null, '表'),
            h('select', { className: 'tds-input', value: activeTable?.tbname || '', onChange: (e) => {
              const t = activeTables.find((x) => x.tbname === e.target.value); if (t) onTableClick(t)
            } }, activeTables.map((t) => h('option', { key: t.tbname, value: t.tbname }, t.tbname + ' (' + t.type + ')'))))),
        h('div', { style: { marginTop: 10 } },
          h('button', { className: 'tds-btn', onClick: () => { const tb = activeTable?.tbname; if (!tb) return; setSql(`SELECT * FROM ${tb} LIMIT 50`); setShowSqlEditor(true); runSql(); }, disabled: !activeTable }, '▶ 快速查询 10 行'),
          h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', style: { marginLeft: 10 }, onClick: () => setShowSqlEditor(true) }, '✏️ 手动写 SQL'))) : null

      const sqlEditor = h('div', { className: 'tds-sql-editor' },
        h('div', { className: 'tds-sql-toolbar' },
          h('button', { className: 'tds-btn tds-btn-sm', onClick: () => runSql(), disabled: executing }, executing ? '执行中…' : '▶ 执行 (Cmd+Enter)'),
          h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => setSql('') }, '清空'),
          mode === 'rookie' ? h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => setShowSqlEditor(false) }, '隐藏 SQL') : null,
          h('span', { style: { flex: 1 } }),
          activeDb ? h('span', { style: { color: '#5a6478', fontSize: 11 } }, `当前库：${activeDb}`) : null),
        h('div', { className: 'tds-sql-wrap' },
          h('textarea', {
            ref: taRef,
            className: 'tds-sql-textarea', value: sql,
            onChange: onSqlChange,
            onKeyDown: onSqlKeyDown,
            onKeyUp: (e) => {
              if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return
              computeSuggestions(e.target.value, e.target.selectionStart)
            },
            onClick: (e) => computeSuggestions(e.target.value, e.target.selectionStart),
            onSelect: (e) => computeSuggestions(e.target.value, e.target.selectionStart),
            onBlur: () => setSuggestions([]),
            placeholder: '输入 SQL 自动补全（Ctrl+Space 手动触发，Tab 补全或缩进，Cmd+Enter 执行）…',
          }),
          suggestions.length
            ? h('div', { className: 'tds-autocomplete' },
                suggestions.map((s, i) => h('div', {
                  key: s.text,
                  className: cls('tds-ac-item', i === acIndex && 'tds-ac-active'),
                  onMouseDown: (e) => { e.preventDefault(); applySuggestion(s) },
                  onMouseEnter: () => setAcIndex(i),
                }, s.text, h('span', { className: 'tds-ac-kind' }, s.kind))))
            : null),
        execErr ? h('div', { className: 'tds-alert' }, '❌ ' + execErr) : null,
        sqlResult ? h('div', { className: 'tds-sql-meta' },
          `返回 ${sqlResult.rows} 行，${sqlResult.column_meta?.length || 0} 列${sqlResult.rows > 200 ? '（已截断前 200 行）' : ''}`) : null)

      const resultTable = sqlResult && sqlResult.column_meta
        ? h('div', { className: 'tds-result-wrap', style: { marginTop: 10 } },
            h('table', { className: 'tds-result-table' },
              h('thead', null, h('tr', null, sqlResult.column_meta.map((c, i) => h('th', { key: i }, c[0])))),
              h('tbody', null, sqlResult.data.map((row, i) => h('tr', { key: i },
                row.map((v, j) => h('td', { key: j }, v == null ? 'NULL' : fmt2(v))))))))
        : activeTable ? h('div', { className: 'tds-empty' }, '点击左侧表名预览最近 10 行数据') : null

      return h('div', { className: 'tds-browse-layout' },
        h('div', { className: 'tds-schema-tree' },
          h('div', { style: { fontSize: 12, color: '#5a6478', marginBottom: 8 } }, '📚 数据库'),
          loading ? h('div', { className: 'tds-loading' }, '加载中…') : dbTree),
        h('div', { className: 'tds-main-panel' },
          mode === 'rookie' && !showSqlEditor ? rookieForm : null,
          mode === 'pro' || showSqlEditor ? sqlEditor : null,
          resultTable))
    }

    function AskTab({ connection, mode, activeDb, seed }) {
      const [question, setQuestion] = useState('')
      const [messages, setMessages] = useState([])
      const [asking, setAsking] = useState(false)
      const [range, setRange] = useState('24h')

      useEffect(() => {
        setMessages([])
        setQuestion('')
      }, [activeDb])

      // 从洞察页「问 AI」跳转过来时预填问题
      useEffect(() => {
        if (seed && seed.text) setQuestion(seed.text)
      }, [seed])

      function historyFor(list) {
        return list.slice(-6)
          .map((m) => m.role === 'user'
            ? { role: 'user', text: m.text }
            : { role: 'assistant', text: m.result?.explanation || m.result?.summary || '' })
          .filter((x) => x.text)
      }

      async function ask(textArg) {
        const q = String(textArg ?? question).trim()
        if (!q || asking) return
        if (!activeDb) {
          setMessages((m) => [...m, { role: 'assistant', failure: { error: { stage: 'input', message: '请先在右上角选择数据库' } } }])
          return
        }
        const history = historyFor(messages)
        setQuestion('')
        setMessages((m) => [...m, { role: 'user', text: q }])
        setAsking(true)
        try {
          const { status, body } = await tdsPost('/ask', {
            db: activeDb, question: q, range: { type: range }, mode, history,
          })
          if (body.clarification) setMessages((m) => [...m, { role: 'assistant', clarification: body.clarification }])
          else if (status >= 400 || body.ok === false) setMessages((m) => [...m, { role: 'assistant', failure: body }])
          else setMessages((m) => [...m, { role: 'assistant', result: body }])
        } catch (err) {
          setMessages((m) => [...m, { role: 'assistant', failure: { error: { stage: 'network', message: err.message } } }])
        } finally { setAsking(false) }
      }

      const presets = ['最近24小时光伏出力趋势', '今天一共有多少条告警', '储能电池最新SOC是多少', '各风机平均功率对比']

      return h('div', { className: 'tds-ask' },
        h('div', { className: 'tds-ask-head' },
          h('div', null,
            h('b', { style: { fontSize: 15, color: '#e6ebf5' } }, '💬 智能问数'),
            h('span', { className: 'tds-ask-sub' }, activeDb ? ('当前库：' + activeDb + ' · 只读查询') : '请先在右上角选择数据库')),
          h('div', { className: 'tds-ask-range' },
            h('span', null, '时间范围'),
            [['1h', '1 小时'], ['24h', '24 小时'], ['7d', '7 天']].map(([v, label]) =>
              h('button', { key: v, className: cls('tds-chip', range === v && 'tds-active'), onClick: () => setRange(v) }, label)))),
        h('div', { className: 'tds-ask-list' },
          messages.length === 0
            ? h('div', { className: 'tds-empty', style: { padding: '40px 0' } },
              h('div', { style: { marginBottom: 12 } }, '用自然语言提问，我会先检索相关表，再生成只读 SQL 并画出图表。'),
              h('div', { className: 'tds-ask-presets' }, presets.map((p) =>
                h('span', { key: p, className: 'tds-chip', onClick: () => ask(p) }, p))))
            : messages.map((m, i) => m.role === 'user'
              ? h('div', { key: i, className: 'tds-ask-q' }, m.text)
              : m.clarification
                ? h('div', { key: i, className: 'tds-ask-clarify' }, '🤔 ' + m.clarification.question)
                : m.failure
                  ? h(AskFailure, { key: i, failure: m.failure })
                  : h(AnswerCard, { key: i, result: m.result })),
          asking ? h('div', { className: 'tds-ask-loading' }, '🤖 正在检索表结构、生成并校验 SQL…') : null),
        h('div', { className: 'tds-ask-input' },
          h('textarea', {
            className: 'tds-input', value: question, rows: 2,
            placeholder: activeDb ? '问点具体的，例如：最近 24 小时各场站光伏出力趋势（Enter 发送，Shift+Enter 换行）' : '请先在右上角选择数据库',
            onChange: (e) => setQuestion(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } },
          }),
          h('button', { className: 'tds-btn', disabled: asking || !question.trim() || !activeDb, onClick: () => ask() },
            asking ? '生成中…' : '发送')))
    }

    function AskFailure({ failure }) {
      const err = failure?.error && typeof failure.error === 'object'
        ? failure.error
        : { stage: 'unknown', message: String(failure?.error || '未知错误') }
      const labels = { generate: '生成 SQL', validate: '静态校验', explain: 'EXPLAIN 校验', execute: '执行', input: '参数', network: '网络', unknown: '请求' }
      return h('div', { className: 'tds-ask-card' },
        h('div', { className: 'tds-ask-error' }, '❌ ' + (labels[err.stage] || '请求') + '失败：' + (err.message || '未知错误')),
        failure?.sql ? h('pre', { className: 'tds-ask-sqlbox', style: { marginTop: 10, whiteSpace: 'pre-wrap' } }, failure.sql) : null,
        h('div', { className: 'tds-ask-meta' },
          h('span', null, '自动修复 ' + (failure?.retries || 0) + ' 次'),
          h('span', null, '只读模式：仅允许 SELECT / WITH')))
    }

    function AskResultTable({ columns, rows }) {
      if (!rows || !rows.length) return h('div', { className: 'tds-empty', style: { padding: '20px 0' } }, '没有数据')
      return h('div', { className: 'tds-result-wrap tds-ask-table' },
        h('table', { className: 'tds-result-table' },
          h('thead', null, h('tr', null, (columns || []).map((c, i) => h('th', { key: i }, c.name)))),
          h('tbody', null, rows.slice(0, 200).map((r, i) =>
            h('tr', { key: i }, r.map((v, j) => h('td', { key: j }, v == null ? '' : String(v))))))))
    }

    /** 回答卡片：解释 + 图表/数据/SQL 三视图 + 可编辑重跑 */
    function AnswerCard({ result }) {
      const [tab, setTab] = useState(result.chart?.type === 'table' ? 'data' : 'chart')
      const [view, setView] = useState(result)
      const [sqlDraft, setSqlDraft] = useState(result.sql || '')
      const [editing, setEditing] = useState(false)
      const [running, setRunning] = useState(false)
      const [runError, setRunError] = useState('')
      const [copied, setCopied] = useState(false)

      function applyResult(next) {
        setView(next)
        setSqlDraft(next.sql || '')
        setTab(next.chart?.type === 'table' ? 'data' : 'chart')
        setEditing(false)
        setRunError('')
      }

      async function copySql() {
        try {
          await navigator.clipboard.writeText(sqlDraft)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch (e) { setRunError('复制失败，请手动选择文本') }
      }

      async function runSql() {
        if (running) return
        setRunning(true)
        setRunError('')
        const { status, body } = await tdsPost('/ask/run', { db: view.db || result.db, sql: sqlDraft })
        setRunning(false)
        if (status >= 400 || body.ok === false) {
          const msg = body?.error && typeof body.error === 'object' ? body.error.message : body?.error
          setRunError(msg || ('HTTP ' + status))
          if (body?.sql) setSqlDraft(body.sql)
          return
        }
        applyResult(body)
      }

      const chart = view.chart || { type: 'table' }
      const rows = view.rows || []
      const columns = view.columns || []
      const badge = view.grounded === false
        ? h('span', { className: 'tds-ask-badge warn' }, '⚠️ 数字未核实')
        : (view.retries
          ? h('span', { className: 'tds-ask-badge warn' }, '⚠️ 已自动修复 ' + view.retries + ' 次')
          : h('span', { className: 'tds-ask-badge ok' }, '✅ 字段校验通过'))

      let body
      if (tab === 'sql') {
        body = h('div', null,
          h('textarea', {
            className: 'tds-ask-sqlbox',
            value: sqlDraft,
            readOnly: !editing,
            spellCheck: false,
            rows: Math.min(12, Math.max(3, sqlDraft.split('\n').length + 1)),
            onChange: (e) => setSqlDraft(e.target.value),
          }),
          h('div', { className: 'tds-ask-sql-actions' },
            h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: copySql }, copied ? '已复制' : '复制'),
            h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: () => setEditing((x) => !x) }, editing ? '只读' : '编辑'),
            h('button', { className: 'tds-btn tds-btn-sm', disabled: running, onClick: runSql }, running ? '执行中…' : '重新运行')),
          runError ? h('div', { className: 'tds-ask-error', style: { marginTop: 10 } }, '❌ ' + runError) : null)
      } else if (tab === 'data') {
        body = h(AskResultTable, { columns, rows })
      } else if (chart.type === 'stat') {
        const statIdx = Math.max(0, columns.findIndex((c) => c.name === chart.field))
        body = h('div', { className: 'tds-ask-stat' },
          h(StatChart, { value: rows.length ? rows[0][statIdx] : '', unit: chart.unit }))
      } else if ((chart.type === 'line' || chart.type === 'bar') && rows.length) {
        body = h('div', { className: 'tds-ask-chart' },
          h(LineChart, {
            rows: rowsToObjects(columns, rows),
            xField: chart.x,
            series: chart.series || [],
            height: 280,
            chartType: chart.type,
          }))
      } else {
        body = h(AskResultTable, { columns, rows })
      }

      return h('div', { className: 'tds-ask-card' },
        h('div', { className: 'tds-ask-answer' }, view.explanation || view.summary || ''),
        h('div', { className: 'tds-ask-tabs' },
          [['chart', '📈 图表'], ['data', '📋 数据'], ['sql', '🧾 SQL']].map(([v, label]) =>
            h('button', { key: v, className: cls('tds-ask-tab', tab === v && 'tds-active'), onClick: () => setTab(v) }, label))),
        body,
        view.assumptions && view.assumptions.length
          ? h('div', { className: 'tds-ask-assume' }, '假设：' + view.assumptions.join('；'))
          : null,
        h('div', { className: 'tds-ask-meta' },
          badge,
          view.model ? h('span', null, '模型 ' + view.model) : null,
          view.elapsedMs ? h('span', null, (view.elapsedMs / 1000).toFixed(1) + 's') : null,
          h('span', null, (view.rowCount ?? rows.length) + ' 行' + (view.truncated ? '（已截断）' : '')),
          view.range ? h('span', null, view.range) : null,
          view.tables && view.tables.length ? h('span', null, '表 ' + view.tables.join('、')) : null,
          h('span', null, '只读')))
    }

    /* ============================================================
     * 洞察（无问智推）
     * ============================================================ */

    const INSIGHT_KIND_TEXT = { spike: '突变', trend: '趋势', threshold: '越限', cluster: '告警' }

    function severityColor(s) {
      if (s >= 85) return '#ef4444'
      if (s >= 70) return '#f59e0b'
      return '#eab308'
    }

    /** 把后端 chart.data（[[ts, v], ...]）转成 LineChart 需要的 rows/series。 */
    function insightChartRows(chart) {
      if (!chart || !Array.isArray(chart.data) || !chart.data.length) return null
      const field = chart.field || 'v'
      const rows = chart.data.map((d) => ({ ts: d[0], [field]: d[1] }))
      return { rows, series: [{ field, name: chart.name || '', color: '#00c8ff' }] }
    }

    function deltaText(v) {
      const n = Number(v)
      if (!Number.isFinite(n)) return '—'
      return (n >= 0 ? '+' : '') + fmt2(n) + '%'
    }

    function InsightCard({ card, mode, onDetail, onAsk, onDismiss }) {
      const chart = insightChartRows(card.chart)
      const f = card.facts || {}
      const unit = card.unit || ''
      return h('div', { className: 'tds-insight-card', style: { '--bar': severityColor(card.severity) } },
        h('div', { className: 'tds-insight-top' },
          h('span', { className: 'tds-insight-kind' }, INSIGHT_KIND_TEXT[card.kind] || card.kind),
          h('span', { className: 'tds-insight-sev' }, '严重度 ' + card.severity)),
        h('div', { className: 'tds-insight-title' }, card.title),
        h('div', { className: 'tds-insight-narrative' }, card.narrative),
        h('div', { className: 'tds-insight-facts' },
          h('span', null, '当前 ', h('b', null, fmt2(f.current)), unit),
          h('span', null, card.kind === 'trend' ? '起点 ' : '基线 ', h('b', null, fmt2(f.baseline)), unit),
          h('span', null, '变化 ', h('b', null, deltaText(f.deltaPct)))),
        chart ? h('div', null, h(LineChart, { rows: chart.rows, xField: 'ts', series: chart.series, height: 84 })) : null,
        h('div', { className: 'tds-insight-actions' },
          h('button', { onClick: () => onDetail(card) }, '查看详情'),
          h('button', { onClick: () => onAsk(card) }, '💬 问 AI'),
          mode === 'pro' ? h('button', { className: 'tds-danger', onClick: () => onDismiss(card) }, '忽略') : null))
    }

    function InsightDetail({ card, onClose, onAsk }) {
      const [run, setRun] = useState(null)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState('')

      // 卡片没带迷你趋势时，打开详情再用只读 SQL 拉一次
      useEffect(() => {
        let cancelled = false
        if (card.chart || !card.sql) return undefined
        setLoading(true)
        tdsPost('/ask/run', { db: card.db, sql: card.sql }).then(({ status, body }) => {
          if (cancelled) return
          if (status >= 400 || body.ok === false) {
            setError((body.error && (body.error.message || body.error)) || ('HTTP ' + status))
          } else {
            setRun(body)
          }
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
      }, [card.id])

      const chart = card.chart
        ? insightChartRows(card.chart)
        : (run && run.chart && Array.isArray(run.chart.series) ? { rows: run.rows, series: run.chart.series } : null)
      const f = card.facts || {}
      const unit = card.unit || ''
      const fact = (label, value) => h('div', { className: 'tds-insight-fact', key: label },
        h('span', null, label), h('b', null, value))

      return h('div', { className: 'tds-modal-mask', onClick: onClose },
        h('div', { className: 'tds-modal tds-insight-detail', onClick: (e) => e.stopPropagation() },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { className: 'tds-modal-title' }, card.title),
              h('div', { className: 'tds-modal-desc' }, card.narrative)),
            h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: onClose }, '关闭')),
          h('div', { className: 'tds-insight-factgrid' },
            fact('当前值', fmt2(f.current) + unit),
            fact(card.kind === 'trend' ? '24h 起点' : '基线', fmt2(f.baseline) + unit),
            fact('变化', deltaText(f.deltaPct)),
            f.z != null ? fact('偏离(σ)', fmt2(f.z)) : null,
            f.limit != null ? fact('阈值', fmt2(f.limit) + unit) : null,
            fact('样本数', f.samples == null ? '—' : String(f.samples))),
          h('div', { className: 'tds-insight-section' }, '影响与建议'),
          h('div', { className: 'tds-insight-narrative' }, [card.impact, card.action].filter(Boolean).join(' · ')),
          h('div', { className: 'tds-insight-section' }, (card.windowLabel || '近 24 小时') + '趋势'),
          loading
            ? h('div', { className: 'tds-empty' }, '加载中…')
            : error
              ? h('div', { className: 'tds-ask-error' }, error)
              : chart
                ? h(LineChart, { rows: chart.rows, xField: 'ts', series: chart.series, height: 220 })
                : h('div', { className: 'tds-empty' }, '暂无趋势数据'),
          h('div', { className: 'tds-insight-section' }, '只读 SQL（可复制复核）'),
          h('pre', { className: 'tds-ask-sqlbox', style: { whiteSpace: 'pre-wrap', overflowX: 'auto' } }, card.sql || ''),
          h('div', { className: 'tds-insight-actions', style: { marginTop: 12 } },
            h('button', { onClick: () => onAsk(card) }, '💬 用智能查询追问'),
            h('span', { className: 'tds-insight-sub' },
              [card.db, card.table, card.dimension?.value].filter(Boolean).join(' · ')))))
    }

    function InsightsTab({ activeDb, mode, onAsk }) {
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(false)
      const [scanning, setScanning] = useState(false)
      const [error, setError] = useState('')
      const [filter, setFilter] = useState('all')
      const [detail, setDetail] = useState(null)
      const [range, setRange] = useState('24h')

      const INSIGHT_RANGES = [
        { key: '1h', label: '近 1 小时' },
        { key: '6h', label: '近 6 小时' },
        { key: '24h', label: '近 24 小时' },
        { key: '7d', label: '近 7 天' },
      ]

      async function load(force) {
        if (!activeDb) return
        try {
          const q = '/insights?db=' + encodeURIComponent(activeDb)
            + '&mode=' + (mode === 'rookie' ? 'rookie' : 'pro')
            + '&window=' + range
            + (force ? '&refresh=1' : '')
          const body = await tdsApi(q)
          setData(body)
          setScanning(!!body.scanning)
          setError('')
        } catch (err) {
          setError(err.message || String(err))
        }
      }

      useEffect(() => {
        setData(null)
        setDetail(null)
        setError('')
        setScanning(false)
        if (activeDb) load(false)
      }, [activeDb, mode, range])

      // 后台扫描时轮询结果
      useEffect(() => {
        if (!scanning) return undefined
        const t = setTimeout(() => load(false), 2000)
        return () => clearTimeout(t)
      }, [scanning, data])

      // 进入页面后每 10 分钟自动巡检；离开页面（卸载）自动停止
      useEffect(() => {
        if (!activeDb) return undefined
        const t = setInterval(() => load(false), 10 * 60 * 1000)
        return () => clearInterval(t)
      }, [activeDb, mode, range])

      async function scanNow() {
        if (!activeDb || loading) return
        setLoading(true)
        setError('')
        try {
          const { status, body } = await tdsPost('/insights/scan', { db: activeDb, mode, window: range })
          if (status >= 400 || body.ok === false) setError(body.error || ('HTTP ' + status))
          else { setData({ ...body, scanning: false }); setScanning(false) }
        } finally {
          setLoading(false)
        }
      }

      async function dismiss(card) {
        await tdsPost('/insights/dismiss', { id: card.id }).catch(() => {})
        setData((d) => (d ? { ...d, insights: (d.insights || []).filter((x) => x.id !== card.id) } : d))
        setDetail(null)
      }

      if (!activeDb) return h('div', { className: 'tds-empty', style: { marginTop: 60 } }, '请先在右上角选择数据库')

      const meta = data?.meta || {}
      let list = Array.isArray(data?.insights) ? data.insights.slice() : []
      if (filter === 'high') list = list.filter((x) => x.severity >= 80)
      list.sort((a, b) => b.severity - a.severity)
      if (mode === 'rookie') list = list.slice(0, 3)
      const scanningNow = scanning || loading || (!!meta.scanning && !list.length)

      return h('div', { className: 'tds-insights' },
        h('div', { className: 'tds-insight-head' },
          h('div', { className: 'tds-insight-head-left' },
            h('b', null, '💡 无问智推'),
            h('span', { className: 'tds-insight-sub' },
              activeDb
              + ' · ' + (meta.windowLabel || '')
              + ' · ' + (meta.scannedAt ? '上次巡检 ' + new Date(meta.scannedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未巡检')
              + (meta.elapsedMs ? ' · ' + (meta.elapsedMs / 1000).toFixed(1) + 's' : '')
              + (meta.model ? ' · ' + meta.model : '')
              + (meta.partial ? ' · 部分结果' : ''))),
          h('div', { className: 'tds-insight-filters' },
            h('select', { className: 'tds-connect', value: range, title: '巡检观察窗口：窗口越长越能发现缓慢演变的异常', onChange: (e) => setRange(e.target.value) },
              INSIGHT_RANGES.map((r) => h('option', { key: r.key, value: r.key }, '🕒 ' + r.label))),
            h('button', { className: cls('tds-chip', filter === 'all' && 'tds-active'), onClick: () => setFilter('all') }, '全部'),
            h('button', { className: cls('tds-chip', filter === 'high' && 'tds-active'), onClick: () => setFilter('high') }, '仅高危'),
            h('button', { className: 'tds-btn tds-btn-sm', disabled: scanningNow, onClick: scanNow },
              scanningNow ? '巡检中…' : '立即巡检'))),
        error ? h('div', { className: 'tds-ask-error' }, error) : null,
        scanningNow && !list.length
          ? h('div', { className: 'tds-empty', style: { padding: '50px 0' } }, '🔍 正在巡检超级表（突变 / 趋势 / 越限 / 告警聚集）…')
          : null,
        !scanningNow && !list.length
          ? h('div', { className: 'tds-empty', style: { padding: '50px 0' } },
              h('div', { style: { marginBottom: 10 } }, (meta.windowLabel || '近期') + '未发现值得关注的变化，可切换更长的窗口或点「立即巡检」。'),
              h('button', { className: 'tds-btn tds-btn-ghost tds-btn-sm', onClick: scanNow }, '重新巡检'))
          : null,
        list.length
          ? h('div', { className: 'tds-insight-list' },
              list.map((card) => h(InsightCard, { key: card.id, card, mode, onDetail: setDetail, onAsk, onDismiss: dismiss })))
          : null,
        detail ? h(InsightDetail, { card: detail, onClose: () => setDetail(null), onAsk }) : null)
    }

    /* ============================================================
     * 侧边栏图标
     * ============================================================ */

    function SidebarIcon(props) {
      return h(StudioIcon, props || { size: 16 })
    }

    /* ============================================================
     * 聊天内联：TDengine 工具结果卡片
     * 通过 Harness 的 tool.call.toolview 键位插槽，把 td_* 工具的
     * 结果渲染成 ECharts 图表 / 表格 / 洞察卡片，直接嵌在聊天气泡里。
     * ============================================================ */

    const TD_TOOL_NAMES = ['td_query', 'td_insights', 'td_list_databases', 'td_list_tables', 'td_desc_table', 'td_connect', 'td_schema_refresh']
    const TD_TOOL_LABELS = {
      td_query: 'TDengine 查询',
      td_insights: 'TDengine 智能洞察',
      td_list_databases: 'TDengine 数据库列表',
      td_list_tables: 'TDengine 数据表',
      td_desc_table: 'TDengine 表结构',
      td_connect: 'TDengine 连接测试',
      td_schema_refresh: 'TDengine Schema',
    }

    /** 从工具调用块里取出参数（preparing/start/result 三态兼容）。 */
    function toolArgsOf(block) {
      try {
        const raw = block && ('kind' in block) ? block.call?.argsRaw : block?.argsRaw
        return raw ? JSON.parse(raw) : {}
      } catch { return {} }
    }

    /** 把工具结果内容块（text JSON）还原为对象。 */
    function toolResultOf(block) {
      if (!block || !('kind' in block)) return null
      const parts = []
      for (const item of block.content || []) {
        if (item && item.type === 'text') parts.push(item.text)
        else if (item) parts.push(JSON.stringify(item))
      }
      const raw = parts.join('\n').trim()
      if (!raw) return null
      try { return JSON.parse(raw) } catch { return { __text: raw } }
    }

    function tdColumnNames(res) {
      return (res.column_meta || []).map((c, i) => {
        const name = Array.isArray(c) ? c[0] : c
        return String(name || ('col' + (i + 1)))
      })
    }

    /** TDengine REST（column_meta + data）→ 对象行，便于图表与表格复用。 */
    function tdRowsOf(res) {
      const columns = tdColumnNames(res)
      const types = (res.column_meta || []).map((c) => String((Array.isArray(c) ? c[1] : '') || '').toUpperCase())
      const data = Array.isArray(res.data) ? res.data : []
      const rows = data.map((row) => {
        const o = {}
        columns.forEach((n, i) => { o[n] = Array.isArray(row) ? row[i] : (row ? row[n] : null) })
        return o
      })
      return { columns, types, rows }
    }

    /** 结果驱动图表：时间列 + 数值列 → 折线；类别列 + 数值列 → 柱状。 */
    function tdChartSpec(columns, types, rows) {
      if (!rows || !rows.length) return null
      const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))
      let timeField = null
      columns.forEach((name, i) => {
        const t = types[i] || ''
        if (!timeField && (t === 'TIMESTAMP' || /^(ts|time|timestamp|_wstart|_wstop)$/i.test(name) || /时间/.test(name))) timeField = name
      })
      const numFields = columns.filter((name, i) => {
        if ((types[i] || '') === 'TIMESTAMP') return false
        const sample = rows.slice(0, 5).map((r) => r[name]).filter((v) => v != null && v !== '')
        return sample.length > 0 && sample.every(isNum)
      })
      if (timeField && numFields.length) {
        return { type: 'line', xField: timeField, series: numFields.slice(0, 3).map((f) => ({ field: f, name: f })) }
      }
      if (numFields.length && numFields[0] !== columns[0] && rows.length <= 30) {
        return { type: 'bar', xField: columns[0], series: [{ field: numFields[0], name: numFields[0] }] }
      }
      return null
    }

    function tdCellText(v) {
      if (v == null) return '—'
      if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
      if (typeof v === 'boolean') return v ? 'true' : 'false'
      const s = String(v)
      return s.length > 80 ? s.slice(0, 80) + '…' : s
    }

    function TdResultTable({ columns, rows }) {
      return h('div', { className: 'tds-tool-table-wrap' },
        h('table', { className: 'tds-tool-table' },
          h('thead', null, h('tr', null, columns.map((c) => h('th', { key: c }, c)))),
          h('tbody', null, rows.slice(0, 200).map((r, i) =>
            h('tr', { key: i }, columns.map((c) => h('td', { key: c, title: String(r[c] == null ? '' : r[c]) }, tdCellText(r[c]))))))))
    }

    function tdShorten(sql) {
      const s = String(sql || '').replace(/\s+/g, ' ').trim()
      return s.length > 90 ? s.slice(0, 90) + '…' : s
    }

    function tdErrText(err) {
      if (err == null) return ''
      if (typeof err === 'string') return err
      if (err && typeof err.message === 'string') return err.message
      try { return JSON.stringify(err) } catch { return String(err) }
    }

    function tdSeverityTone(sev) {
      if (sev >= 80) return { background: 'rgba(239,68,68,.15)', color: '#f87171' }
      if (sev >= 60) return { background: 'rgba(245,158,11,.15)', color: '#fbbf24' }
      return { background: 'rgba(59,130,246,.15)', color: '#60a5fa' }
    }

    /** 卡片对应的全屏页落点：洞察→洞察页；自由查询→SQL 工作台并带入 SQL；其余→数据库页。 */
    function tdNavTarget(toolName, args) {
      if (toolName === 'td_insights') return { tab: 'insights' }
      if (toolName === 'td_connect') return { tab: 'overview' }
      if (toolName === 'td_query') return { tab: 'browse', sql: (args && args.sql) || '' }
      return { tab: 'browse' }
    }

    function TdToolSummary(toolName, value) {
      if (!value || value.__text) return ''
      if (toolName === 'td_connect') return value.ok ? ('连接成功 · ' + (value.version || '')) : (value.message || '连接失败')
      if (toolName === 'td_insights') {
        const n = (value.insights || []).length
        if (!n) return '未发现异常'
        const m = value.meta || {}
        return n + ' 条洞察' + (m.tablesScanned != null ? ' · ' + m.tablesScanned + ' 表' : '') + (m.elapsedMs != null ? ' · ' + m.elapsedMs + 'ms' : '')
      }
      if (Array.isArray(value.data)) return value.data.length + ' 行 · ' + (value.column_meta || []).length + ' 列'
      if (value.error) return tdErrText(value.error)
      return ''
    }

    function TdToolBody({ toolName, phase, args, value, errText }) {
      const [tab, setTab] = useState('chart')

      if (phase === 'preparing') return h('div', { className: 'tds-tool-empty' }, '正在准备执行…')
      if (phase === 'start') {
        return args.sql
          ? h('pre', { className: 'tds-tool-sql' }, args.sql)
          : h('div', { className: 'tds-tool-empty' }, '执行中…')
      }
      if (errText) {
        return h('div', null,
          h('div', { className: 'tds-tool-err' }, String(errText)),
          args.sql ? h('pre', { className: 'tds-tool-sql', style: { marginTop: 8 } }, args.sql) : null)
      }
      if (!value) return h('div', { className: 'tds-tool-empty' }, '无返回结果')
      if (value.__text) return h('pre', { className: 'tds-tool-sql' }, value.__text)

      if (toolName === 'td_connect') {
        return h('div', { className: 'tds-tool-meta' },
          h('span', null, value.ok ? '✅ 连接成功' : '❌ 连接失败'),
          value.version ? h('span', null, '版本 ' + value.version) : null,
          value.message ? h('span', null, value.message) : null)
      }

      if (toolName === 'td_insights') {
        const list = Array.isArray(value.insights) ? value.insights : []
        const m = value.meta || {}
        return h('div', null,
          h('div', { className: 'tds-tool-meta' },
            h('span', null, '观察窗口 ' + (m.windowLabel || m.window || '24h')),
            m.tablesScanned != null ? h('span', null, '表 ' + m.tablesScanned) : null,
            m.sqlCount != null ? h('span', null, 'SQL ' + m.sqlCount) : null,
            m.elapsedMs != null ? h('span', null, '耗时 ' + m.elapsedMs + 'ms') : null),
          m.partial ? h('div', { className: 'tds-tool-empty', style: { color: '#f0b35b' } }, '巡检达到时间预算，结果可能不完整。') : null,
          list.length
            ? list.map((it, i) => h('div', { className: 'tds-tool-insight', key: i },
                h('div', { className: 'tds-tool-insight-head' },
                  h('span', { className: 'tds-insight-badge', style: tdSeverityTone(it.severity || 0) }, '严重度 ' + (it.severity != null ? it.severity : '-')),
                  h('span', { className: 'tds-tool-insight-title' }, it.title || it.kind || '异常')),
                it.narrative ? h('p', null, it.narrative) : null,
                (it.target || it.column)
                  ? h('p', { style: { color: '#5f6065' } }, [it.target, it.column].filter(Boolean).join(' · '))
                  : null))
            : h('div', { className: 'tds-tool-empty' }, '该窗口内未发现值得关注的变化。'))
      }

      /* td_query / td_list_* / td_desc_table / td_schema_refresh */
      const table = tdRowsOf(value)
      if (!table.rows.length) {
        return h('div', null,
          h('div', { className: 'tds-tool-empty' }, '查询成功，但返回 0 行。'),
          args.sql ? h('pre', { className: 'tds-tool-sql' }, args.sql) : null)
      }
      // 只有自由查询才尝试出图；库/表清单、表结构保持表格形态更直观
      const spec = toolName === 'td_query' ? tdChartSpec(table.columns, table.types, table.rows) : null
      const active = spec ? tab : 'table'
      const body = active === 'sql' && args.sql
        ? h('pre', { className: 'tds-tool-sql' }, args.sql)
        : active === 'chart' && spec
          ? h('div', { style: { height: 200 } }, h(LineChart, { rows: table.rows, xField: spec.xField, series: spec.series, height: 200, chartType: spec.type }))
          : h(TdResultTable, { columns: table.columns, rows: table.rows })

      return h('div', null,
        h('div', { className: 'tds-tool-meta' },
          h('span', null, table.rows.length + ' 行'),
          h('span', null, table.columns.length + ' 列'),
          h('span', null, '只读查询')),
        h('div', { className: 'tds-tool-tabs' },
          spec ? h('button', { className: 'tds-tool-tab' + (tab === 'chart' ? ' active' : ''), onClick: () => setTab('chart') }, '📈 图表') : null,
          h('button', { className: 'tds-tool-tab' + (active === 'table' ? ' active' : ''), onClick: () => setTab('table') }, '📋 数据'),
          args.sql ? h('button', { className: 'tds-tool-tab' + (active === 'sql' ? ' active' : ''), onClick: () => setTab('sql') }, '🧾 SQL') : null),
        body)
    }

    /**
     * 单个 td_* 工具的聊天内联视图。props 来自 ui-tool：
     * { callId, toolName, phase, block, inspect, useDisclosure, ... }
     */
    function TdToolRow(props) {
      const [open, setOpen] = useState(true)
      const toolName = props.toolName
      const phase = props.phase
      const block = props.block
      const label = TD_TOOL_LABELS[toolName] || ('TDengine · ' + toolName)
      const args = toolArgsOf(block)
      const isResult = !!block && ('kind' in block)
      const value = isResult ? toolResultOf(block) : null
      const failed = isResult && !!(block.isError || (value && value.error))
      const errText = failed
        ? (value && value.error
            ? tdErrText(value.error)
            : (block.error ? (block.error.name + ': ' + block.error.code) : '执行失败'))
        : null

      let summary = ''
      if (phase === 'preparing') summary = '准备执行…'
      else if (phase === 'start') summary = args.sql ? tdShorten(args.sql) : '执行中…'
      else summary = errText || TdToolSummary(toolName, value)

      const stateClass = phase === 'preparing' || phase === 'start' ? 'running' : failed ? 'error' : 'ok'

      return h('div', { className: 'tds-tool', 'data-tool': toolName, 'data-state': stateClass },
        h('div', { className: 'tds-tool-head', onClick: () => setOpen((v) => !v) },
          h('span', { className: 'tds-tool-dot ' + stateClass }),
          h('span', { className: 'tds-tool-name' }, label),
          h('span', { className: 'tds-tool-sum' }, summary),
          h('button', {
            className: 'tds-tool-open',
            title: '在 TDengine Studio 全屏工作台中打开',
            onClick: (e) => {
              e.stopPropagation()
              if (navigateToStudio) navigateToStudio(tdNavTarget(toolName, args))
            },
          }, '⤢ 全屏'),
          h('span', { className: 'tds-tool-chev' + (open ? ' open' : '') }, '›')),
        open ? h('div', { className: 'tds-tool-body' },
          h(TdToolBody, { toolName, phase, args, value, errText })) : null)
    }

    /* ============================================================
     * apply 注册
     * ============================================================ */

    function apply(ctx) {
      ctx.effect(() => installStyle(), 'dsh-td-studio: styles')
      // 聊天卡片「全屏」按钮 → 切到 layout 的 main 面板
      navigateToStudio = (target) => {
        pendingNav = target || {}
        try {
          if (ctx.layout && typeof ctx.layout.selectPanel === 'function') {
            ctx.layout.selectPanel(PANEL_ID)
          } else {
            console.warn('[td-studio] layout 服务不可用，无法打开全屏页')
            pendingNav = null
          }
        } catch (e) {
          console.warn('[td-studio] 打开全屏页失败:', e.message)
          pendingNav = null
        }
      }
      ctx.slots.inject('main', () => ctx.slots.register(
        { name: 'main', key: PANEL_ID },
        () => h(Boundary, null, h(MonitorPanel))))
      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 21,
        label: () => 'TDengine Studio',
      }, SidebarIcon)), 'dsh-td-studio: sidebar entry')
      // 聊天内联：把 td_* 工具结果渲染成图表/表格/洞察卡片
      for (const toolName of TD_TOOL_NAMES) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview', key: toolName,
        }, TdToolRow))
      }
    }

    return { name: 'dsh-td-studio', apply, inject: ['slots', 'layout'] }
  }
})
