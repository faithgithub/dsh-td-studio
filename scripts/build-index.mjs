#!/usr/bin/env node
/**
 * 生成 DSH 插件市场索引 market/index.json（format 1）。
 *
 * 用法：
 *   1. 先提交并推送一个发布版本；
 *   2. 运行 `node scripts/build-index.mjs`；
 *   3. 提交并推送生成的 market/index.json。
 *
 * 索引里的 git source 需要固定的 40 位 commit SHA，所以索引必须指向
 * 上一个发布 commit，而不是包含索引文件本身的 commit。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

function resolveRepoUrl() {
  const fallback = 'https://github.com/wuxinyang/dsh-td-studio.git'
  try {
    const origin = git('remote', 'get-url', 'origin')
    const match = origin.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
    if (match) return `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}.git`
  } catch { /* 尚未配置 remote 时使用默认地址 */ }
  return fallback
}

const commit = git('rev-parse', 'HEAD')
const publishTimestamp = Number(git('log', '-1', '--format=%ct'))
const repoUrl = resolveRepoUrl()
const repoWeb = repoUrl.replace(/\.git$/, '')

const index = {
  format: 1,
  title: { en: 'TDengine Studio', zh: 'TDengine 智能工作台' },
  description: {
    en: 'AI-native TDengine plugins for DeepSeek Harness.',
    zh: '面向 DeepSeek Harness 的 AI 原生 TDengine 插件。',
  },
  metadata: {
    categories: {
      data: { title: { en: 'Data & Databases', zh: '数据与数据库' } },
    },
    labels: {},
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'TDengine Studio', zh: 'TDengine 智能工作台' },
      description: {
        en: pkg.description,
        zh: 'AI 原生 TDengine 工作台：ECharts 看板、只读 SQL、自然语言问数与异常洞察。',
      },
      author: pkg.author || 'wuxinyang',
      homepage: `${repoWeb}#readme`,
      repository: { url: repoWeb },
      icon: '../icon.svg',
      metadata: {
        category: 'data',
        keywords: [
          'tdengine',
          'timeseries',
          'sql',
          'dashboard',
          'echarts',
          'natural-language-sql',
          'anomaly-detection',
          'ai',
        ],
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp,
          source: { type: 'git', url: repoUrl, commit },
          engines: { dsh: pkg.engines.dsh },
        },
      ],
    },
  ],
}

mkdirSync(join(root, 'market'), { recursive: true })
writeFileSync(join(root, 'market', 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`wrote market/index.json → ${pkg.name}@${pkg.version} (${commit.slice(0, 12)})`)
