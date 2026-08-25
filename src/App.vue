<template>
  <div class="app-d">
    <TopBar />

    <div class="d-body">
      <RailBar />
      <div class="left-panels" aria-label="左侧工作面板">
        <SideBar />
        <ThemePanel />
      </div>

      <main ref="mainRef" class="canvas" :class="`mode-${viewMode}`">
        <div class="editor-pane" :class="{ 'pane-hidden': viewMode === 'preview' }" :style="editorStyle">
          <Toolbar @cmd="onCmd" />
          <div class="editor-body">
            <Editor
              ref="editorRef"
              v-model="store.md"
              @scrollline="onEditorScroll"
              @cursorline="onEditorCursor"
            />
          </div>
          <div class="statusbar">
            <span>{{ charCount }} 字</span>
            <span>阅读约 {{ readMinutes }} 分钟</span>
            <span class="spacer"></span>
            <span>{{ theme.name }} · {{ store.settings.fontSize }}px</span>
          </div>
        </div>

        <div
          class="divider"
          :class="{ 'pane-hidden': viewMode === 'preview' }"
          role="separator"
          aria-label="调整编辑区和预览区宽度"
          aria-orientation="vertical"
          :aria-valuenow="store.settings.editorPct"
          aria-valuemin="25"
          aria-valuemax="70"
          tabindex="0"
          title="拖拽或使用左右方向键调整宽度"
          @pointerdown="startDrag"
          @keydown.left.prevent="resizeBy(-2)"
          @keydown.right.prevent="resizeBy(2)"
        >
          <span></span>
        </div>

        <div
          class="preview-pane"
          :class="[
            { 'is-preview-only': viewMode === 'preview' },
            `dev-${activePreviewMode.value}`,
            `color-${previewColorMode}`,
          ]"
        >
          <PreviewBar
            :view-mode="viewMode"
            :can-restore="!!store.backupMd"
            @change-view="setViewMode"
            @change-device="switchDevice"
            @copy="doCopy"
            @copy-source="copySource"
            @restore="restoreLastDocument"
            @reset="resetDoc"
            @load-sample="loadSample"
            @import="importMd"
            @export="exportMd"
          />
          <div class="preview-scroll" :class="`is-${activePreviewMode.value}`">
            <div
              ref="previewStage"
              class="preview-stage"
              :class="{ 'theme-fading': themeFading, 'device-switching': deviceSwitching }"
            >
              <div
                class="preview-frame-wrap"
                :data-preview-device="activePreviewMode.value"
                :style="previewWrapStyle"
              >
                <div
                  class="preview-frame"
                  :data-preview-device="activePreviewMode.value"
                  :style="previewFrameStyle"
                >
                  <img
                    v-if="activePreviewMode.frame"
                    class="device-frame-media"
                    :class="`is-${activePreviewMode.value}`"
                    :src="activePreviewMode.frame"
                    alt=""
                    aria-hidden="true"
                  />
                  <div class="device-screen" :style="previewScreenStyle">
                    <div
                      class="wechat-chrome"
                      :data-device="activePreviewMode.value"
                      :data-color-mode="previewColorMode"
                    >
                      <div class="wc-title">{{ documentTitle }}</div>
                      <div class="wc-meta">
                        <span class="wc-account">字间排版</span>
                        <span class="wc-author">作者</span>
                        <time>{{ todayText }}</time>
                      </div>
                      <div
                        ref="previewViewport"
                        class="page"
                        :data-preview-device="activePreviewMode.value"
                        :style="previewPageStyle"
                        title="点击任意段落，回到对照模式并定位到对应源码行"
                        @click="onPreviewClick"
                        v-html="html"
                      ></div>
                      <div class="wc-footer" aria-hidden="true">
                        <span>分享</span><span>收藏</span><span>在看</span><span>点赞</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SettingsPanel />
    </div>

    <Transition name="toast">
      <div v-if="store.toast" class="toast" role="status" aria-live="polite">
        {{ store.toast }}
      </div>
    </Transition>

    <input ref="fileInput" type="file" accept=".md,.markdown,.txt" hidden @change="onFile" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import TopBar from './components/TopBar.vue'
import RailBar from './components/RailBar.vue'
import SideBar from './components/SideBar.vue'
import ThemePanel from './components/ThemePanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import PreviewBar from './components/PreviewBar.vue'
import Toolbar from './components/Toolbar.vue'
import Editor from './components/Editor.vue'
import { store, theme, notify, docTitle, countChars, restoreDocument, createDocument, importContents, registerImageAspect, getImageAspect, setGalleryOverride, clearGalleryOverride } from './lib/store.js'
import { themes, colorModeSurface } from './lib/themes.js'
import { renderMarkdown, stripPreviewMeta, copyVideoPlaceholder } from './lib/renderer.js'
import { copyRichText, copyText } from './lib/clipboard.js'
import { getImage, blobToDataUrl, getCachedImageEntries } from './lib/imagedb.js'
import { sample, samples } from './lib/sample.js'

const editorRef = ref(null)
const fileInput = ref(null)
const mainRef = ref(null)
const previewStage = ref(null)
const previewViewport = ref(null)
const previewScale = ref(1)

function openDocuments() {
  store.ui.documentView = 'documents'
  store.ui.drawerOpen = true
}

// 公众号文章页骨架：标题取文档首行标题，日期取当天
const todayText = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

// 正式主题 or 主题菜单悬停时的“试看”主题：悬停时文章实时换肤，不确认不生效
const renderTheme = computed(() => themes.find((t) => t.id === store.previewThemeId) || theme.value)

// 主题切换时的短促淡入过渡
const themeFading = ref(false)
watch(
  () => store.themeId,
  () => {
    themeFading.value = true
    window.setTimeout(() => (themeFading.value = false), 200)
  }
)

// 设备切换：交叉淡入淡出——先淡出，瞬间换设备，再淡入；不做几何变形动画
const deviceSwitching = ref(false)

function switchDevice(value) {
  if (value === store.settings.previewWidth || deviceSwitching.value) return
  deviceSwitching.value = true
  window.setTimeout(() => {
    store.settings.previewWidth = value
    window.setTimeout(() => (deviceSwitching.value = false), 170)
  }, 170)
}

const previewColorMode = computed(() =>
  store.settings.previewColorMode === 'dark' ? 'dark' : 'light'
)

function renderOptions(colorMode) {
  return {
    ...store.settings,
    colorMode,
    accent: store.settings.accentByTheme?.[renderTheme.value.id] || null,
    slotColors: store.settings.accentSlotsByTheme?.[renderTheme.value.id] || null,
    custom: (store.settings.custom || {})[renderTheme.value.id],
  }
}

const previewPageStyle = computed(() => ({
  backgroundColor: colorModeSurface(renderTheme.value.surface, previewColorMode.value),
  colorScheme: previewColorMode.value,
}))

const html = computed(() => {
  store.imageCacheVersion // 图片缓存预热完成后触发重渲染
  store.aspectVersion // 图片比例学习到新值后重渲染（对齐式画廊）
  return renderMarkdown(store.md, renderTheme.value, renderOptions(previewColorMode.value))
})

function renderCopyHtml(colorMode = 'light') {
  const actualTheme = theme.value
  return renderMarkdown(store.md, actualTheme, {
    ...store.settings,
    colorMode: colorMode === 'dark' ? 'dark' : 'light',
    accent: store.settings.accentByTheme?.[actualTheme.id] || null,
    slotColors: store.settings.accentSlotsByTheme?.[actualTheme.id] || null,
    custom: (store.settings.custom || {})[actualTheme.id],
  })
}
const charCount = computed(() => countChars(store.md))
const readMinutes = computed(() => Math.max(1, Math.ceil(charCount.value / 400)))
const documentTitle = computed(() => docTitle(store.md))

const frameUrl = (file) => `${import.meta.env.BASE_URL}device-frames/${file}`

const previewModes = [
  {
    name: '满屏',
    label: '按当前工作区完整预览',
    value: 'full',
  },
  {
    name: '手机',
    label: '手机样机预览',
    value: 'mobile',
    width: 423,
    height: 882,
    frame: frameUrl('iphone-15-pro.svg'),
    screen: { x: 15, y: 15, width: 393, height: 852 },
  },
  {
    name: '桌面',
    label: '桌面显示器预览',
    value: 'desktop',
    width: 1200,
    height: 999,
    frame: frameUrl('imac-pro.png'),
    screen: { x: 68, y: 71, width: 1064, height: 601 },
  },
]
const activePreviewMode = computed(
  () => previewModes.find((mode) => mode.value === store.settings.previewWidth) || previewModes[0]
)
const previewWrapStyle = computed(() => {
  const mode = activePreviewMode.value
  if (!mode.width || !mode.height) return null
  return {
    width: `${mode.width * previewScale.value}px`,
    height: `${mode.height * previewScale.value}px`,
  }
})
const previewFrameStyle = computed(() => {
  const mode = activePreviewMode.value
  if (!mode.width || !mode.height) return null
  return {
    width: `${mode.width}px`,
    height: `${mode.height}px`,
    transform: `scale(${previewScale.value})`,
  }
})
const previewScreenStyle = computed(() => {
  const screen = activePreviewMode.value.screen
  if (!screen) return null
  return {
    left: `${screen.x}px`,
    top: `${screen.y}px`,
    width: `${screen.width}px`,
    height: `${screen.height}px`,
  }
})

const viewMode = computed(() => {
  const mode = store.settings.viewMode || 'split'
  return ['split', 'preview'].includes(mode) ? mode : 'split'
})
const editorStyle = computed(() => ({ flex: `0 0 ${store.settings.editorPct}%` }))

function setViewMode(mode) {
  if (['split', 'preview'].includes(mode)) store.settings.viewMode = mode
}

// ---- 编辑/预览同步滚动（按源码行号对齐） ----

let blocks = []
let previewScroller = null
let previewScrollRaf = 0
let editorSyncRaf = 0
let pendingEditorLine = 0
let ignorePreviewScrollUntil = 0

function getPreviewScroller() {
  if (!previewViewport.value) return null
  return activePreviewMode.value.value === 'full'
    ? previewViewport.value.closest('.preview-scroll')
    : previewViewport.value.closest('.device-screen')
}

function bindPreviewScroller() {
  const next = getPreviewScroller()
  if (next === previewScroller) return
  previewScroller?.removeEventListener('scroll', onPreviewScroll)
  previewScroller = next
  previewScroller?.addEventListener('scroll', onPreviewScroll, { passive: true })
}

function rebuildBlocks() {
  if (!previewViewport.value) return
  const seen = new Set()
  blocks = Array.from(previewViewport.value.querySelectorAll('[data-line]'))
    .map((el) => ({ line: Number(el.dataset.line), el }))
    .filter(({ line }) => {
      if (!Number.isFinite(line) || seen.has(line)) return false
      seen.add(line)
      return true
    })
    .sort((a, b) => a.line - b.line)
  bindPreviewScroller()
}

// v-html 会替换整篇预览 DOM。更新前记录当前对应的源码位置，更新后按源码位置
// 恢复，而不是盲目沿用 scrollTop；这样在光标处输入时预览不会跳回文章开头。
watch(html, () => {
  const lineSnapshot = previewTopToLine()
  nextTick(() => {
    rebuildBlocks()
    if (Number.isFinite(lineSnapshot)) scrollPreviewToLine(lineSnapshot)
  })
})

// 图片比例学习与画廊自动微调：输入停顿 120ms 后再跑，避免每次击键都
// 触发一轮 DOM 测量与异步等待（外链图未加载时要挂起等待）。
let mediaPassTimer = null
watch(html, () => {
  clearTimeout(mediaPassTimer)
  mediaPassTimer = window.setTimeout(runMediaPass, 120)
})
async function runMediaPass() {
  await collectImageAspects()
}
watch(viewMode, () =>
  nextTick(() => {
    measurePreviewFrame()
    rebuildBlocks()
  })
)
watch(
  () => activePreviewMode.value.value,
  () =>
    nextTick(() => {
      measurePreviewFrame()
      rebuildBlocks()
    })
)

function blockPositions() {
  const scroller = previewScroller || getPreviewScroller()
  if (!scroller || !blocks.length) return []
  const boxTop = scroller.getBoundingClientRect().top
  const scale = activePreviewMode.value.value === 'full' ? 1 : previewScale.value || 1
  let lastTop = 0
  return blocks.map(({ line, el }) => {
    const measured = (el.getBoundingClientRect().top - boxTop) / scale + scroller.scrollTop
    const top = Math.max(lastTop, measured)
    lastTop = top
    return { line, top }
  })
}

function syncAnchors() {
  const scroller = previewScroller || getPreviewScroller()
  if (!scroller) return []
  const positions = blockPositions()
  const lastLine = Math.max(0, (editorRef.value?.getLineCount?.() || 1) - 1)
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const anchors = [{ line: 0, top: 0 }, ...positions]
  const tailLine = Math.max(lastLine, anchors.at(-1)?.line || 0)
  anchors.push({ line: tailLine + 1, top: maxTop + 20 })

  const unique = []
  for (const anchor of anchors) {
    const prev = unique.at(-1)
    if (prev?.line === anchor.line) continue
    unique.push({ line: anchor.line, top: Math.max(prev?.top || 0, anchor.top) })
  }
  return unique
}

function interpolate(value, anchors, fromKey, toKey) {
  if (!anchors.length) return 0
  if (value <= anchors[0][fromKey]) return anchors[0][toKey]
  for (let i = 1; i < anchors.length; i++) {
    const left = anchors[i - 1]
    const right = anchors[i]
    if (value > right[fromKey]) continue
    const span = right[fromKey] - left[fromKey]
    const ratio = span > 0 ? (value - left[fromKey]) / span : 0
    return left[toKey] + (right[toKey] - left[toKey]) * ratio
  }
  return anchors.at(-1)[toKey]
}

function scrollPreviewToLine(line) {
  const scroller = previewScroller || getPreviewScroller()
  if (!scroller) return
  const top = Math.max(0, interpolate(Number(line) || 0, syncAnchors(), 'line', 'top') - 20)
  if (Math.abs(scroller.scrollTop - top) < 1) return
  ignorePreviewScrollUntil = performance.now() + 100
  scroller.scrollTop = top
}

function previewTopToLine() {
  const scroller = previewScroller || getPreviewScroller()
  if (!scroller || !blocks.length) return NaN
  return interpolate(scroller.scrollTop + 20, syncAnchors(), 'top', 'line')
}

function onEditorScroll(line) {
  pendingEditorLine = Number(line) || 0
  if (editorSyncRaf) return
  editorSyncRaf = requestAnimationFrame(() => {
    editorSyncRaf = 0
    scrollPreviewToLine(pendingEditorLine)
  })
}

function onEditorCursor(line) {
  pendingEditorLine = Number(line) || 0
  scrollPreviewToLine(pendingEditorLine)
}

function onPreviewScroll() {
  if (performance.now() < ignorePreviewScrollUntil || previewScrollRaf) return
  previewScrollRaf = requestAnimationFrame(() => {
    previewScrollRaf = 0
    const line = previewTopToLine()
    if (Number.isFinite(line)) editorRef.value?.syncScrollToLine?.(line)
  })
}

// 预览点击定位：找到带 data-line 的块，切回对照并把编辑器光标送到对应源码行
function onPreviewClick(event) {
  event.preventDefault()
  const block = event.target.closest?.('[data-line]')
  if (!block) return
  const line = Number(block.dataset.line)
  if (!Number.isFinite(line)) return
  const wasPreviewOnly = viewMode.value !== 'split'
  if (wasPreviewOnly) setViewMode('split')
  const jump = () => editorRef.value?.scrollToLine(line)
  nextTick(() => {
    requestAnimationFrame(jump)
    // 从全预览返回对照时编辑栏有 280ms 展开动画；完成后再校准一次。
    if (wasPreviewOnly) window.setTimeout(jump, 300)
  })
}

function measurePreviewFrame() {
  const stage = previewStage.value
  const mode = activePreviewMode.value
  if (!stage || !mode.width || !mode.height) {
    previewScale.value = 1
    return
  }

  const scale = Math.min(1, stage.clientWidth / mode.width, stage.clientHeight / mode.height)
  previewScale.value = Number.isFinite(scale) && scale > 0 ? scale : 1
}

// ---- 分隔条拖拽 / 键盘调整 ----

let dragCleanup = null

function setEditorPct(clientX) {
  if (!mainRef.value) return
  const rect = mainRef.value.getBoundingClientRect()
  const pct = ((clientX - rect.left) / rect.width) * 100
  store.settings.editorPct = Math.min(70, Math.max(25, Math.round(pct)))
}

function stopDrag() {
  document.body.classList.remove('col-resizing')
  dragCleanup?.()
  dragCleanup = null
}

function startDrag(ev) {
  if (ev.button !== 0) return
  ev.preventDefault()
  // 指针捕获：拖出浏览器窗口外松手也能收到 pointerup，避免拖拽状态卡死；
  // 触摸设备上配合 .divider 的 touch-action:none 才能正常拖动
  try {
    ev.currentTarget.setPointerCapture?.(ev.pointerId)
  } catch {
    // 指针已释放等场景下捕获失败，忽略
  }
  document.body.classList.add('col-resizing')
  setEditorPct(ev.clientX)
  const move = (event) => setEditorPct(event.clientX)
  const end = () => stopDrag()
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  // 失焦兜底（切换窗口等场景）
  window.addEventListener('blur', end)
  dragCleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
  }
}

function resizeBy(delta) {
  store.settings.editorPct = Math.min(70, Math.max(25, store.settings.editorPct + delta))
}

// ---- 复制 / 导入导出 / 样章 ----

// 量取预览中画廊图片的宽高比并注册（blob: 反查回 local: 引用），
// 供对齐式画廊按各图比例分配宽度；学到新值会触发一次重渲染。
function rawSrcKey(src) {
  if (src.startsWith('blob:')) {
    const hit = getCachedImageEntries().find(([, url]) => url === src)
    if (hit) return `local:${hit[0]}`
  }
  return src
}

async function collectImageAspects() {
  const imgs = [...document.querySelectorAll('.wechat-chrome [data-gallery-mode] img')]
  let learned = 0
  // 并行等待未加载完成的图（同一文档里的图同时下载），单张超时 1.5s 兜底
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.naturalWidth) {
        await new Promise((res) => {
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            img.onload = null
            img.onerror = null
            res()
          }
          img.onload = finish
          img.onerror = finish
          window.setTimeout(finish, 1500)
        })
      }
      if (!img.naturalWidth || !img.naturalHeight) return
      if (registerImageAspect(rawSrcKey(img.getAttribute('src') || ''), img.naturalWidth, img.naturalHeight)) {
        learned += 1
      }
    })
  )
  if (learned) store.aspectVersion += 1
}

// ---- 画廊拖拽微调：拖动两格之间的边界，松手自动对齐，覆盖值按图片地址记忆 ----
// 对齐采用解析解而非实测反解：同排同高的齐平宽度是各图宽高比的纯函数，
// 按下时算一次即为常数，吸附不会因布局反馈而振荡（旧实现的乱跳根源）。

// 右列内两图等宽堆叠、间隙为右列宽的 1.2%——与渲染器 justifiedWidths 的公式
// 同源同参数，保证"吸附位置"就是"渲染器默认对齐位置"。
function aspectOfImg(img) {
  const v = Number(getImageAspect(rawSrcKey(img.getAttribute('src') || '')))
  return Number.isFinite(v) && v > 0.1 && v < 10 ? v : 4 / 3
}

// 两格并排排的解析齐平解：左格宽度百分比，使左格底边与右列（单图或多图）精确齐平
function flushPctOf(c0Img, c1Imgs) {
  if (!c0Img || !c1Imgs.length) return null
  const a0 = aspectOfImg(c0Img)
  const rest = c1Imgs.map((im) => aspectOfImg(im)).filter((a) => a > 0)
  if (!rest.length) return null
  const S = rest.reduce((sum, a) => sum + 1 / a, 0) + (rest.length > 1 ? 0.012 : 0)
  const pct = ((100 - 1.2) * S) / (1 / a0 + S)
  return Math.min(85, Math.max(15, Math.round(pct * 100) / 100))
}

let galDrag = null
let galMoveRaf = 0

function onGalleryPointerDown(e) {
  if (e.button !== 0) return
  const img = e.target.closest?.('.wechat-chrome [data-gallery-mode] img')
  if (!img) return
  const cell = img.closest('section')
  const row = cell?.parentElement
  // 只处理恰好两格、且左右并排的排（两图画廊 / 三图拼贴的左大图与右列）。
  // 四图以上拼贴的“整行 + 下行”也是两个 section，但不是并排，拖它们会改坏布局。
  if (!row || !row.hasAttribute('data-gallery-mode')) return
  // 网格与单列是均分/整幅语义，宽度没有自由度，不提供手动微调
  if (row.dataset.galleryMode === 'grid' || row.dataset.galleryMode === 'stack') return
  const cells = [...row.children].filter((el) => el.tagName === 'SECTION')
  if (cells.length !== 2 || !cells.includes(cell)) return
  if (Math.abs(cells[0].getBoundingClientRect().top - cells[1].getBoundingClientRect().top) > 4) return
  // 指针捕获：拖出窗口外松手也能收尾，配合 touch-action:none 支持触摸拖动
  try {
    row.setPointerCapture?.(e.pointerId)
  } catch {
    // 指针已释放等场景下捕获失败，忽略
  }
  // 按下即显示高亮边框，明确当前调整的是哪一排
  row.classList.add('gal-active')
  // 统一调整左格宽度（右格 flex 自动补位），点哪边拖都一样
  const [c0, c1] = cells
  const c0Img = c0.querySelector('img')
  const c1Imgs = [...c1.querySelectorAll('img')]
  // 右列多图 = 裁切填充结构（三图/焦点区）：任何宽度都齐平，拖拽完全自由；
  // 右列单图 = 同高并排（两图画廊）：吸附到解析齐平解（常数，永不振荡）
  const alignedPct = flushPctOf(c0Img, c1Imgs)
  galDrag = {
    keyImg: c0Img,
    c1Imgs,
    a0: aspectOfImg(c0Img),
    free: c1Imgs.length > 1,
    c0,
    c1,
    row,
    startX: e.clientX,
    startW: c0.getBoundingClientRect().width,
    rowW: row.getBoundingClientRect().width,
    alignedPct,
    moved: false,
    pct: null,
    snapped: false,
  }
  const move = (ev) => {
    if (galMoveRaf) return
    // rAF 节流：鼠标高频事件只按帧处理，拖动更流畅
    galMoveRaf = requestAnimationFrame(() => {
      galMoveRaf = 0
      onGalleryPointerMove(ev)
    })
  }
  const end = () => {
    cancelAnimationFrame(galMoveRaf)
    galMoveRaf = 0
    onGalleryPointerUp()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  // 失焦兜底（切换窗口等场景）
  window.addEventListener('blur', end)
}

function onGalleryPointerMove(e) {
  const d = galDrag
  if (!d) return
  const dx = e.clientX - d.startX
  if (!d.moved && Math.abs(dx) < 6) return
  if (!d.moved) {
    d.row.classList.add('gal-active')
    document.body.style.cursor = 'ew-resize'
    // 拖动期间禁止选中正文（CSS 里 user-select: none）
    document.body.classList.add('gal-dragging')
  }
  d.moved = true
  e.preventDefault()
  let pct = Math.min(85, Math.max(15, ((d.startW + dx) / d.rowW) * 100))
  if (d.free) {
    // 右列裁切填充：左图拖到任何宽度，右列实时裁切匹配，底边始终齐平
    applyRightColumn(d, pct)
    d.snapped = false
    d.row.classList.remove('gal-snapped')
  } else {
    // 两格同高排：吸附到解析齐平解（常数，无布局反馈，不会振荡）。
    // 靠近吸住、拉远才松开（迟滞）；阈值 2% ≈ 手机上约 8px 底边差
    if (d.alignedPct != null) {
      const err = Math.abs(pct - d.alignedPct)
      if (d.snapped ? err > 5 : err < 2) d.snapped = !d.snapped
      if (d.snapped) pct = d.alignedPct
      d.row.classList.toggle('gal-snapped', d.snapped)
    }
  }
  d.pct = pct
  d.c0.style.width = `${pct}%`
}

// 拖拽中实时更新右列两图的裁切比例（与渲染器 rightColumnRatio 同公式）
function applyRightColumn(d, pct) {
  if (!d.a0) return
  const leftH = pct / d.a0
  const rightW = 100 - 1.2 - pct
  const itemH = (leftH - 1.2) / 2
  if (!(rightW > 5) || !(itemH > 5)) return
  const ratio = `${Math.round(rightW * 100) / 100}/${Math.round(itemH * 100) / 100}`
  for (const im of d.c1Imgs) im.style.aspectRatio = ratio
}

function onGalleryPointerUp() {
  const d = galDrag
  galDrag = null
  if (!d) return
  d.row.classList.remove('gal-active', 'gal-snapped')
  document.body.style.cursor = ''
  document.body.classList.remove('gal-dragging')
  if (!d.moved) return
  if (d.pct != null) {
    setGalleryOverride(rawSrcKey(d.keyImg?.getAttribute('src') || ''), d.pct)
    // 两格同高排拖出吸附带：保留用户位置，明确告知如何恢复对齐；
    // 裁切填充结构（free）永远齐平，无需提示
    if (!d.free && !d.snapped) notify('已调整宽度（双击图片可恢复自动对齐）')
  }
  // 抑制拖拽后的 click 触发预览定位
  const swallow = (ev) => {
    ev.stopPropagation()
    ev.preventDefault()
  }
  document.addEventListener('click', swallow, { capture: true, once: true })
}

function onGalleryDblClick(e) {
  const img = e.target.closest?.('.wechat-chrome [data-gallery-mode] img')
  if (!img) return
  if (clearGalleryOverride(rawSrcKey(img.getAttribute('src') || ''))) notify('已恢复自动对齐')
}

// 本地视频的复制策略：≤ 阈值的视频内联成 data URI 随 HTML 带走；
// 超过阈值统一转为带文件名的占位卡（粘贴后在公众号后台插入真视频）。
// 官方限制（已实测确认）：公众号保存要求"正文总大小 ≤ 10M 字节"，内联视频
// base64 后计入正文，故按文件 ≤7.5MB 内联（base64 后 ≈10M，贴线达标）。
const INLINE_VIDEO_LIMIT = 7.5 * 1024 * 1024 // 7.5MB（base64 后约 10M 正文）

async function replaceLargeVideos(htmlText) {
  if (!htmlText.includes('data-lv="1"')) return htmlText
  const sectionRe = /<section[^>]*data-lv="1"[^>]*>[\s\S]*?<\/section>/g
  const srcRe = /<video[^>]*src="([^"]+)"/i
  const jobs = []
  htmlText = htmlText.replace(sectionRe, (block) => {
    const m = block.match(srcRe)
    jobs.push({ block, src: m?.[1] || '' })
    return block // 先占位，异步判断大小后再决定替换
  })
  const replace = new Map()
  await Promise.all(
    jobs.map(async (job) => {
      const id = rawSrcKey(job.src) // blob: 反查回 local:vid-xxx
      let size = 0
      if (id.startsWith('local:')) {
        const blob = await getImage(id.slice('local:'.length))
        size = blob?.size || 0
      }
      // 拿不到 blob（已清理）也转占位，避免复制出死链接
      if (!id.startsWith('local:') || size > INLINE_VIDEO_LIMIT) {
        const name = job.block.match(/data-name="([^"]+)"/i)?.[1] || ''
        replace.set(job.block, copyVideoPlaceholder(name))
      }
    })
  )
  for (const [from, to] of replace) htmlText = htmlText.split(from).join(to)
  return htmlText
}

async function doCopy(colorMode = previewColorMode.value) {
  await collectImageAspects()
  await nextTick()
  // 先剥离预览标记、按大小处理视频，再内联 blob 图片（避免处理巨型 base64 字符串）
  const mode = colorMode === 'dark' ? 'dark' : 'light'
  let htmlText = stripPreviewMeta(renderCopyHtml(mode))
  htmlText = await replaceLargeVideos(htmlText)
  const ok = await copyRichText(await inlineLocalImages(htmlText))
  const label = mode === 'dark' ? '夜间版' : '白天版'
  notify(ok ? `${label}排版已复制，可以去公众号后台粘贴了` : '复制失败，请手动全选预览内容')
}

// 把 HTML 里图片、小视频的 blob: 链接统一还原成 data URI
// （公众号无法读取 blob: 链接，粘贴时需要真实媒体数据）
async function inlineLocalImages(htmlText) {
  for (const [id, url] of getCachedImageEntries()) {
    if (!htmlText.includes(url)) continue
    const blob = await getImage(id)
    if (!blob) continue
    htmlText = htmlText.split(url).join(await blobToDataUrl(blob))
  }
  return htmlText
}

async function copySource() {
  let htmlText = stripPreviewMeta(renderCopyHtml(previewColorMode.value))
  htmlText = await replaceLargeVideos(htmlText)
  const ok = await copyText(await inlineLocalImages(htmlText))
  notify(ok ? 'HTML 源码已复制' : '复制失败')
}

function exportMd() {
  const name = documentTitle.value.replace(/[\\/:*?"<>|]/g, '')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([store.md], { type: 'text/markdown;charset=utf-8' }))
  a.download = `${name}.md`
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 0)
  notify('已导出 Markdown 文件')
}

function importMd() {
  fileInput.value?.click()
}

function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    notify('文件超过 5 MB，请拆分后再导入')
    e.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    importContents([{ name: file.name, content: String(reader.result || '') }])
    notify(`已导入「${file.name}」为新文章`)
  }
  reader.onerror = () => notify('文件读取失败，请重试')
  reader.readAsText(file)
  e.target.value = ''
}

function resetDoc() {
  createDocument(sample)
  notify('已新建默认样章')
}

function loadSample(id) {
  const item = samples.find((entry) => entry.id === id)
  if (!item) return
  importContents([{ name: item.title, content: item.md }])
  notify(`已载入「${item.title}」为新文章`)
}

function restoreLastDocument() {
  if (!store.backupMd) return
  restoreDocument()
  notify('已恢复替换前的文章')
}

function onCmd(cmd) {
  editorRef.value?.exec(cmd)
}

function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyC') {
    e.preventDefault()
    doCopy()
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
    e.preventDefault()
    notify('文章已自动保存到本机')
  }
}

let previewResizeObserver = null

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('pointerdown', onGalleryPointerDown)
  document.addEventListener('dblclick', onGalleryDblClick)
  previewResizeObserver = new ResizeObserver(measurePreviewFrame)
  if (previewStage.value) previewResizeObserver.observe(previewStage.value)
  nextTick(() => {
    measurePreviewFrame()
    rebuildBlocks()
    collectImageAspects()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onGalleryPointerDown)
  document.removeEventListener('dblclick', onGalleryDblClick)
  previewResizeObserver?.disconnect()
  previewScroller?.removeEventListener('scroll', onPreviewScroll)
  cancelAnimationFrame(previewScrollRaf)
  cancelAnimationFrame(editorSyncRaf)
  clearTimeout(mediaPassTimer)
  stopDrag()
})
</script>
