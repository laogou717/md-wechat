import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
// 只注册常用语言，避免全量（150+）或 common（40）语言打入包内。
// 未注册的语言自动回退为纯文本代码块，不影响排版。
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import java from 'highlight.js/lib/languages/java'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import kotlin from 'highlight.js/lib/languages/kotlin'
import swift from 'highlight.js/lib/languages/swift'
import markdown from 'highlight.js/lib/languages/markdown'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'

const LANGUAGES = {
  javascript,
  typescript,
  python,
  java,
  c,
  cpp,
  go,
  rust,
  sql,
  bash,
  json,
  css,
  xml,
  yaml,
  php,
  ruby,
  kotlin,
  swift,
  markdown,
  diff,
  dockerfile,
  ini,
}
for (const [name, register] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, register)

import { buildStyles } from './themes.js'
import { renderMathSvg, resetMathRenderer } from './mathjax.js'

// highlight.js 类名 -> 内联样式，深浅两套配色（公众号会剥离 <style>，高亮必须内联）。
const HLJS_DARK = {
  'hljs-comment': 'color:#7f848e;font-style:italic',
  'hljs-quote': 'color:#7f848e;font-style:italic',
  'hljs-keyword': 'color:#c678dd',
  'hljs-selector-tag': 'color:#c678dd',
  'hljs-built_in': 'color:#e6c07b',
  'hljs-name': 'color:#e06c75',
  'hljs-tag': 'color:#e06c75',
  'hljs-attr': 'color:#d19a66',
  'hljs-attribute': 'color:#d19a66',
  'hljs-variable': 'color:#e06c75',
  'hljs-template-variable': 'color:#e06c75',
  'hljs-type': 'color:#e6c07b',
  'hljs-string': 'color:#98c379',
  'hljs-regexp': 'color:#98c379',
  'hljs-symbol': 'color:#56b6c2',
  'hljs-number': 'color:#d19a66',
  'hljs-literal': 'color:#56b6c2',
  'hljs-title': 'color:#61afef',
  'hljs-title.function_': 'color:#61afef',
  'hljs-title.class_': 'color:#e6c07b',
  'hljs-section': 'color:#61afef',
  'hljs-meta': 'color:#61afef',
  'hljs-link': 'color:#56b6c2',
  'hljs-emphasis': 'font-style:italic',
  'hljs-strong': 'font-weight:bold',
}

const HLJS_LIGHT = {
  'hljs-comment': 'color:#6a737d;font-style:italic',
  'hljs-quote': 'color:#6a737d;font-style:italic',
  'hljs-keyword': 'color:#d73a49',
  'hljs-selector-tag': 'color:#d73a49',
  'hljs-built_in': 'color:#e36209',
  'hljs-name': 'color:#22863a',
  'hljs-tag': 'color:#22863a',
  'hljs-attr': 'color:#6f42c1',
  'hljs-attribute': 'color:#6f42c1',
  'hljs-variable': 'color:#e36209',
  'hljs-template-variable': 'color:#e36209',
  'hljs-type': 'color:#d73a49',
  'hljs-string': 'color:#032f62',
  'hljs-regexp': 'color:#032f62',
  'hljs-symbol': 'color:#005cc5',
  'hljs-number': 'color:#005cc5',
  'hljs-literal': 'color:#005cc5',
  'hljs-title': 'color:#6f42c1',
  'hljs-title.function_': 'color:#6f42c1',
  'hljs-title.class_': 'color:#22863a',
  'hljs-section': 'color:#005cc5',
  'hljs-meta': 'color:#005cc5',
  'hljs-link': 'color:#032f62',
  'hljs-emphasis': 'font-style:italic',
  'hljs-strong': 'font-weight:bold',
}

// 代码块外观：深色窗口 / 浅色纸面
const CODE_CHROME = {
  dark: { hl: HLJS_DARK, bg: '#282c34', border: '', text: '#abb2bf', label: '#7f848e' },
  light: { hl: HLJS_LIGHT, bg: '#f6f8fa', border: 'border:1px solid #e1e4e8;', text: '#24292f', label: '#8b949e' },
}

function inlineHljsStyles(html, palette) {
  return html.replace(/class="([^"]+)"/g, (match, cls) => {
    const style = cls
      .trim()
      .split(/\s+/)
      .map((c) => palette[c])
      .filter(Boolean)
      .join(';')
    return style ? `style="${style}"` : ''
  })
}

// 每个「主题 + 设置」组合缓存一个渲染器实例，避免每次击键都重建。
// 渲染设置可能在拖动颜色、字号时快速产生大量组合，因此只保留最近使用的 12 个。
const CACHE_LIMIT = 12
const cache = new Map()

const normalizeGalleryMode = (mode) =>
  mode === 'grid' || mode === 'stack' || mode === 'collage' ? mode : 'collage'

// 网格图统一裁切比例（公众号已验证支持 aspect-ratio + object-fit）
const normalizeGalleryRatio = (ratio) => (ratio === '4:5' || ratio === '3:4' ? ratio : '1:1')

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 从样式串里提取颜色（主题主色 / 正文色跟随主题与自定义，不写死）
const colorOf = (styleCss, fallback) => (styleCss.match(/color:\s*([^;]+)/) || [])[1]?.trim() || fallback
const accentColorOf = (styles) => colorOf(styles.a, '#3f3f46')
const bodyColorOf = (styles) => colorOf(styles.container, '#3f3f46')

// 外链脚注区（预览与复制共用）：文末【参考资料】，网址以纯文本形式可读可搜。
// 公众号不支持外链，脚注是让链接信息不丢失的通用做法（mdnice 同款思路）。
export function buildFootnoteSection(styles, footnotes) {
  if (!footnotes?.length) return ''
  const accent = accentColorOf(styles)
  const body = bodyColorOf(styles)
  const items = footnotes
    .map((fn, i) => {
      const label = (fn.text || '').trim()
      const ref = fn.href.startsWith('mailto:') ? fn.href.slice(7) : fn.href
      const line = label && label !== ref ? `[${i + 1}] ${label}：${ref}` : `[${i + 1}] ${ref}`
      return `<p style="margin:0.3em 0;font-size:0.86em;color:${escapeHtmlAttr(
        body
      )};word-break:break-all;">${escapeHtmlAttr(line)}</p>`
    })
    .join('')
  return (
    `<section style="margin:2.2em 8px 0;padding-top:0.9em;border-top:1px solid #c8ccd0;">` +
    `<p style="margin:0 0 0.55em;font-weight:700;color:${escapeHtmlAttr(accent)};">参考资料</p>` +
    items +
    `</section>`
  )
}

// local: 图片引用解析（IndexedDB 图片库的 objectURL），由应用启动时注册。
// 未注册或解析失败时回退为空 src，渲染表现为占位而非破图链接。
let imageResolver = null
export function setImageResolver(fn) {
  imageResolver = typeof fn === 'function' ? fn : null
}
function resolveImageSrc(src) {
  if (!src.startsWith('local:')) return src
  if (!imageResolver) return ''
  return imageResolver(src) || ''
}

// 视频占位卡（渲染与复制链路共用）：attrs 供加 data-line 等属性，note 为说明行（调用方负责转义）
export function buildVideoPlaceholder(videoStyle, { attrs = '', note = '' } = {}) {
  const noteLine = note
    ? `<p style="margin:0.4em 0 0;font-size:0.78em;opacity:0.55;word-break:break-all;">${note}</p>`
    : ''
  return `<section${attrs} style="${escapeHtmlAttr(
    videoStyle
  )}"><p style="margin:0;font-size:1.35em;line-height:1.3;">▶</p><p style="margin:0.3em 0 0;font-weight:700;">视频占位</p>${noteLine}<p style="margin:0.4em 0 0;font-size:0.78em;opacity:0.55;">粘贴后请在公众号后台「插入 → 视频」替换此处</p></section>`
}

// ---- 对齐式画廊：按图片宽高比分配宽度，天然同高、上下齐平 ----
// 比例由应用侧量取后注册（本地图粘贴时、外链图加载后）；未知时按 4:3 估算。
let aspectProvider = null
export function setImageAspectProvider(fn) {
  aspectProvider = typeof fn === 'function' ? fn : null
}
function aspectOf(src) {
  const v = aspectProvider ? Number(aspectProvider(src)) : 0
  return Number.isFinite(v) && v > 0.1 && v < 10 ? v : 4 / 3
}
// 用户在预览里拖拽调整后的宽度覆盖（按图片地址记忆）
let galleryOverrideProvider = null
export function setGalleryOverrideProvider(fn) {
  galleryOverrideProvider = typeof fn === 'function' ? fn : null
}
function overrideOf(src) {
  const v = galleryOverrideProvider ? Number(galleryOverrideProvider(src)) : 0
  return Number.isFinite(v) && v > 10 && v < 90 ? v : null
}
// 同排图片 高度 = 宽度/比例，故宽度按比例分配即同高。
// 间隙一律用行宽百分比（GAP），等式在任何行宽下严格成立、底边精确齐平。
const GAP = 0.012
function justifiedWidths(mode, count, aspects) {
  const row = (idxs) => {
    const sum = idxs.reduce((s, j) => s + aspects[j], 0)
    const scale = 1 - GAP * (idxs.length - 1)
    return idxs.map((j) => Math.round(((aspects[j] / sum) * scale) * 10000) / 100)
  }
  const all = [...Array(count).keys()]
  if (mode === 'grid') {
    // 网格：同宽均分，不按宽高比分配（公众号不执行固定高度裁切，
    // 同宽是唯一能保证的整齐观感）。每行 3 张（32.53%）；4 张为 2×2（49.4%）；
    // 尾行 2 张 49.4%、尾行 1 张 100%。宽度总和 + space-between 间隙 = 100%。
    const w3 = Math.round(((100 - GAP * 100 * 2) / 3) * 100) / 100
    const w2 = Math.round(((100 - GAP * 100) / 2) * 100) / 100
    const rows = []
    if (count === 2 || count === 4) {
      rows.push(2)
      if (count === 4) rows.push(2)
    } else {
      for (let rest = count; rest > 0; rest -= 3) rows.push(Math.min(3, rest))
    }
    const widths = []
    for (const n of rows) {
      const w = n === 3 ? w3 : n === 2 ? w2 : 100
      for (let i = 0; i < n; i++) widths.push(w)
    }
    return widths
  }
  if (count === 2) return row(all)
  if (count === 3) {
    // 左大图 + 右侧纵向两张：左高 = 右列总高。
    // 右列两图按"裁切填充"显示（固定高 = 左高的一半，见 rightColumnRatio），
    // 所以右列高恒等于左高，公式只需给出左宽基准；主图宽度封顶
    // [50, 68]%，横图/竖图首图时右列不至于过窄或过宽。
    const [a0, a1, a2] = aspects
    const S = 1 / a1 + 1 / a2 + GAP
    const x = (a0 * (1 - GAP) * S) / (1 + a0 * S)
    return [Math.round(Math.min(0.68, Math.max(0.5, x)) * 10000) / 100, null, null]
  }
  if (count === 4) return [null, ...row([1, 2, 3])]
  // 5+：焦点区同三图公式，余图每排对齐
  const [a0, a1, a2] = aspects
  const S = 1 / a1 + 1 / a2 + GAP
  const x = (a0 * (1 - GAP) * S) / (1 + a0 * S)
  const out = [Math.round(Math.min(0.68, Math.max(0.5, x)) * 10000) / 100, null, null]
  const rest = all.slice(3)
  const perRow = rest.length === 3 ? 3 : 2
  for (let s = 0; s < rest.length; s += perRow) out.push(...row(rest.slice(s, s + perRow)))
  return out
}

// 焦点区右列两图的裁切比例（宽:高）。左宽为最终宽度（含手动覆盖），
// 单位为"行宽百分比"：右列宽 = 行宽 - 左宽 - 间隙；两图各高 =
// (左图高 - 间隙) / 2。裁切填充使右列总高恒等于左图高，底边永远齐平，
// 且左图宽度可自由拖拽而不破坏对齐。
function rightColumnRatio(leftW, a0) {
  const leftH = leftW / a0
  const rightW = 100 - GAP * 100 - leftW
  const itemH = (leftH - GAP * 100) / 2
  if (!(rightW > 5) || !(itemH > 5)) return null
  return `${Math.round(rightW * 100) / 100}:${Math.round(itemH * 100) / 100}`
}

// 把高亮后的 HTML 按行拆开，span 标签在行尾闭合、下一行重新打开。
// 公众号粘贴会把 <pre> 里的 \n 拆散成独立段落导致换行错乱/内容丢失，
// 逐行块级 <code> 不存在 \n，就没有被拆的可能。
function splitCodeLines(html) {
  const lines = []
  const open = []
  let cur = ''
  let hasText = false
  const flush = () => {
    const body = cur + open.map(() => '</span>').join('')
    lines.push(hasText ? body : '&nbsp;')
    cur = open.join('')
    hasText = false
  }
  let i = 0
  while (i < html.length) {
    const ch = html[i]
    if (ch === '<') {
      const end = html.indexOf('>', i)
      const tag = html.slice(i, end + 1)
      if (tag.startsWith('</')) open.pop()
      else open.push(tag)
      cur += tag
      i = end + 1
    } else if (ch === '\n') {
      flush()
      i++
    } else {
      cur += ch
      if (!/\s/.test(ch)) hasText = true
      i++
    }
  }
  if (cur && (hasText || lines.length === 0)) flush()
  return lines
}

function createMd(theme, opts) {
  const styles = buildStyles(theme, opts)
  const chrome = opts.colorMode === 'dark' ? CODE_CHROME.dark : CODE_CHROME[theme.codeTheme] || CODE_CHROME.dark
  const macCode = !!opts.macCode
  const galleryMode = normalizeGalleryMode(opts.galleryMode)
  const galleryRatio = normalizeGalleryRatio(opts.galleryRatio).split(':').join('/')
  const linkFootnotes = !!opts.linkFootnotes
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
  md.use(markdownItMark) // ==高亮标记==
  const esc = md.utils.escapeHtml

  const renderFormula = (source, display, token, inlineContainer = false) => {
    const raw = String(source || '').trim()
    try {
      const formula = renderMathSvg(raw, display)
      const tag = display && !inlineContainer ? 'section' : 'span'
      const style = display ? styles.mathBlock : styles.mathInline
      return `<${tag}${display && !inlineContainer ? dl(token) : ''} data-math-display="${display ? 'true' : 'false'}" data-math-raw="${escapeHtmlAttr(raw)}" style="${escapeHtmlAttr(style)}">${formula}</${tag}>`
    } catch {
      const tag = display && !inlineContainer ? 'section' : 'span'
      return `<${tag}${display && !inlineContainer ? dl(token) : ''} data-math-error="true" style="${escapeHtmlAttr(
        `${display ? styles.mathBlock : styles.mathInline}${styles.mathError}`
      )}">${esc(raw)}</${tag}>`
    }
  }

  // ---- LaTeX 公式：$...$ / $$...$$ / \(...\) / \[...\] ----
  // 块公式必须独占一行；行内美元符号遵循空白边界规则，尽量避免把金额误判为公式。
  const mathBlock = (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    const line = state.src.slice(start, max)
    const trimmed = line.trim()
    const dollar = trimmed.startsWith('$$')
    const bracket = trimmed.startsWith('\\[')
    if (!dollar && !bracket) return false

    const open = dollar ? '$$' : '\\['
    const close = dollar ? '$$' : '\\]'
    let content = trimmed.slice(open.length)
    let nextLine = startLine
    let closed = false

    const sameLineEnd = content.lastIndexOf(close)
    if (sameLineEnd >= 0 && !content.slice(sameLineEnd + close.length).trim()) {
      content = content.slice(0, sameLineEnd)
      closed = true
    } else {
      const lines = [content]
      while (++nextLine < endLine) {
        const text = state.src.slice(
          state.bMarks[nextLine] + state.tShift[nextLine],
          state.eMarks[nextLine]
        )
        const end = text.lastIndexOf(close)
        if (end >= 0 && !text.slice(end + close.length).trim()) {
          lines.push(text.slice(0, end))
          closed = true
          break
        }
        lines.push(text)
      }
      content = lines.join('\n')
    }
    if (!closed) return false
    if (silent) return true

    const token = state.push('math_block', '', 0)
    token.block = true
    token.content = content.trim()
    token.map = [startLine, nextLine + 1]
    state.line = nextLine + 1
    return true
  }

  const isEscaped = (src, pos) => {
    let slashes = 0
    while (pos - slashes - 1 >= 0 && src[pos - slashes - 1] === '\\') slashes++
    return slashes % 2 === 1
  }

  const dollarInline = (state, silent) => {
    const start = state.pos
    if (state.src[start] !== '$' || state.src[start + 1] === '$' || isEscaped(state.src, start)) return false
    const afterOpen = state.src[start + 1]
    if (!afterOpen || /\s/.test(afterOpen)) return false

    let end = start + 1
    while ((end = state.src.indexOf('$', end)) >= 0) {
      if (!isEscaped(state.src, end) && state.src[end + 1] !== '$' && !/\s/.test(state.src[end - 1])) break
      end++
    }
    if (end < 0) return false
    // 形如 $19.9 或 19$ 的金额不作为公式；公式中至少应含字母、命令或运算符。
    const content = state.src.slice(start + 1, end)
    if (/^\d[\d,.]*$/.test(content)) return false
    if (!silent) {
      const token = state.push('math_inline', '', 0)
      token.content = content
    }
    state.pos = end + 1
    return true
  }

  const bracketInline = (state, silent) => {
    const start = state.pos
    if (state.src.slice(start, start + 2) !== '\\(' || isEscaped(state.src, start)) return false
    let end = state.src.indexOf('\\)', start + 2)
    while (end >= 0 && isEscaped(state.src, end)) end = state.src.indexOf('\\)', end + 2)
    if (end < 0) return false
    if (!silent) {
      const token = state.push('math_inline', '', 0)
      token.content = state.src.slice(start + 2, end)
    }
    state.pos = end + 2
    return true
  }

  // \[...\] 即便与文字写在同一源码行，也保持“行间公式”语义。使用 block 样式的
  // span 避免在段落内部输出非法 section；独占一行时仍优先由上面的块规则处理。
  const bracketDisplayInline = (state, silent) => {
    const start = state.pos
    if (state.src.slice(start, start + 2) !== '\\[' || isEscaped(state.src, start)) return false
    let end = state.src.indexOf('\\]', start + 2)
    while (end >= 0 && isEscaped(state.src, end)) end = state.src.indexOf('\\]', end + 2)
    if (end < 0) return false
    if (!silent) {
      const token = state.push('math_display_inline', '', 0)
      token.content = state.src.slice(start + 2, end)
    }
    state.pos = end + 2
    return true
  }

  md.block.ruler.before('fence', 'math_block', mathBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
  md.inline.ruler.before('escape', 'math_display_bracket', bracketDisplayInline)
  md.inline.ruler.before('escape', 'math_inline_bracket', bracketInline)
  md.inline.ruler.before('escape', 'math_inline_dollar', dollarInline)
  md.renderer.rules.math_inline = (tokens, idx) => renderFormula(tokens[idx].content, false, tokens[idx])
  md.renderer.rules.math_display_inline = (tokens, idx) =>
    renderFormula(tokens[idx].content, true, tokens[idx], true)
  md.renderer.rules.math_block = (tokens, idx) => renderFormula(tokens[idx].content, true, tokens[idx])

  // 同步滚动定位：给块级元素打上源码行号（预览用，复制时会剥离）
  const dl = (token) => (token && token.map ? ` data-line="${token.map[0]}"` : '')
  const defaultRenderToken = md.renderer.renderToken.bind(md.renderer)
  md.renderer.renderToken = (tokens, idx, options) => {
    const t = tokens[idx]
    if (t.map && t.nesting === 1 && !t.attrGet('data-line')) t.attrSet('data-line', String(t.map[0]))
    return defaultRenderToken(tokens, idx, options)
  }

  // ---- 图库排版：连续图片自动拼成并排 / 网格布局 ----
  // 模式 A：空行分隔的连续单图段落；模式 B：同一段落内软换行分隔的多图
  md.core.ruler.push('gallery', (state) => {
    const t = state.tokens
    const isSingleImgPara = (i) =>
      t[i]?.type === 'paragraph_open' &&
      t[i + 1]?.type === 'inline' &&
      t[i + 1].children?.length === 1 &&
      t[i + 1].children[0].type === 'image' &&
      t[i + 2]?.type === 'paragraph_close'
    const galleryInlineCount = (i) => {
      if (t[i]?.type !== 'paragraph_open' || t[i + 1]?.type !== 'inline' || t[i + 2]?.type !== 'paragraph_close') return 0
      const c = t[i + 1].children || []
      const imgs = c.filter((x) => x.type === 'image')
      return imgs.length >= 2 && c.every((x) => x.type === 'image' || x.type === 'softbreak') ? imgs.length : 0
    }

    for (let i = 0; i < t.length; i++) {
      if (isSingleImgPara(i)) {
        let count = 0
        while (isSingleImgPara(i + count * 3)) count++
        if (count < 2) continue
        const srcs = []
        for (let k = 0; k < count; k++) srcs.push(t[i + k * 3 + 1].children[0].attrGet('src') || '')
        const widths = justifiedWidths(galleryMode, count, srcs.map(aspectOf))
        for (let k = 0; k < count; k++) {
          const ov = overrideOf(srcs[k])
          if (ov != null && widths[k] != null) widths[k] = ov
        }
        for (let k = 0; k < count; k++) {
          const base = i + k * 3
          t[base].attrSet('data-g', `${count}:${k}`)
          t[base + 2].attrSet('data-gc', `${count}:${k}`)
          t[base + 1].children[0].attrSet('data-gi', `plain:${count}:${k}`)
          t[base + 1].children[0].attrSet('data-gw', widths[k] == null ? '' : String(widths[k]))
          // 焦点区右列两图：裁切填充，比例随最终左宽（含手动覆盖）计算
          if ((count === 3 || count >= 5) && (k === 1 || k === 2)) {
            const gr = rightColumnRatio(widths[0], aspectOf(srcs[0]))
            if (gr) t[base + 1].children[0].attrSet('data-gr', gr)
          }
        }
        i += count * 3 - 1
      } else {
        const count = galleryInlineCount(i)
        if (!count) continue
        t[i].attrSet('data-g', `${count}:wrap`)
        t[i + 2].attrSet('data-gc', 'wrap')
        const imgChildren = t[i + 1].children.filter((x) => x.type === 'image')
        const widths = justifiedWidths(galleryMode, count, imgChildren.map((x) => aspectOf(x.attrGet('src') || '')))
        for (let k = 0; k < imgChildren.length; k++) {
          const ov = overrideOf(imgChildren[k].attrGet('src') || '')
          if (ov != null && widths[k] != null) widths[k] = ov
        }
        let k = 0
        for (const x of t[i + 1].children) {
          if (x.type === 'image') {
            x.attrSet('data-gi', `${count}:${k}`)
            x.attrSet('data-gw', widths[k] == null ? '' : String(widths[k]))
            // 焦点区右列两图：裁切填充（同模式 A）
            if ((count === 3 || count >= 5) && (k === 1 || k === 2)) {
              const gr = rightColumnRatio(widths[0], aspectOf(imgChildren[0].attrGet('src') || ''))
              if (gr) x.attrSet('data-gr', gr)
            }
            k++
          } else if (x.type === 'softbreak') x.attrSet('data-gskip', '1')
        }
      }
    }
  })

  // ---- 视频占位：公众号不支持粘贴视频，检测视频写法并渲染占位卡片 ----
  // 识别三种独占一段的写法：<video> 标签、已知视频平台的 <iframe>、视频文件直链。
  // 占位卡随主题主色，复制到公众号后按提示在后台「插入 → 视频」替换。
  const VIDEO_HOSTS = /v\.qq\.com|player\.bilibili\.com|youtube\.com|youtu\.be|ixigua\.com|youku\.com/i
  const VIDEO_FILE = /^https?:\/\/\S+?\.(?:mp4|mov|m4v|webm|m3u8)(?:\?\S*)?$/i
  const detectVideo = (text) => {
    const s = text.trim()
    if (/^<video[\s>][\s\S]*$/i.test(s)) {
      return {
        url: s.match(/src=["']([^"']+)["']/i)?.[1] ?? '',
        name: s.match(/data-name=["']([^"']+)["']/i)?.[1] ?? '',
      }
    }
    if (/^<iframe[\s>][\s\S]*$/i.test(s) && VIDEO_HOSTS.test(s)) {
      return { url: s.match(/src=["']([^"']+)["']/i)?.[1] ?? '', name: '' }
    }
    if (VIDEO_FILE.test(s)) return { url: s, name: '' }
    return null
  }
  const videoPlaceholder = (url, map) =>
    buildVideoPlaceholder(styles.video, {
      attrs: map ? ` data-line="${map[0]}"` : '',
      note: url ? esc(url) : '',
    })
  md.core.ruler.push('video_placeholder', (state) => {
    const t = state.tokens
    for (let i = 0; i < t.length; i++) {
      if (t[i]?.type !== 'paragraph_open' || t[i + 1]?.type !== 'inline' || t[i + 2]?.type !== 'paragraph_close') continue
      const v = detectVideo(t[i + 1].content)
      if (v === null) continue
      const { url, name } = v
      const tok = new state.Token('html_block', '', 0)
      tok.map = t[i].map
      if (url.startsWith('local:')) {
        // 本地粘贴的视频：预览渲染为可播放的播放器；
        // data-lv 标记供复制链路识别并替换为占位卡，data-name 保留文件名
        const realUrl = resolveImageSrc(url)
        const line = t[i].map ? ` data-line="${t[i].map[0]}"` : ''
        const nameAttr = name ? ` data-name="${escapeHtmlAttr(name)}"` : ''
        const hint = name ? `本地视频预览 · ${esc(name)}` : '本地视频预览'
        tok.content = `<section${line} data-lv="1"${nameAttr} style="${escapeHtmlAttr(
          styles.video
        )}"><video src="${esc(realUrl)}" controls preload="metadata" style="display:block;width:100%;border-radius:8px;margin:0 auto;"></video><p style="margin:0.4em 0 0;font-size:0.78em;opacity:0.55;">${hint}</p></section>`
      } else {
        tok.content = videoPlaceholder(url, t[i].map)
      }
      t.splice(i, 3, tok)
    }
  })
  // 需要“索引式章节号”的主题可以把 H2 开头的数字独立成视觉组件。
  // 只处理主题主动开启的纯文本前缀，不改变其他主题和无编号标题。
  if (theme.extractH2Index) {
    md.core.ruler.push('section_index', (state) => {
      for (let i = 0; i < state.tokens.length - 1; i++) {
        const open = state.tokens[i]
        const inline = state.tokens[i + 1]
        if (open.type !== 'heading_open' || open.tag !== 'h2' || inline?.type !== 'inline') continue

        const firstText = inline.children?.find((child) => child.type === 'text' && child.content.trim())
        if (!firstText) continue
        const match = firstText.content.match(/^(\d{1,2})[.、]?\s+(.+)$/)
        if (!match) continue

        open.meta = { ...(open.meta || {}), sectionIndex: match[1].padStart(2, '0') }
        firstText.content = match[2]
      }
    })
  }

  // ---- 微信安全列表：不用原生 <ul>/<ol>/<li> 嵌套 ----
  // 微信公众号编辑器粘贴时会识别 ul/ol/li 并执行自己的“列表化”转换：
  // 嵌套列表会被提升为顶层列表（list-paddingleft-1）、顺序倒挂、层级全部丢失，
  // 发布后嵌套列表立刻错乱（3 层以上尤其明显）。
  // 这里改用 section + 内联样式模拟列表：缩进按深度写成 padding-left、
  // 标记符号 / 序号写成纯文本，微信只当普通块级元素保留，粘贴后与预览完全一致。
  const LIST_INDENT = 1.5 // 每层缩进（em），与主题 ul/ol 的 padding-left 同宽
  const BULLETS = ['•', '○', '■'] // 无序标记按深度循环，贴近原生 disc/circle/square
  md.core.ruler.push('list_flat', (state) => {
    const stack = [] // { ordered, start, index }
    for (const token of state.tokens) {
      if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
        const ordered = token.type === 'ordered_list_open'
        const start = ordered ? Number(token.attrGet('start') || 1) : 0
        token.meta = { ...(token.meta || {}), listDepth: stack.length + 1 }
        stack.push({ ordered, start, index: start })
      } else if (token.type === 'list_item_open') {
        const parent = stack[stack.length - 1]
        const depth = stack.length
        token.meta = {
          ...(token.meta || {}),
          listDepth: depth,
          ordered: !!parent?.ordered,
          number: parent?.ordered ? parent.index : 0,
          bullet: BULLETS[(Math.max(depth, 1) - 1) % BULLETS.length],
        }
        if (parent?.ordered) parent.index += 1
      } else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
        token.meta = { ...(token.meta || {}), listDepth: stack.length }
        stack.pop()
      }
    }
  })

  // ---- 微信外链转脚注 ----
  // 公众号只支持 mp.weixin.qq.com 域名的可点击链接，其余外链在粘贴时会被
  // 微信编辑器直接剥离（只剩文字，网址也丢失），保存时还可能提示
  //「请勿插入非mp/weixin.qq.com的域名链接」。开启后把外链搬到文末
  //【参考资料】，以脚注 [n] 形式保留网址；正文只留链接文字 + 角标，
  // 微信内链（mp.weixin.qq.com）不受影响、保持可点击。
  const isWeixinInternal = (href) => /^https?:\/\/mp\.weixin\.qq\.com(?:\/|$)/i.test(href)
  md.core.ruler.push('link_footnote', (state) => {
    if (!linkFootnotes) return
    const footnotes = state.env.footnotes || (state.env.footnotes = [])
    for (const token of state.tokens) {
      if (token.type !== 'inline' || !token.children?.length) continue
      const next = []
      let open = null // 正在转脚注的外链：{ href, text }
      for (const ch of token.children) {
        if (ch.type === 'link_open') {
          const href = ch.attrGet('href') || ''
          if (isWeixinInternal(href)) {
            next.push(ch)
            continue
          }
          open = { href, text: '' }
          // 链接外壳换成 span：保留链接的视觉样式，但不再是 <a>（微信会剥掉）
          ch.type = 'span_open'
          ch.tag = 'span'
          ch.nesting = 1
          ch.attrs = [['style', styles.a]]
          next.push(ch)
          continue
        }
        if (ch.type === 'link_close' && open) {
          const n = footnotes.length + 1
          ch.type = 'span_close'
          ch.tag = 'span'
          ch.nesting = -1
          ch.attrs = []
          next.push(ch)
          // 链接文字后的脚注角标（html_inline 由渲染器原样输出）
          const mark = new state.Token('html_inline', '', 0)
          mark.content = `<span style="${escapeHtmlAttr(
            `font-size:0.72em;vertical-align:super;color:${accentColorOf(styles)};margin-left:0.25em;`
          )}">[${n}]</span>`
          next.push(mark)
          footnotes.push(open)
          open = null
          continue
        }
        if (open) {
          // 收集链接文字（用于脚注条目展示）
          if (ch.type === 'text' || ch.type === 'code_inline' || ch.type === 'image') open.text += ch.content
        }
        next.push(ch)
      }
      token.children = next
    }
  })

  // 为段落记录真实的块级祖先。不能靠“向前找到最近的 open token”猜测，
  // 因为子列表 / 子引用关闭后，段落仍可能属于外层列表项或引用。
  md.core.ruler.push('block_context', (state) => {
    const stack = []

    for (const token of state.tokens) {
      if (token.nesting === -1) stack.pop()

      if (token.type === 'paragraph_open') {
        const nearest = [...stack]
          .reverse()
          .find((type) => type === 'list_item_open' || type === 'blockquote_open')
        token.meta = {
          ...(token.meta || {}),
          blockContext:
            nearest === 'list_item_open'
              ? 'list'
              : nearest === 'blockquote_open'
                ? 'blockquote'
                : 'normal',
        }
      }

      if (token.type === 'blockquote_open') {
        token.meta = {
          ...(token.meta || {}),
          blockquoteDepth: stack.filter((type) => type === 'blockquote_open').length,
        }
      }

      if (token.nesting === 1) stack.push(token.type)
    }
  })

  const galleryContainer = (token, count) => {
    let layout = 'display:block;'
    if (galleryMode === 'grid') layout = 'display:flex;flex-wrap:wrap;justify-content:space-between;'
    if (galleryMode === 'collage' && (count === 2 || count === 3)) layout = 'display:flex;'
    return `<section${dl(token)} data-gallery-mode="${galleryMode}" style="${escapeHtmlAttr(`${layout}${styles.gallery}`)}">`
  }

  // 每个布局都只使用 section + inline flex，不依赖 grid、定位或外部 CSS。
  // 格子不定高、宽度按各图宽高比分配（对齐式布局），同排天然同高、上下齐平；
  // 公众号编辑器不执行固定高度裁剪，这样预览与粘贴后的效果保持一致。
  const galleryItemParts = (count, i, gw) => {
    if (galleryMode === 'stack') {
      return {
        open: `<section style="margin:0 0 ${i === count - 1 ? '0' : '8px'};">`,
        close: '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }

    if (galleryMode === 'grid') {
      // 兜底与 justifiedWidths 的均分规则一致：尾行单张占满一行
      const width = gw ? `${gw}%` : count === 2 || count === 4 ? '49.4%' : count === 1 ? '100%' : '32.53%'
      return {
        open: `<section style="width:${width};margin-bottom:1.2%;">`,
        close: '</section>',
        // 统一比例（默认 1:1 正方形）+ cover 裁切，网格图统一尺寸、行内行间完全齐平。
        // 公众号若过滤掉 aspect-ratio/object-fit 则退化为按原比例显示，不会破版
        image: `aspect-ratio:${galleryRatio};object-fit:cover;height:auto;box-sizing:border-box;`,
      }
    }

    if (count === 2) {
      return {
        open:
          i === 0
            ? `<section style="width:${gw || 61}%;margin-right:1.2%;">`
            : '<section style="flex:1;">',
        close: '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }

    if (count === 3) {
      if (i === 0) {
        return {
          open: `<section style="width:${gw || 62}%;margin-right:1.2%;">`,
          close: '</section>',
          image: 'height:auto;box-sizing:border-box;',
        }
      }
      return {
        open:
          i === 1
            ? '<section style="flex:1;display:flex;flex-direction:column;"><section style="margin-bottom:1.2%;">'
            : '<section>',
        close: i === 2 ? '</section></section>' : '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }

    if (count === 4) {
      if (i === 0) {
        return {
          open: '<section style="margin-bottom:1.2%;">',
          close: '</section>',
          image: 'height:auto;box-sizing:border-box;',
        }
      }
      return {
        open:
          i === 1
            ? `<section style="display:flex;justify-content:space-between;"><section style="width:${gw || 32}%;">`
            : `<section style="width:${gw || 32}%;">`,
        close: i === 3 ? '</section></section>' : '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }

    // 5+：上方是一主两次的编辑式焦点区，下方根据余图数量组成双列或三列。
    if (i === 0) {
      return {
        open:
          `<section style="display:flex;margin-bottom:1.2%;"><section style="width:${gw || 62}%;margin-right:1.2%;">`,
        close: '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }
    if (i === 1 || i === 2) {
      return {
        open:
          i === 1
            ? '<section style="flex:1;display:flex;flex-direction:column;"><section style="margin-bottom:1.2%;">'
            : '<section>',
        close: i === 2 ? '</section></section></section>' : '</section>',
        image: 'height:auto;box-sizing:border-box;',
      }
    }

    const remaining = count - 3
    const fallbackWidth = remaining === 3 ? '32%' : '49%'
    return {
      open:
        i === 3
          ? `<section style="display:flex;flex-wrap:wrap;justify-content:space-between;"><section style="width:${gw || fallbackWidth};margin-bottom:1.2%;">`
          : `<section style="width:${gw || fallbackWidth};margin-bottom:1.2%;">`,
      close: i === count - 1 ? '</section></section>' : '</section>',
      image: 'height:auto;box-sizing:border-box;',
    }
  }

  const codeStyle =
    `font-family:Menlo,Consolas,'Courier New',monospace;font-size:13px;line-height:1.7;text-align:left;` +
    `color:${chrome.text};white-space:pre;${styles.preCode || ''}`

  // Mac 风格代码窗口：三个信号灯 + 语言标签
  const wrapCode = (inner, lang, token) => {
    const frameStyle =
      styles.pre ||
      `background-color:${chrome.bg};${chrome.border}border-radius:10px;margin:1.2em 8px;overflow:hidden;`
    const plainStyle = styles.prePlain || 'padding:16px;overflow-x:auto;'
    const bodyStyle =
      styles.preBody || 'background-color:transparent;padding:12px 16px 16px;margin:0;overflow-x:auto;'
    const headerStyle = styles.preHeader || 'padding:12px 16px 0;font-size:0;line-height:0;'
    const labelStyle =
      styles.preLabel ||
      `color:${chrome.label};font-size:12px;line-height:11px;margin-left:10px;vertical-align:top;`
    // 逐行块级 <code>：不输出 <pre> 与裸 \n，公众号粘贴不会拆行/丢内容/错乱
    const linesHtml = splitCodeLines(inner)
      .map((line) => `<code style="${escapeHtmlAttr(`${codeStyle}display:block;`)}">${line}</code>`)
      .join('')

    if (!macCode || theme.codeChrome === 'plain') {
      return `<section${dl(token)} style="${escapeHtmlAttr(`${frameStyle}${plainStyle}`)}">${linesHtml}</section>`
    }

    if (theme.codeChrome === 'label') {
      const prefix = theme.codeLabel ? esc(theme.codeLabel) : 'CODE'
      const labelText = lang ? `${prefix} / ${esc(lang.toUpperCase())}` : prefix
      return (
        `<section${dl(token)} style="${escapeHtmlAttr(frameStyle)}">` +
        `<section style="${escapeHtmlAttr(headerStyle)}"><span style="${escapeHtmlAttr(labelStyle)}">${labelText}</span></section>` +
        `<section style="${escapeHtmlAttr(bodyStyle)}">${linesHtml}</section>` +
        `</section>`
      )
    }

    // 三个信号灯的 span 必须带内容（&nbsp;），公众号粘贴会丢弃空元素
    const dots =
      `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background-color:#ff5f56;margin-right:7px;overflow:hidden;font-size:0;line-height:0;">&nbsp;</span>` +
      `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background-color:#ffbd2e;margin-right:7px;overflow:hidden;font-size:0;line-height:0;">&nbsp;</span>` +
      `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background-color:#27c93f;overflow:hidden;font-size:0;line-height:0;">&nbsp;</span>`
    const label = lang
      ? `<span style="${escapeHtmlAttr(labelStyle)}">${esc(lang)}</span>`
      : ''
    return (
      `<section${dl(token)} style="${escapeHtmlAttr(frameStyle)}">` +
      `<section style="${escapeHtmlAttr(headerStyle)}">${dots}${label}</section>` +
      `<section style="${escapeHtmlAttr(bodyStyle)}">${linesHtml}</section>` +
      `</section>`
    )
  }

  md.renderer.rules.paragraph_open = (tokens, idx) => {
    // Markdown-it 会把紧凑列表中的段落标记为 hidden；尊重该语义，避免
    // 把 <li>项目</li> 改写成带额外边距的 <li><p>项目</p></li>。
    if (tokens[idx].hidden) return ''

    // 图库分支
    const g = tokens[idx].attrGet('data-g')
    if (g) {
      const [countStr, pos] = g.split(':')
      const count = Number(countStr)
      if (pos === 'wrap') return galleryContainer(tokens[idx], count)
      const i = Number(pos)
      const gw = tokens[idx + 1]?.children?.[0]?.attrGet('data-gw') || ''
      return `${i === 0 ? galleryContainer(tokens[idx], count) : ''}${galleryItemParts(count, i, gw).open}`
    }
    // 引用块 / 宽松列表项里的段落使用各自样式，避免普通正文的首行缩进、
    // 对齐和横向边距污染嵌套结构。
    const context = tokens[idx].meta?.blockContext
    if (context === 'list') return `<p${dl(tokens[idx])} style="${escapeHtmlAttr(styles.liP)}">`
    if (context === 'blockquote') return `<p${dl(tokens[idx])} style="${escapeHtmlAttr(styles.bqP)}">`
    return `<p${dl(tokens[idx])} style="${escapeHtmlAttr(styles.p)}">`
  }

  md.renderer.rules.paragraph_close = (tokens, idx) => {
    if (tokens[idx].hidden) return ''

    const g = tokens[idx].attrGet('data-gc')
    if (g) {
      if (g === 'wrap') return `</section>`
      const [countStr, pos] = g.split(':')
      const count = Number(countStr)
      const i = Number(pos)
      return `${galleryItemParts(count, i).close}${i === count - 1 ? '</section>' : ''}`
    }
    return `</p>\n`
  }

  md.renderer.rules.softbreak = (tokens, idx) => (tokens[idx].attrGet('data-gskip') ? '' : '<br>')

  md.renderer.rules.heading_open = (tokens, idx) => {
    const level = Number(tokens[idx].tag.slice(1))
    const style =
      { 1: styles.h1, 2: styles.h2, 3: styles.h3, 4: styles.h4, 5: styles.h5, 6: styles.h6 }[
        level
      ] || styles.h4
    const wrap = styles[`h${level}WrapOpen`] || ''
    const sectionIndex =
      level === 2 && tokens[idx].meta?.sectionIndex && styles.h2Index
        ? `<span aria-hidden="true" style="${escapeHtmlAttr(styles.h2Index)}">${esc(tokens[idx].meta.sectionIndex)}</span>`
        : ''
    return `<h${level}${dl(tokens[idx])} style="${escapeHtmlAttr(style)}">${sectionIndex}${wrap}`
  }
  md.renderer.rules.heading_close = (tokens, idx) => {
    const level = Number(tokens[idx].tag.slice(1))
    const wrap = styles[`h${level}WrapClose`] || ''
    return `${wrap}</h${level}>`
  }

  md.renderer.rules.blockquote_open = (tokens, idx) => {
    const style =
      tokens[idx].meta?.blockquoteDepth > 0 ? styles.blockquoteNested : styles.blockquote
    return `<blockquote${dl(tokens[idx])} style="${escapeHtmlAttr(style)}">`
  }
  // ---- 列表（微信安全版）：全部输出为 section，绝不输出原生 ul/ol/li ----
  // 只有第一层列表输出容器 section（带主题的 ul/ol 样式，包含整体缩进与纵向边距）；
  // 嵌套层不输出容器，靠条目自身的 padding-left 逐层加深，微信无从“扁平化”。
  const listContainerOpen = (token, style) => {
    if ((token.meta?.listDepth || 1) > 1) return ''
    return `<section${dl(token)} style="${escapeHtmlAttr(style)}">`
  }
  const listContainerClose = (token) => ((token.meta?.listDepth || 1) > 1 ? '' : '</section>')
  md.renderer.rules.bullet_list_open = (tokens, idx) => listContainerOpen(tokens[idx], styles.ul)
  md.renderer.rules.bullet_list_close = (tokens, idx) => listContainerClose(tokens[idx])
  md.renderer.rules.ordered_list_open = (tokens, idx) => listContainerOpen(tokens[idx], styles.ol)
  md.renderer.rules.ordered_list_close = (tokens, idx) => listContainerClose(tokens[idx])
  md.renderer.rules.list_item_open = (tokens, idx) => {
    const t = tokens[idx]
    const depth = t.meta?.listDepth || 1
    const indent = depth > 1 ? `padding-left:${(depth - 1) * LIST_INDENT}em;` : ''
    const marker = t.meta?.ordered
      ? `<span style="text-indent:0;">${t.meta.number}.&nbsp;</span>`
      : `<span style="text-indent:0;">${t.meta?.bullet || '•'}&nbsp;</span>`
    return `<section style="${escapeHtmlAttr(`${styles.li}${indent}`)}">${marker}`
  }
  md.renderer.rules.list_item_close = () => '</section>'
  md.renderer.rules.strong_open = () => `<strong style="${escapeHtmlAttr(styles.strong)}">`
  md.renderer.rules.mark_open = () => `<mark style="${escapeHtmlAttr(styles.mark)}">`
  if (styles.em) md.renderer.rules.em_open = () => `<em style="${escapeHtmlAttr(styles.em)}">`
  if (styles.s) md.renderer.rules.s_open = () => `<s style="${escapeHtmlAttr(styles.s)}">`
  md.renderer.rules.hr = (tokens, idx) => {
    if (styles.hrHtml) return styles.hrHtml.replace('>', `${dl(tokens[idx])}>`)
    return `<hr${dl(tokens[idx])} style="${escapeHtmlAttr(styles.hr)}"/>`
  }

  md.renderer.rules.link_open = (tokens, idx) => {
    const title = tokens[idx].attrGet('title')
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : ''
    return `<a href="${esc(tokens[idx].attrGet('href') || '')}"${titleAttr} style="${escapeHtmlAttr(styles.a)}">`
  }

  // 图片：独立图 alt 转图注；图库中的图用平铺样式、不出图注
  md.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx]
    const src = resolveImageSrc(esc(token.attrGet('src') || ''))
    const alt = token.content || ''
    const title = token.attrGet('title')
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : ''
    const gi = token.attrGet('data-gi')
    const gw = token.attrGet('data-gw') || ''
    // 焦点区右列裁切填充：固定比例 + cover，使右列总高恒等于左图高
    const gr = token.attrGet('data-gr')
    const grStyle = gr ? `aspect-ratio:${escapeHtmlAttr(gr)};object-fit:cover;` : ''
    if (gi?.startsWith('plain:')) {
      const [, countStr, pos] = gi.split(':')
      const parts = galleryItemParts(Number(countStr), Number(pos), gw)
      return `<img${dl(token)} src="${src}" alt="${esc(alt)}"${titleAttr} decoding="async" style="${escapeHtmlAttr(`${styles.galleryImg}${parts.image}${grStyle}`)}"/>`
    }
    if (gi) {
      const [count, i] = gi.split(':').map(Number)
      const parts = galleryItemParts(count, i, gw)
      return `${parts.open}<img src="${src}" alt="${esc(alt)}"${titleAttr} decoding="async" style="${escapeHtmlAttr(`${styles.galleryImg}${parts.image}${grStyle}`)}"/>${parts.close}`
    }
    const imgTag = `<img${dl(token)} src="${src}" alt="${esc(alt)}"${titleAttr} decoding="async" style="${escapeHtmlAttr(styles.img)}"/>`
    if (!alt.trim()) return imgTag
    return `${imgTag}<span style="${escapeHtmlAttr(styles.caption)}">${esc(alt)}</span>`
  }

  // 表格外层包一个横向滚动容器，宽表格在手机上可以滑动
  md.renderer.rules.table_open = (tokens, idx) =>
    `<section${dl(tokens[idx])} style="${escapeHtmlAttr(styles.tableWrap)}"><table style="${escapeHtmlAttr(styles.table)}">`
  md.renderer.rules.table_close = () => `</table></section>`
  md.renderer.rules.th_open = (tokens, idx) => {
    const align = tokens[idx].attrGet('style') || ''
    return `<th style="${escapeHtmlAttr(`${styles.th}${align}`)}">`
  }
  md.renderer.rules.td_open = (tokens, idx) => {
    const align = tokens[idx].attrGet('style') || ''
    return `<td style="${escapeHtmlAttr(`${styles.td}${align}`)}">`
  }

  md.renderer.rules.code_inline = (tokens, idx) =>
    `<code style="${escapeHtmlAttr(styles.code)}">${esc(tokens[idx].content)}</code>`

  md.renderer.rules.code_block = (tokens, idx) => wrapCode(esc(tokens[idx].content), '', tokens[idx])

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0]
    let inner
    try {
      inner =
        lang && hljs.getLanguage(lang)
          ? inlineHljsStyles(hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value, chrome.hl)
          : esc(token.content)
    } catch {
      inner = esc(token.content)
    }
    return wrapCode(inner, lang, token)
  }

  return { md, styles }
}

// 最近一次渲染的主题样式：复制链路替换视频占位卡时复用同款外观
let lastThemeStyles = null

export function renderMarkdown(src, theme, opts = {}) {
  const key = [
    theme.id,
    opts.accent || '',
    JSON.stringify(opts.slotColors || {}),
    opts.fontSize || '',
    opts.fontFamily || '',
    opts.macCode ? 1 : 0,
    normalizeGalleryMode(opts.galleryMode),
    normalizeGalleryRatio(opts.galleryRatio),
    opts.linkFootnotes ? 1 : 0,
    opts.colorMode === 'dark' ? 'dark' : 'light',
    JSON.stringify(opts.custom || {}),
  ].join('|')
  let entry = cache.get(key)
  if (entry) {
    // Map 的插入顺序就是 LRU 顺序；命中后移到队尾。
    cache.delete(key)
    cache.set(key, entry)
  } else {
    entry = createMd(theme, opts)
    cache.set(key, entry)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
  }
  lastThemeStyles = entry.styles
  resetMathRenderer()
  const env = {}
  const body = entry.md.render(src, env)
  return `<section style="${escapeHtmlAttr(entry.styles.container)}">${body}${buildFootnoteSection(
    entry.styles,
    env.footnotes
  )}</section>`
}

// 复制前剥离预览专用标记（行号、画廊模式标记等对文章无意义）
export function stripPreviewMeta(html) {
  return html
    .replace(/ data-line="\d+"/g, '')
    .replace(/ data-gallery-mode="[^"]*"/g, '')
}

// 复制链路用的视频占位卡：与最近一次渲染同款外观。调用方在把 data-lv 区块
// 替换为占位卡时使用（视频是否内联由应用侧按大小阈值决定）。
// 带上文件名，方便作者在公众号后台插入时对照查找。
export function copyVideoPlaceholder(name = '') {
  const note = name ? `本地视频：${name}` : '本地视频文件（未内联）'
  return buildVideoPlaceholder(lastThemeStyles?.video || '', { note })
}
