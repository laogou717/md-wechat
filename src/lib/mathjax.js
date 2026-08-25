import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js'
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js'

// 微信复制时公式必须是完全自包含的 SVG。fontCache:none 会把字形路径直接写进
// 每一个 SVG，避免公众号清理 DOM 后 <use href="#..."> 找不到页面级字体缓存。
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const tex = new TeX({
  // 覆盖公众号文章最常用的标准 TeX、AMS 环境和自定义命令；不打包全部冷门扩展，
  // 可显著降低纯前端应用的首屏体积。
  packages: ['base', 'ams', 'newcommand', 'noundefined'],
  tags: 'ams',
})
const svg = new SVG({ fontCache: 'none' })
const document = mathjax.document('', { InputJax: tex, OutputJax: svg })

const escapeHtmlAttr = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function appendSvgStyle(markup, extra) {
  return markup.replace(/<svg\b([^>]*)>/, (whole, attrs) => {
    const styleMatch = attrs.match(/\sstyle="([^"]*)"/)
    const existing = styleMatch?.[1]?.trim() || ''
    const withoutStyle = styleMatch ? attrs.replace(styleMatch[0], '') : attrs
    const joined = `${existing}${existing && !existing.endsWith(';') ? ';' : ''}${extra}`
    return `<svg${withoutStyle} style="${escapeHtmlAttr(joined)}">`
  })
}

function dimensionsToStyle(markup) {
  const open = markup.match(/^<svg\b[^>]*>/)?.[0]
  if (!open) return markup
  const width = open.match(/\swidth="([^"]+)"/)?.[1]
  const height = open.match(/\sheight="([^"]+)"/)?.[1]
  let next = markup.replace(/^<svg\b([^>]*)>/, (whole) =>
    whole.replace(/\s(?:width|height)="[^"]+"/g, '')
  )
  const size = `${width ? `width:${width};` : ''}${height ? `height:${height};` : ''}`
  if (size) next = appendSvgStyle(next, size)
  return next
}

/**
 * 把一段 TeX 同步渲染成可独立复制的 SVG 字符串。
 * SVG 只使用路径，不依赖外链字体；颜色统一继承主题与所在背景的文字色。
 */
export function renderMathSvg(source, display = false) {
  const node = document.convert(source, {
    display,
    em: 16,
    ex: 8,
    containerWidth: 720,
  })
  const container = adaptor.outerHTML(node)
  let markup = container.match(/<svg\b[\s\S]*<\/svg>/)?.[0]
  if (!markup) throw new Error('MathJax did not produce SVG output')

  // width/height 放进行内样式，降低微信公众号过滤普通属性后尺寸丢失的概率。
  markup = dimensionsToStyle(markup)
  markup = appendSvgStyle(
    markup,
    display
      ? 'display:block;max-width:100%;margin:0 auto;color:inherit;overflow:visible;'
      : 'display:inline-block;max-width:100%;color:inherit;overflow:visible;'
  )

  // MathJax 本身使用 currentColor；这里再兜底修正可能由扩展包产生的黑色根组。
  markup = markup.replace(
    /<g\b([^>]*?)\s(?:fill|stroke)="(?:black|#000(?:000)?)"([^>]*)>/gi,
    (whole) => whole.replace(/(fill|stroke)="(?:black|#000(?:000)?)"/gi, '$1="currentColor"')
  )
  return markup
}

// MathJax 会保存自动编号状态。每次整篇文章重渲染前重置，避免编辑一个字后
// \tag / equation 编号继续累加，同时清掉上一轮转换节点。
export function resetMathRenderer() {
  tex.reset()
  document.clear()
}
