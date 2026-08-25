import test from 'node:test'
import assert from 'node:assert/strict'
import { samples, sample } from '../src/lib/sample.js'
import { themes } from '../src/lib/themes.js'
import { renderMarkdown } from '../src/lib/renderer.js'

test('主题库保留 26 套完整主题，且标识与样式均唯一', () => {
  assert.equal(themes.length, 26)
  assert.equal(themes[0].id, 'literary')
  assert.deepEqual(
    themes.map((item) => item.id),
    [
      'literary',
      'swiss-index',
      'night-film',
      'white-cube',
      'pixel-quest',
      'velocity-report',
      'mobai',
      'klein',
      'xuanzhi',
      'morandi-green',
      'midnight-gold',
      'cream-orange',
      'mint-soda',
      'brick-industry',
      'mori-journal',
      'fleet-street',
      'blueprint',
      'peach-soda',
      'mono-editorial',
      'lemon-sea',
      'wisteria',
      'hk-neon',
      'nordic',
      'latte',
      'cyan-scape',
      'candy-pop',
    ]
  )
  assert.equal(new Set(themes.map((item) => item.id)).size, themes.length)
  assert.ok(themes.every((item) => item.name && item.tag && item.description))
  assert.ok(themes.every((item) => item.surface && item.primary))
  assert.equal(new Set(themes.map((item) => item.styles(item.primary).h1)).size, themes.length)
  assert.ok(
    ['green', 'apple', 'hardcore', 'brutal', 'dopamine', 'magazine'].every(
      (id) => !themes.some((item) => item.id === id)
    )
  )
})

test('内置示例只保留一篇默认样章', () => {
  assert.equal(samples.length, 1)
  assert.equal(sample, samples[0].md)
  const [entry] = samples
  assert.ok(entry.id && entry.title && entry.description && entry.md)
})

test('默认样章覆盖常用语法与项目信息', () => {
  const requiredPatterns = [
    /^# /m, // 文章标题
    /^## /m, // 二级标题
    /^### /m, // 三级标题
    /^#### /m, // 四级标题
    /^##### /m, // 五级标题
    /^###### /m, // 六级标题
    /\*\*.+\*\*/, // 粗体
    /\*.+\*/, // 斜体
    /~~.+~~/, // 删除线
    /==.+==/, // 高亮
    /`[^`]+`/, // 行内代码
    /^> /m, // 引用
    /^> > /m, // 嵌套引用
    /^- /m, // 无序列表
    /^ {2}- /m, // 嵌套列表
    /^\d+\. /m, // 有序列表
    /\|.+\|/, // 表格
    /```\w*\n/, // 围栏代码块
    /\$[^$]+\$/, // 行内公式
    /^\$\$$/m, // 块级公式
    /!\[.+\]\(.+\)/, // 图片
    /^<video[\s>]/m, // 视频占位写法
    /\[[^\]]+\]\(https?:\/\/[^)]+\)/, // 链接
    /\[[^\]]+\]\[[^\]]+\]/, // 参考式链接
    /<https:\/\/.+>/, // 自动链接
    /^---$/m, // 分割线
    /github\.com\//, // 项目地址（占位）
    /阅读全文/, // 公众号阅读全文提示
  ]

  for (const pattern of requiredPatterns) assert.match(sample, pattern)
})

test('默认样章包含多种数量的画廊拼贴', () => {
  const consecutiveThreeImages =
    /!\[[^\]]+\]\([^)]+\)\n\n!\[[^\]]+\]\([^)]+\)\n\n!\[[^\]]+\]\([^)]+\)/
  assert.match(sample, consecutiveThreeImages)
  // 单张图注 + 两图 + 三图 + 四图画廊，共 10 张示例图
  assert.ok((sample.match(/!\[/g) || []).length >= 10)
})

test('默认样章的公式保留 LaTeX 反斜杠并可正确渲染', () => {
  assert.match(sample, /\\\(a\^2\+b\^2=c\^2\\\)/)
  assert.match(sample, /\\int_\{-\\infty\}\^\{\\infty\}/)
  assert.match(sample, /\\\[\ne\^\{i\\pi\}\+1=0\n\\\]/)
  assert.doesNotMatch(sample, /[\b\f]/)

  const html = renderMarkdown(sample, themes[0], {})
  assert.equal((html.match(/data-math-display=/g) || []).length, 4)
  assert.doesNotMatch(html, /data-math-error/)
})
