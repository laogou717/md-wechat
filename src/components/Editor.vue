<template>
  <div ref="el" class="cm-host"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { placeholder, ViewPlugin, Decoration, WidgetType } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { store, notify, shouldAutoUpload, uploadBlobToHost } from '../lib/store.js'
import { putImage, cacheImage } from '../lib/imagedb.js'
import { startProgress, doneProgress } from '../lib/progress.js'

// 首次粘贴媒体时把建议和成功提示合并成一条（持久化标记，建议只出现一次）
function mediaNotify(baseMsg) {
  if (store.settings.mediaHintSeen) {
    notify(baseMsg)
    return
  }
  store.settings.mediaHintSeen = true
  notify(`${baseMsg}。媒体会随复制一起带走：图片 ≤2MB、视频 ≤100MB，过大请先压缩`)
}

// 图床上传成功提示；GitHub 走 jsdelivr CDN，新文件生效有延迟
function hostNotify(baseMsg) {
  const cdnNote = store.settings.imageHost?.provider === 'github' ? '（jsdelivr CDN 生效可能需几分钟）' : ''
  notify(`${baseMsg}${cdnNote}`)
}

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'scrollline', 'cursorline'])

const el = ref(null)
let view = null
let scrollRaf = 0
let syncingFromModel = false
let ignoreScrollUntil = 0

// ---- 工具栏命令 ----

const wrapInline = (mark) => {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to)
  const before = view.state.sliceDoc(Math.max(0, from - mark.length), from)
  const after = view.state.sliceDoc(to, to + mark.length)
  // 已包裹则取消包裹（开关式）
  if (before === mark && after === mark) {
    view.dispatch({
      changes: [
        { from: from - mark.length, to: from },
        { from: to, to: to + mark.length },
      ],
      selection: { anchor: from - mark.length, head: to - mark.length },
    })
    return
  }
  const text = sel || '文字'
  view.dispatch({
    changes: { from, to, insert: `${mark}${text}${mark}` },
    selection: { anchor: from + mark.length, head: from + mark.length + text.length },
  })
}

const selectedLines = () => {
  const { from, to } = view.state.selection.main
  // 向下选择并停在下一行行首时，不把那一行误算进来。
  const endPos = to > from && view.state.doc.lineAt(to).from === to ? to - 1 : to
  const start = view.state.doc.lineAt(from)
  const end = view.state.doc.lineAt(endPos)
  const lines = []
  for (let number = start.number; number <= end.number; number++) {
    lines.push(view.state.doc.line(number))
  }
  return lines
}

const PREFIX_RULES = {
  h2: {
    target: /^(\s{0,3})##(?:[ \t]+|$)/,
    any: /^(\s{0,3})#{1,6}(?:[ \t]+|$)/,
    prefix: () => '## ',
  },
  h3: {
    target: /^(\s{0,3})###(?:[ \t]+|$)/,
    any: /^(\s{0,3})#{1,6}(?:[ \t]+|$)/,
    prefix: () => '### ',
  },
  quote: {
    target: /^(\s{0,3})>[ \t]?/,
    prefix: () => '> ',
  },
  ul: {
    target: /^(\s*)[-+*][ \t]+/,
    any: /^(\s*)(?:[-+*]|\d+[.)])[ \t]+/,
    prefix: () => '- ',
  },
  ol: {
    target: /^(\s*)\d+[.)][ \t]+/,
    any: /^(\s*)(?:[-+*]|\d+[.)])[ \t]+/,
    prefix: (index) => `${index + 1}. `,
  },
}

const toggleLinePrefix = (kind) => {
  const rule = PREFIX_RULES[kind]
  const lines = selectedLines()
  const remove = lines.every((line) => rule.target.test(line.text))
  const changes = []

  lines.forEach((line, index) => {
    const targetMatch = line.text.match(rule.target)

    if (remove) {
      changes.push({
        from: line.from,
        to: line.from + targetMatch[0].length,
        insert: targetMatch[1] || '',
      })
      return
    }

    // 混合选区中已经是目标格式的行保持不变，防止重复添加前缀。
    if (targetMatch && kind !== 'ol') return

    const anyMatch = rule.any ? line.text.match(rule.any) : null
    if (anyMatch) {
      changes.push({
        from: line.from,
        to: line.from + anyMatch[0].length,
        insert: `${anyMatch[1] || ''}${rule.prefix(index)}`,
      })
      return
    }

    const indent = line.text.match(kind === 'quote' ? /^\s{0,3}/ : /^\s*/)?.[0] || ''
    changes.push({
      from: line.from + indent.length,
      insert: rule.prefix(index),
    })
  })

  if (changes.length) {
    view.dispatch({ changes })
  }
}

const insertBlock = (text) => {
  const { from } = view.state.selection.main
  const insert = `\n\n${text}\n\n`
  view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } })
}

// ---- 粘贴图片 ----

// 剪贴板图片压缩为 JPEG Blob：限制最长边 1200px，字节存 IndexedDB，
// 文档里只留 local: 短引用，不会把编辑器与本地存储撑爆。
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(img.src)
      try {
        if (canvas.convertToBlob) {
          resolve(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
        } else {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85)
        }
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('image decode failed'))
    }
    img.src = URL.createObjectURL(file)
  })
}

async function insertImageFile(file) {
  if (!view) return
  try {
    const blob = await compressImage(file)
    if (shouldAutoUpload('image')) {
      startProgress()
      try {
        const url = await uploadBlobToHost(blob, `paste-${Date.now().toString(36)}.jpg`)
        const { from, to } = view.state.selection.main
        const insert = `![](${url})`
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + 2 }, // 光标落在 [] 里，方便直接输入图注
        })
        hostNotify('已上传图床并插入链接')
        return
      } catch {
        notify('图床上传失败，已改为本地存储')
      } finally {
        doneProgress()
      }
    }
    const id = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    await putImage(id, blob)
    cacheImage(id, blob)
    const { from, to } = view.state.selection.main
    const insert = `![](local:${id})`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 2 }, // 光标落在 [] 里，方便直接输入图注
    })
    mediaNotify('已插入图片，复制到公众号时可正常使用')
  } catch {
    notify('图片读取失败，请重试')
  }
}

// 图片直链：粘贴时自动包成 Markdown 图片语法
const IMAGE_URL = /^https?:\/\/\S+?\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:\?\S*)?$/i

async function insertVideoFile(file) {
  if (!view) return
  if (file.size > 100 * 1024 * 1024) {
    notify('视频超过 100MB，请压缩后再粘贴（或直接在公众号后台插入）')
    return
  }
  try {
    if (shouldAutoUpload('video')) {
      startProgress()
      try {
        const ext = file.type.split('/')[1] || 'mp4'
        const url = await uploadBlobToHost(file, `paste-${Date.now().toString(36)}.${ext}`)
        const { from, to } = view.state.selection.main
        const insert = `\n\n<video src="${url}"></video>\n\n`
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } })
        hostNotify('已上传图床并插入链接')
        return
      } catch {
        notify('图床上传失败，已改为本地存储')
      } finally {
        doneProgress()
      }
    }
    const id = `vid-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    await putImage(id, file)
    cacheImage(id, file)
    const { from, to } = view.state.selection.main
    const safeName = String(file.name || '').replace(/["<>]/g, '')
    const insert = `\n\n<video src="local:${id}" data-name="${safeName}"></video>\n\n`
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } })
    mediaNotify('已插入视频，本地可预览；复制后可去公众号测试效果')
  } catch {
    notify('视频读取失败，请重试')
  }
}

// ---- 本地图片（data URI）在编辑器里折叠为卡片 ----
// 文档里保留完整 data URI（复制到公众号可直接用），
// 编辑器视图上替换成一张小卡片，避免整屏 base64。

class ImageChip extends WidgetType {
  constructor(alt, kb) {
    super()
    this.alt = alt
    this.kb = kb
  }
  eq(other) {
    return other.alt === this.alt && other.kb === this.kb
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-img-chip'
    span.textContent = `🖼 ${this.alt || '本地图片'} · ${this.kb}KB`
    return span
  }
  ignoreEvent() {
    return false
  }
}

const DATA_URI_IMG = /!\[([^\]]*)\]\(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+\)/gi

const imageChipPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view)
    }
    update(u) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view)
    }
    build(view) {
      const ranges = []
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        DATA_URI_IMG.lastIndex = 0
        let m
        while ((m = DATA_URI_IMG.exec(text))) {
          const start = from + m.index
          const end = start + m[0].length
          const kb = Math.max(1, Math.round((m[0].length * 3) / 4 / 1024))
          ranges.push(Decoration.replace({ widget: new ImageChip(m[1], kb) }).range(start, end))
        }
      }
      return Decoration.set(ranges)
    }
  },
  { decorations: (v) => v.decorations }
)

function onPaste(event) {
  const files = [...(event.clipboardData?.files || [])]
  const imageFile = files.find((f) => f.type.startsWith('image/'))
  if (imageFile) {
    event.preventDefault()
    insertImageFile(imageFile)
    return true
  }
  const videoFile = files.find((f) => f.type.startsWith('video/'))
  if (videoFile) {
    event.preventDefault()
    insertVideoFile(videoFile)
    return true
  }
  if (files.length) {
    // 其他文件格式（PDF、ZIP 等）：明确告知，而不是静默无反应
    event.preventDefault()
    notify('暂不支持粘贴该格式；图片、视频可直接粘贴')
    return true
  }
  const text = event.clipboardData?.getData('text/plain')?.trim()
  if (text && IMAGE_URL.test(text)) {
    event.preventDefault()
    const { from, to } = view.state.selection.main
    const insert = `![](${text})`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 2 }, // 光标落在 [] 里，方便直接输入图注
    })
    return true
  }
  return false
}

// 拖放图片/视频：与粘贴走同一套插入逻辑，阻止浏览器默认“打开文件”行为
function onDrop(event) {
  const files = [...(event.dataTransfer?.files || [])]
  if (!files.length) return false
  const imageFile = files.find((f) => f.type.startsWith('image/'))
  if (imageFile) {
    event.preventDefault()
    insertImageFile(imageFile)
    return true
  }
  const videoFile = files.find((f) => f.type.startsWith('video/'))
  if (videoFile) {
    event.preventDefault()
    insertVideoFile(videoFile)
    return true
  }
  event.preventDefault()
  notify('暂不支持该格式；图片、视频可直接拖入')
  return true
}

const wrapLink = () => {
  const { from, to } = view.state.selection.main
  const sel = view.state.sliceDoc(from, to) || '链接文字'
  const insert = `[${sel}](https://)`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + sel.length + 3, head: from + sel.length + 11 },
  })
}

const INLINE = { bold: '**', italic: '*', strike: '~~', inlineCode: '`' }

// 隐藏的文件选择器：工具栏「图片」按钮走本地选图，与粘贴/拖放共用插入链路
let fileInput = null

function selectImageFile() {
  if (!fileInput) {
    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.style.display = 'none'
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (file) insertImageFile(file)
      fileInput.value = ''
    })
    document.body.appendChild(fileInput)
  }
  fileInput.click()
}

function exec(cmd) {
  if (!view) return
  if (INLINE[cmd]) wrapInline(INLINE[cmd])
  else if (PREFIX_RULES[cmd]) toggleLinePrefix(cmd)
  else if (cmd === 'link') wrapLink()
  else if (cmd === 'image-file') selectImageFile()
  else if (cmd === 'codeBlock') insertBlock('```js\n\n```')
  else if (cmd === 'table') insertBlock('| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |')
  else if (cmd === 'gallery') insertBlock('![图片一](https://)\n\n![图片二](https://)\n\n![图片三](https://)')
  else if (cmd === 'hr') insertBlock('---')
  view.focus()
}

// 把光标送到指定源码行并滚动到可视区域（预览点击定位用）
function scrollToLine(line) {
  if (!view) return
  const lineNumber = Math.min(Math.max(Number(line) + 1, 1), view.state.doc.lines)
  const pos = view.state.doc.line(lineNumber).from
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 14 }),
  })
  view.focus()
}

// 预览拖动时只同步阅读位置，不移动光标、不抢走预览区焦点。
function syncScrollToLine(line) {
  if (!view) return
  const value = Math.max(0, Number(line) || 0)
  const base = Math.min(Math.floor(value) + 1, view.state.doc.lines)
  const next = Math.min(base + 1, view.state.doc.lines)
  const baseBlock = view.lineBlockAt(view.state.doc.line(base).from)
  const nextBlock = view.lineBlockAt(view.state.doc.line(next).from)
  const fraction = value - Math.floor(value)
  const top = baseBlock.top + (nextBlock.top - baseBlock.top) * fraction
  ignoreScrollUntil = performance.now() + 100
  view.scrollDOM.scrollTop = Math.max(0, top)
}

function getLineCount() {
  return view?.state.doc.lines || 1
}

defineExpose({ exec, scrollToLine, syncScrollToLine, getLineCount })

// ---- 编辑器初始化 ----

onMounted(() => {
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        markdown(),
        EditorView.lineWrapping,
        // 写作者不需要多光标/矩形选择；禁用后即使环境（卡住的修饰键、
        // 手势软件）触发了这些手势，选择行为也退化为普通单选区。
        EditorState.allowMultipleSelections.of(false),
        imageChipPlugin,
        placeholder('从这里开始，用 Markdown 书写你的文章…'),
        EditorView.domEventHandlers({
          paste: onPaste,
          // 拖入文件时允许 drop（dragover 默认拒绝非文本拖放）
          dragover: (e) => {
            if (e.dataTransfer?.types.includes('Files')) {
              e.preventDefault()
              return true
            }
          },
          drop: onDrop,
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !syncingFromModel) {
            emit('update:modelValue', u.state.doc.toString())
          }
          if (u.selectionSet && !syncingFromModel && u.view.hasFocus) {
            emit('cursorline', u.state.doc.lineAt(u.state.selection.main.head).number - 1)
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px', backgroundColor: '#fdfbf5' },
          '.cm-scroller': {
            fontFamily: "Menlo, Consolas, 'Courier New', monospace",
            lineHeight: '1.75',
          },
          '.cm-gutters': {
            backgroundColor: '#fdfbf5',
            border: 'none',
            color: '#c6c6cf',
            paddingLeft: '4px',
            // 防止从行号栏起拖时选中行号本身
            userSelect: 'none',
          },
          // 当前行底色必须半透明：选区层在内容层之下（z-index:-2），
          // 不透明底色会把单行内的选区高亮整个盖住
          '.cm-activeLine': { backgroundColor: 'rgba(120, 110, 80, 0.08)' },
          '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#8e8e99' },
          // 选区高亮必须始终可见：失焦后隐藏会让用户误以为"松开就没选上"，
          // 颜色也要在米色底上有足够对比度
          '.cm-selectionBackground': { backgroundColor: '#b3e6cd' },
          '&.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: '#b3e6cd !important',
          },
          '.cm-cursor': { borderLeftColor: '#07c160', borderLeftWidth: '2px' },
          '.cm-img-chip': {
            display: 'inline-block',
            padding: '1px 10px',
            margin: '0 2px',
            backgroundColor: '#e9f3ec',
            border: '1px solid #b9d9c6',
            borderRadius: '999px',
            fontSize: '12px',
            color: '#1e6b41',
            verticalAlign: 'baseline',
            cursor: 'default',
          },
        }),
      ],
    }),
    parent: el.value,
  })

  // 滚动时向预览同步顶部可见行号（rAF 节流）
  view.scrollDOM.addEventListener(
    'scroll',
    () => {
      if (scrollRaf) return
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        if (!view) return
        if (performance.now() < ignoreScrollUntil) return
        const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
        emit('scrollline', view.state.doc.lineAt(block.from).number - 1)
      })
    },
    { passive: true }
  )
})

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!view) return
    const next = String(nextValue ?? '')
    if (next === view.state.doc.toString()) return

    const { anchor, head } = view.state.selection.main
    const scrollTop = view.scrollDOM.scrollTop
    syncingFromModel = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: {
          anchor: Math.min(anchor, next.length),
          head: Math.min(head, next.length),
        },
      })
    } finally {
      syncingFromModel = false
    }

    // 全文替换后尽量维持用户所在的阅读位置。
    requestAnimationFrame(() => {
      if (view) view.scrollDOM.scrollTop = scrollTop
    })
  }
)

onBeforeUnmount(() => {
  cancelAnimationFrame(scrollRaf)
  fileInput?.remove()
  fileInput = null
  view?.destroy()
  view = null
})
</script>

<style scoped>
.cm-host {
  height: 100%;
}
.cm-host :deep(.cm-editor) {
  height: 100%;
}
.cm-host :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
