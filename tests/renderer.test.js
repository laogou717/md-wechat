import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, stripPreviewMeta, copyVideoPlaceholder, setImageResolver, setImageAspectProvider } from '../src/lib/renderer.js'
import { buildStyles, colorModeSurface, themes } from '../src/lib/themes.js'
import { extractUrl } from '../src/lib/imagehost.js'

const galleryMarkdown = `# 多图测试

![第一张](https://picsum.photos/seed/test-a/800/1000)

![第二张](https://picsum.photos/seed/test-b/1200/800)

![第三张](https://picsum.photos/seed/test-c/800/800)
`

test('所有主题都能渲染完整 Markdown', () => {
  for (const theme of themes) {
    const html = renderMarkdown(galleryMarkdown, theme, {
      fontSize: 16,
      fontFamily: 'sans',
      macCode: true,
      galleryMode: 'collage',
    })
    assert.match(html, /<h1/)
    assert.match(html, /第一张/)
    assert.doesNotMatch(html, /undefined|null/)
  }
})

test('LaTeX 公式渲染为自包含、继承主题颜色的微信安全 SVG', () => {
  const source = `正文公式 $E=mc^2$，金额 $19.9 不应误判。

$$
\\int_0^1 x^2\\,dx=\\frac{1}{3}
$$`
  for (const theme of themes) {
    const html = renderMarkdown(source, theme, { galleryMode: 'collage' })
    assert.match(html, /data-math-display="false"/)
    assert.match(html, /data-math-display="true"/)
    assert.match(html, /<svg[^>]+viewBox=/)
    assert.match(html, /(?:fill|stroke)="currentColor"/)
    assert.match(html, /color:inherit/)
    assert.doesNotMatch(html, /MJX-SVG-global-cache/)
    assert.doesNotMatch(html, /<mjx-container/)
    assert.match(html, /金额 \$19\.9 不应误判/)
  }
})

test('公式在强调文字和带背景引用中继承所在节点样式', () => {
  const html = renderMarkdown(`> **重点 $a^2+b^2=c^2$**`, themes[2], {})
  assert.match(html, /<blockquote[^>]+background/)
  assert.match(html, /<strong[^>]+>[\s\S]*data-math-display="false"/)
  assert.match(html, /<svg[^>]+color:inherit/)
  assert.doesNotMatch(html, /(?:fill|stroke)="(?:black|#000(?:000)?)"/i)
})

test('反斜杠公式语法与代码中的美元符号保持正确', () => {
  const html = renderMarkdown('公式 \\(x+y\\)，代码 `$not_math$`。', themes[0], {})
  assert.equal((html.match(/data-math-display="false"/g) || []).length, 1)
  assert.match(html, /<code[^>]*>\$not_math\$<\/code>/)
})

test('反斜杠圆括号严格行内，方括号严格行间', () => {
  const inline = renderMarkdown('前文 \\(x+y\\) 后文', themes[0], {})
  assert.match(inline, /<p[^>]*>前文 <span[^>]*data-math-display="false"/)
  assert.doesNotMatch(inline, /前文 <br>/)
  assert.doesNotMatch(inline, /data-math-display="false"[^>]*display:block/)

  const displayBlock = renderMarkdown('\\[x+y=1\\]', themes[0], {})
  assert.match(displayBlock, /<section[^>]*data-math-display="true"/)
  assert.doesNotMatch(displayBlock, /data-math-error/)

  const displayAmongText = renderMarkdown('前文 \\[x+y=1\\] 后文', themes[0], {})
  assert.match(displayAmongText, /<span[^>]*data-math-display="true"/)
  assert.match(displayAmongText, /data-math-display="true"[^>]*display:block/)
  assert.doesNotMatch(displayAmongText, /data-math-error/)
})

test('26 套主题都有独立夜间变体，公式与图片不使用反色滤镜', () => {
  const source = `# 标题

## 小节

正文 **强调** \\(x^2\\)

> 引用内容

- 列表一
- 列表二

\\[e^{i\\pi}+1=0\\]

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`js
const dark = true
\`\`\`

![图](https://example.com/a.jpg)`
  const luminance = (hex) => {
    const values = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const [r, g, b] = values.map((c) =>
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    )
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) /
    (Math.min(luminance(a), luminance(b)) + 0.05)

  for (const theme of themes) {
    const lightStyles = buildStyles(theme, { colorMode: 'light' })
    const darkStyles = buildStyles(theme, { colorMode: 'dark' })
    assert.notEqual(darkStyles.container, lightStyles.container, `${theme.name} 缺少夜间容器变体`)
    assert.notEqual(colorModeSurface(theme.surface, 'dark'), theme.surface, `${theme.name} 缺少夜间页面底色`)
    const foreground = darkStyles.container.match(/(?:^|;)color:(#[0-9a-f]{6})/i)?.[1]
    const background =
      darkStyles.container.match(/background-color:(#[0-9a-f]{6})/i)?.[1] ||
      colorModeSurface(theme.surface, 'dark')
    assert.ok(contrast(foreground, background) >= 7, `${theme.name} 夜间正文对比度不足`)

    const html = renderMarkdown(source, theme, { colorMode: 'dark' })
    assert.equal((html.match(/data-math-display=/g) || []).length, 2)
    assert.doesNotMatch(html, /data-math-error/)
    assert.match(html, /src="https:\/\/example\.com\/a\.jpg"/)
    assert.doesNotMatch(html, /filter:\s*invert/i)
    assert.match(html, /currentColor/)
    assert.match(html, /<blockquote/)
    assert.match(html, /<table/)
    assert.match(html, /dark =/)
    assert.doesNotMatch(html, /undefined|null/)
  }
})

test('AMS 公式环境可用，自动编号在整篇重渲染时保持稳定', () => {
  const source = `$$\\begin{aligned}a&=b+c\\\\d&=e+f\\end{aligned}\\tag{A}$$`
  const first = stripPreviewMeta(renderMarkdown(source, themes[0], {}))
  const second = stripPreviewMeta(renderMarkdown(source, themes[0], {}))
  assert.match(first, /data-math-display="true"/)
  assert.doesNotMatch(first, /data-math-error/)
  assert.equal(first, second)
})

test('原始 HTML 不会作为可执行标签进入预览', () => {
  const html = renderMarkdown(
    '<img src=x onerror="globalThis.compromised=true">',
    themes[0],
    { galleryMode: 'collage' }
  )
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;img/)
})

test('自定义内联样式不能逃逸成事件属性', () => {
  const html = renderMarkdown('一段正文', themes[0], {
    custom: { p: 'color:red;" onmouseover="globalThis.compromised=true' },
  })
  assert.doesNotMatch(html, /" onmouseover=/)
  assert.match(html, /&quot; onmouseover=/)
})

test('三层以上嵌套列表输出微信安全的 section 结构，层级与顺序不丢失', () => {
  // issue #4 复现用例：预览正确，但原生嵌套 ul/ol 粘贴到公众号会被扁平化、顺序错乱
  const source = `- **chrome tip**: 自定义搜索 实现快搜emoji
  - 效果就是在chrome搜索栏输入\`em foobar\`的时候, 直接打开emojidb.org 搜索"foobar"
  - 实现这个效果很简单:
    - 打开\`chrome://settings/searchEngines\`
    - 在"Site search"下点击"Add"
    - \`shortcut=em\` / \`URL=https://emojidb.org/%s-emojis\`
  - 用这个方式可以随意增加自定义的搜索, 比如我就添加了\`pub\`和\`gh\`的搜索快捷方式
    - 另外chrome还自带了\`@gemini\`/ \`@aimode\`用来快速提问`

  const html = stripPreviewMeta(renderMarkdown(source, themes[0], { galleryMode: 'collage' }))

  // 核心：绝不输出原生列表结构（微信会 list-paddingleft-1 扁平化）
  assert.doesNotMatch(html, /<ul|<ol|<li|<ol[^>]*start=/)

  // 每层缩进按深度写入行内样式：第 2 层 1.5em、第 3 层 3em
  const depth2 = (html.match(/padding-left:1\.5em;/g) || []).length
  const depth3 = (html.match(/padding-left:3em;/g) || []).length
  assert.equal(depth2, 4, '应有 4 个第二层条目') // 效果就是 / 实现这个效果很简单: / 用这个方式... / 打开...(3层)
  assert.equal(depth3, 4, '应有 4 个第三层条目') // 打开 / 在Site search / shortcut=em / 另外chrome

  // 标记符号按深度区分：1 层 •、2 层 ○、3 层 ■
  const bulletSeq = [...html.matchAll(/>([•○■])&nbsp;<\/span>/g)].map((m) => m[1])
  assert.deepEqual(bulletSeq, ['•', '○', '○', '■', '■', '■', '○', '■'])

  // 顺序与源码一致（扁平化是微信行为，我们输出的 DOM 顺序必须忠于原文）
  const order = ['chrome tip', '效果就是在chrome搜索栏输入', '实现这个效果很简单', 'chrome://settings/searchEngines', 'Site search', 'shortcut=em', '用这个方式可以随意增加', '另外chrome还自带了']
  let from = 0
  for (const text of order) {
    const at = html.indexOf(text, from)
    assert.ok(at > from || at === -1, `找不到 ${text}`)
    from = at + 1
  }
})

test('无序列表中嵌套有序列表：序号从 1 重新起算，start 序号保留', () => {
  const source = `- 为啥推荐他呢, 原因有二:
    1. 这次周刊准备用他做的一个工具来搞
    2. 他那期介绍这个工具的视频
       - b 站链接
  - 第二个原因: 自动链接 https://example.com/x.mp4`

  const html = stripPreviewMeta(renderMarkdown(source, themes[0], {}))
  assert.doesNotMatch(html, /<ul|<ol|<li/)
  // 有序列表从 1 起算；深度 2 的条目缩进 1.5em，深度 3 的缩进 3em
  assert.match(html, />1\.&nbsp;<\/span>这次周刊/)
  assert.match(html, />2\.&nbsp;<\/span>他那期/)
  assert.match(html, />■&nbsp;<\/span>b 站链接/)

  const start3 = stripPreviewMeta(renderMarkdown(`3. 第三项\n4. 第四项`, themes[0], {}))
  assert.match(start3, />3\.&nbsp;<\/span>第三项/)
  assert.match(start3, />4\.&nbsp;<\/span>第四项/)
})

test('三种多图模式都能生成稳定输出', () => {
  for (const mode of ['collage', 'grid', 'stack']) {
    const html = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: mode })
    assert.match(html, new RegExp(`data-gallery-mode="${mode}"`))
    assert.equal((html.match(/<img/g) || []).length, 3)
  }
})

test('网格模式的图全部为 1:1 正方形裁切，其他模式不受影响', () => {
  const grid = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: 'grid' })
  const imgs = grid.match(/<img[^>]*style="[^"]*aspect-ratio:1\/1;object-fit:cover[^"]*"/g) || []
  assert.equal(imgs.length, 3) // 每张网格图都带正方形裁切
  for (const mode of ['collage', 'stack']) {
    const html = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: mode })
    assert.doesNotMatch(html, /aspect-ratio:1\/1/)
  }
})

test('外链转脚注：外链搬至文末参考资料带序号，微信内链保留可点击', () => {
  const source = `链接的花样也不少：[普通链接](https://github.com/laogou717/md-wechat)、[带提示的链接](https://commonmark.org/ "Markdown 基础参考")、[参考式链接][style-guide]、自动链接 <https://commonmark.org/>、邮箱 <editor@example.com>，以及[微信内链](https://mp.weixin.qq.com/s/abcdefg)。另外**加粗链接**：[带格式的链接](https://example.com/a)。

[style-guide]: https://commonmark.org/ "CommonMark 规范"`

  const on = renderMarkdown(source, themes[0], { linkFootnotes: true, galleryMode: 'collage' })

  // 外链不再输出 <a>；微信内链保留
  assert.doesNotMatch(on, /<a href="https:\/\/github/)
  assert.doesNotMatch(on, /<a href="https:\/\/commonmark/)
  assert.doesNotMatch(on, /<a href="https:\/\/example\.com/)
  assert.doesNotMatch(on, /mailto:/)
  assert.match(on, /<a href="https:\/\/mp\.weixin\.qq\.com\/s\/abcdefg"/)

  // 正文链接文字保留 + 角标，按出现顺序编号
  assert.match(on, /普通链接<\/span><span style="[^"]*">\[1\]<\/span>/)
  assert.match(on, /带提示的链接<\/span><span style="[^"]*">\[2\]<\/span>/)
  assert.match(on, /参考式链接<\/span><span style="[^"]*">\[3\]<\/span>/)
  assert.match(on, /https:\/\/commonmark\.org\/<\/span><span style="[^"]*">\[4\]<\/span>/)
  assert.match(on, /editor@example\.com<\/span><span style="[^"]*">\[5\]<\/span>/)
  assert.match(on, /带格式的链接<\/span><span style="[^"]*">\[6\]<\/span>/)

  // 文末【参考资料】：文字：URL；自动链接与邮箱去重展示
  assert.match(on, /参考资料/)
  assert.match(on, /\[1\] 普通链接：https:\/\/github\.com\/laogou717\/md-wechat/)
  assert.match(on, /\[2\] 带提示的链接：https:\/\/commonmark\.org\//)
  assert.match(on, /\[3\] 参考式链接：https:\/\/commonmark\.org\//)
  assert.match(on, /\[4\] https:\/\/commonmark\.org\//)
  assert.match(on, /\[5\] editor@example\.com/)
  assert.match(on, /\[6\] 带格式的链接：https:\/\/example\.com\/a/)
  assert.doesNotMatch(on, /微信内链：https/)

  // 关闭时行为不变：外链仍是真链接，无参考资料区
  const off = renderMarkdown(source, themes[0], { galleryMode: 'collage' })
  assert.match(off, /<a href="https:\/\/github/)
  assert.doesNotMatch(off, /参考资料/)
})

test('拼贴焦点区右列两图按裁切填充渲染，左宽封顶 68%', () => {
  // 16:9 横图 + 1:1 + 3:4：横图首图时左宽不失控（封顶 68%）
  setImageAspectProvider((src) => ({ a: 1.78, b: 1, c: 0.75 }[src]))
  const html = renderMarkdown('![a](a)\n\n![b](b)\n\n![c](c)', themes[0], { galleryMode: 'collage' })
  // 右列两图带裁切比例样式
  const grs = [...html.matchAll(/aspect-ratio:([0-9.]+:[0-9.]+);object-fit:cover/g)]
  assert.equal(grs.length, 2) // 右列两图
  const [rw, rh] = grs[0][1].split(':').map(Number)
  // 齐平验证：左高 = 68/1.78 = 38.2，右列总高 = 2×rh + 1.2 = 左高
  const leftH = 68 / 1.78
  assert.ok(Math.abs(rw - (100 - 1.2 - 68)) < 0.02) // 右列宽
  assert.ok(Math.abs(2 * rh + 1.2 - leftH) < 0.2) // 右列总高 = 左高
  setImageAspectProvider(null)
})

test('拼贴焦点区竖图首图时左宽不低于 50%', () => {
  setImageAspectProvider((src) => ({ a: 0.5625, b: 1, c: 1.78 }[src]))
  const html = renderMarkdown('![a](a)\n\n![b](b)\n\n![c](c)', themes[0], { galleryMode: 'collage' })
  const left = html.match(/width:([0-9.]+)%;margin-right:1.2%/)
  assert.ok(Number(left[1]) >= 50)
  setImageAspectProvider(null)
})

test('网格比例可配置（4:5 / 3:4），非法值回退 1:1', () => {
  const html45 = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: 'grid', galleryRatio: '4:5' })
  assert.match(html45, /aspect-ratio:4\/5;object-fit:cover/)
  const html34 = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: 'grid', galleryRatio: '3:4' })
  assert.match(html34, /aspect-ratio:3\/4;object-fit:cover/)
  // 拼贴：主图不裁切，仅焦点区右列两图裁切填充（比例与 grid 比例无关）
  const collage = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: 'collage', galleryRatio: '4:5' })
  assert.doesNotMatch(collage, /aspect-ratio:4\/5/)
  assert.equal((collage.match(/aspect-ratio:/g) || []).length, 2)
  // 非法比例回退 1:1
  const fallback = renderMarkdown(galleryMarkdown, themes[0], { galleryMode: 'grid', galleryRatio: '9:16' })
  assert.match(fallback, /aspect-ratio:1\/1;object-fit:cover/)
})

test('复制前会移除预览专用行号', () => {
  const html = renderMarkdown('# 标题\n\n正文', themes[0], {})
  assert.match(html, /data-line=/)
  assert.doesNotMatch(stripPreviewMeta(html), /data-line=/)
})

test('保留列表起始序号、表格对齐和链接图片 title', () => {
  const html = renderMarkdown(
    `3. 第三项
4. 第四项

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| A | B | 42 |

[带提示的链接](https://example.com/ "链接提示")

![带图注的图片](https://picsum.photos/seed/title-test/800/500 "图片提示")`,
    themes[0],
    { galleryMode: 'collage' }
  )

  // 有序列表不走原生 <ol>（微信会扁平化），序号以文本形式保留
  assert.doesNotMatch(html, /<ol|<ul|<li/)
  assert.match(html, />3\.&nbsp;<\/span>第三项/)
  assert.match(html, />4\.&nbsp;<\/span>第四项/)
  assert.match(html, /text-align:left/)
  assert.match(html, /text-align:center/)
  assert.match(html, /text-align:right/)
  assert.match(html, /title="链接提示"/)
  assert.match(html, /title="图片提示"/)
})

test('每套新主题都能呈现独立标题、代码外壳与删除线', () => {
  const source = `# 一级标题

## 01 二级标题

##### 五级标题

###### 六级标题

~~已失效内容~~

\`\`\`js
const ready = true
\`\`\``

  const outputs = themes.map((item) =>
    renderMarkdown(source, item, { macCode: true, galleryMode: 'collage' })
  )

  assert.equal(new Set(outputs).size, themes.length)
  for (const html of outputs) {
    assert.match(html, /<h5/)
    assert.match(html, /<h6/)
    assert.match(html, /<s style=/)
    assert.doesNotMatch(html, /undefined|null/)
  }

  assert.match(outputs[1], /CODE \/ JS/)
  assert.match(outputs[2], /TIMECODE \/ JS/)
  assert.match(outputs[3], /background-color:#f2f2f2/)
  assert.match(outputs[4], /CONSOLE \/ JS/)
  assert.match(outputs[5], /TELEMETRY \/ JS/)
})

test('所有主题中的引用列表改用微信安全的 section 结构并保持左对齐', () => {
  const source = `> 外层引用
>
> > 内层引用
> >
> > - 引用列表一
> > - 引用列表二`

  for (const theme of themes) {
    const html = renderMarkdown(source, theme, {})

    assert.equal((html.match(/<blockquote/g) || []).length, 2, theme.id)
    // 微信粘贴会把嵌套 ul/ol/li 扁平化、顺序错乱，列表必须全部输出为 section
    assert.doesNotMatch(html, /<ul|<ol|<li/, `${theme.id} 的列表不应输出原生列表标签`)
    assert.doesNotMatch(html, /<li[^>]*>\s*<p/, `${theme.id} 的紧凑列表不应生成额外段落`)
    assert.match(
      html,
      /<blockquote[^>]*style="[^"]*margin:0\.8em 0 0\.4em[^"]*"/,
      `${theme.id} 的嵌套引用不应重复叠加外层横向边距`
    )
    assert.match(
      html,
      /<section[^>]*style="[^"]*text-align:left[^"]*text-indent:0[^"]*"/,
      `${theme.id} 的引用列表必须左对齐`
    )
    assert.match(
      html,
      />•&nbsp;<\/span>[^<]*引用列表一/,
      `${theme.id} 的列表标记必须为纯文本`
    )
  }
})

test('嵌套块关闭后的续段仍使用真实祖先样式', () => {
  const source = `- 外层第一段

  - 内层项目

  外层继续段落

> 引用第一段
>
> > 内层引用
>
> 引用继续段落`
  const html = renderMarkdown(source, themes[0], {
    custom: {
      p: '--paragraph-role:normal;',
      liP: '--paragraph-role:list;',
      bqP: '--paragraph-role:quote;',
    },
  })

  assert.match(html, /style="--paragraph-role:list;[^"]*">外层继续段落/)
  assert.match(html, /style="--paragraph-role:quote;[^"]*">引用继续段落/)
  assert.doesNotMatch(html, /style="--paragraph-role:normal;">(?:外层|引用)继续段落/)
})

test('所有主题都保护长英文断行，纸上散文不再拉散中文字距', () => {
  const source =
    '这里放入一个很长的英文词：supercalifragilisticexpialidociousAndAnotherUnbrokenTokenForOverflowTesting。'

  for (const theme of themes) {
    const styles = buildStyles(theme)
    const html = renderMarkdown(source, theme, {})

    assert.match(styles.container, /overflow-wrap:anywhere/, theme.id)
    assert.match(html, /supercalifragilisticexpialidociousAndAnotherUnbrokenTokenForOverflowTesting/)
  }

  const literaryStyles = buildStyles(themes[0])
  assert.match(literaryStyles.p, /text-align:left/)
  assert.doesNotMatch(literaryStyles.p, /text-align:justify/)
})

test('辅色槽位可独立覆盖，未指定的槽位与主色不受影响', () => {
  const candy = themes.find((t) => t.id === 'candy-pop')
  const source = '> 引用\n\n[链接](https://example.com)\n\n==高亮=='

  const original = renderMarkdown(source, candy, { fontSize: 16 })
  assert.match(original, /#4d7cff/i)

  const recolored = renderMarkdown(source, candy, {
    fontSize: 16,
    slotColors: { blue: '#00c853' },
  })
  assert.match(recolored, /#00c853/i)
  assert.doesNotMatch(recolored, /#4d7cff/i)
  // 浅蓝底随之派生，不再出现原浅底
  assert.doesNotMatch(recolored, /#f4f8ff/i)
  // 未调整的黄色槽位保持原样
  assert.match(recolored, /#ffd23f/i)

  // 鎏金的深色变体按所选颜色派生
  const gold = themes.find((t) => t.id === 'midnight-gold')
  const regolded = renderMarkdown('**重点** 与 ==高亮==', gold, {
    fontSize: 16,
    slotColors: { gold: '#2f6b4f' },
  })
  assert.match(regolded, /#2f6b4f/i)
  assert.doesNotMatch(regolded, /#c9a063/i)
  assert.doesNotMatch(regolded, /#8a6d2f/i)
  assert.doesNotMatch(regolded, /#f4ecd9/i)
})

test('视频写法渲染为占位卡片，普通 iframe 与句中链接不受影响', () => {
  const tag = renderMarkdown('<video src="https://example.com/a.mp4"></video>', themes[0], {})
  assert.match(tag, /视频占位/)
  assert.match(tag, /https:\/\/example\.com\/a\.mp4/)
  assert.doesNotMatch(tag, /<video/i)

  const bare = renderMarkdown('https://example.com/b.mp4', themes[0], {})
  assert.match(bare, /视频占位/)

  const iframe = renderMarkdown('<iframe src="https://v.qq.com/x.html"></iframe>', themes[0], {})
  assert.match(iframe, /视频占位/)

  const otherIframe = renderMarkdown('<iframe src="https://example.com/widget"></iframe>', themes[0], {})
  assert.doesNotMatch(otherIframe, /视频占位/)

  const inline = renderMarkdown('这个地址 https://example.com/c.mp4 写在句子里', themes[0], {})
  assert.doesNotMatch(inline, /视频占位/)
})

test('local: 图片引用经解析器替换，未注册时降级为空 src', () => {
  const raw = renderMarkdown('![a](local:img-x1)', themes[0], {})
  assert.match(raw, /src=""/)

  setImageResolver((src) => (src === 'local:img-x1' ? 'blob:mock-url' : null))
  const resolved = renderMarkdown('![a](local:img-x1)', themes[0], {})
  assert.match(resolved, /src="blob:mock-url"/)
  setImageResolver(null)
})

test('local: 视频渲染为本地播放器并带复制替换标记', () => {
  setImageResolver((src) => (src === 'local:vid-x1' ? 'blob:mock-video' : null))
  const html = renderMarkdown('<video src="local:vid-x1"></video>', themes[0], {})
  assert.match(html, /data-lv="1"/)
  assert.match(html, /<video src="blob:mock-video" controls/)
  assert.doesNotMatch(html, /视频占位/)
  setImageResolver(null)
})

test('图床响应 URL 按路径提取', () => {
  assert.equal(extractUrl({ url: 'https://a.com/x.jpg' }, 'url'), 'https://a.com/x.jpg')
  assert.equal(extractUrl({ data: { link: 'https://a.com/y.jpg' } }, 'data.link'), 'https://a.com/y.jpg')
  assert.equal(extractUrl({ data: {} }, 'data.link'), null)
  assert.equal(extractUrl({ url: 'not-a-url' }, 'url'), null)
})

test('copyVideoPlaceholder 生成与最近渲染主题同款的视频占位卡', () => {
  // 先用一个主题渲染，确保内部样式表就位
  renderMarkdown('正文', themes[0], {})
  const card = copyVideoPlaceholder()
  assert.match(card, /视频占位/)
  assert.match(card, /本地视频文件/)
  assert.match(card, /未内联/)
  assert.match(card, /插入/)
})

test('stripPreviewMeta 保留文章主体只剥离预览标记', () => {
  const html = renderMarkdown('![a](https://example.com/x.jpg)\n\n![b](https://example.com/y.jpg)', themes[0], {})
  const out = stripPreviewMeta(html)
  assert.doesNotMatch(out, /data-line=/)
  assert.match(out, /https:\/\/example\.com\/x\.jpg/)
  assert.match(out, /https:\/\/example\.com\/y\.jpg/)
})
