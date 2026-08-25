import { reactive, computed, watch } from 'vue'
import { themes } from './themes.js'
import { sample } from './sample.js'
import { setImageResolver, setImageAspectProvider, setGalleryOverrideProvider } from './renderer.js'
import { getImageUrl, warmImageCache, pruneImages, getImage } from './imagedb.js'
import { getImageHost } from './imagehost.js'

const KEYS = {
  content: 'wmd-content',
  backup: 'wmd-content-backup',
  theme: 'wmd-theme',
  settings: 'wmd-settings',
  docs: 'wmd-docs',
  activeDoc: 'wmd-active-doc',
  trash: 'wmd-trash',
  ui: 'wmd-ui',
}
const SETTINGS_VERSION = 11
const SAVE_DELAY = 250
const PREVIEW_MODES = new Set(['full', 'mobile', 'desktop'])

function normalizePreviewMode(value) {
  if (PREVIEW_MODES.has(value)) return value
  if (value === 'landscape') return 'desktop'

  const legacyWidth = Number(value)
  if (!Number.isFinite(legacyWidth)) return 'full'
  if (legacyWidth <= 480) return 'mobile'
  return 'desktop'
}

function normalizeThemeId(value) {
  return themes.some((item) => item.id === value) ? value : themes[0].id
}

function readRaw(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // 隐私模式、存储空间耗尽或存储被禁用时，不影响继续编辑。
    return false
  }
}

function load(key, fallback) {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function loadText(key, fallback) {
  const raw = readRaw(key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : fallback
  } catch {
    return raw // 兼容早期按纯文本存储的草稿
  }
}

function loadSettings() {
  const defaults = {
    fontSize: 16,
    fontFamily: 'theme',
    accentByTheme: {},
    accentSlotsByTheme: {},
    macCode: true,
    previewWidth: 'full',
    previewColorMode: 'light',
    editorPct: 50,
    viewMode: 'split',
    galleryMode: 'collage',
    galleryRatio: '1:1',
    linkFootnotes: false,
    favoriteThemes: [],
    custom: {},
    imageHost: { provider: '', config: {}, always: 'off' },
    v: SETTINGS_VERSION,
  }
  const saved = load(KEYS.settings, null)
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults

  const savedVersion = Number(saved.v) || 0
  const settings = Object.assign({}, defaults, saved, { v: SETTINGS_VERSION })
  if (savedVersion < 2) {
    settings.editorPct = 50
  }
  if (savedVersion < 5) {
    // 迁移：预览默认回到完整工作区，手机和桌面保留为快捷设备视图。
    settings.previewWidth = 'full'
  }
  settings.previewWidth = normalizePreviewMode(settings.previewWidth)
  if (!['light', 'dark'].includes(settings.previewColorMode)) {
    settings.previewColorMode = defaults.previewColorMode
  }
  if (typeof saved.galleryMode !== 'string' || !saved.galleryMode) {
    settings.galleryMode = defaults.galleryMode
  }
  // 网格图比例：仅「网格」模式生效，所有网格图统一裁切为该比例
  if (!['1:1', '4:5', '3:4'].includes(settings.galleryRatio)) {
    settings.galleryRatio = defaults.galleryRatio
  }
  if (!['split', 'preview'].includes(settings.viewMode)) {
    // “写作”单栏视图已下线，统一回到对照视图。
    settings.viewMode = defaults.viewMode
  }
  if (savedVersion < 8 && (!saved.fontFamily || saved.fontFamily === 'sans')) {
    // 字体设置改为“跟随主题”优先；旧的默认黑体视为未做选择。
    settings.fontFamily = 'theme'
  }
  if (savedVersion < 10) {
    // 上传功能下线：清掉历史设置里遗留的图床凭据
    delete settings.imageHost
    delete settings.smmsToken
    delete settings.customHost
    delete settings.customToken
  }
  // 贴纸功能已下线
  delete settings.sticker
  // 图床配置（可选）：provider 为空表示不使用
  if (!settings.imageHost || typeof settings.imageHost !== 'object' || Array.isArray(settings.imageHost)) {
    settings.imageHost = { provider: '', config: {}, always: 'off' }
  } else {
    if (!settings.imageHost.config || typeof settings.imageHost.config !== 'object') {
      settings.imageHost.config = {}
    }
    if (!['off', 'image', 'video', 'both'].includes(settings.imageHost.always)) {
      settings.imageHost.always = 'off'
    }
    if (typeof settings.imageHost.provider !== 'string') settings.imageHost.provider = ''
  }
  if (!settings.custom || typeof settings.custom !== 'object' || Array.isArray(settings.custom)) {
    settings.custom = {}
  } else if (savedVersion < 6) {
    const activeThemeIds = new Set(themes.map((item) => item.id))
    settings.custom = Object.fromEntries(
      Object.entries(settings.custom).filter(([themeId]) => activeThemeIds.has(themeId))
    )
  }
  // 收藏的主题列表：兜底为空数组，并清掉已不存在的主题
  if (!Array.isArray(settings.favoriteThemes)) {
    settings.favoriteThemes = []
  } else {
    const activeThemeIds = new Set(themes.map((item) => item.id))
    settings.favoriteThemes = settings.favoriteThemes.filter((id) => activeThemeIds.has(id))
  }
  if (
    !settings.accentByTheme ||
    typeof settings.accentByTheme !== 'object' ||
    Array.isArray(settings.accentByTheme)
  ) {
    settings.accentByTheme = {}
  }
  if (
    !settings.accentSlotsByTheme ||
    typeof settings.accentSlotsByTheme !== 'object' ||
    Array.isArray(settings.accentSlotsByTheme)
  ) {
    settings.accentSlotsByTheme = {}
  }
  if (savedVersion < 7 && typeof saved.accent === 'string' && saved.accent) {
    // 旧版强调色是全局值；迁移后只保留给当时唯一通过的“纸上散文”，
    // 避免它污染每套新主题各自完整的色彩系统。
    settings.accentByTheme = { ...settings.accentByTheme, literary: saved.accent }
  }
  delete settings.accent
  return settings
}

const savedThemeId = load(KEYS.theme, themes[0].id)
const initialThemeId = normalizeThemeId(savedThemeId)
if (initialThemeId !== savedThemeId) write(KEYS.theme, initialThemeId)

// 早期默认样章与新示例文章替换时，仅当存储内容仍是旧默认样章才迁移，
// 用户自己的文章不受影响。旧样章存入备份，可通过“恢复刚才的文档”找回。
// 名单也包含当前示例的标题：示例文更新后，内容不是最新版的旧示例会被替换，
// 与当前示例完全一致的文档不受影响（避免每次刷新重复迁移）。
const LEGACY_DEFAULT_SAMPLES = [
  '# 公众号排版助手',
  '# 让排版成为文章的衣裳',
  '# 一篇文章，压测全部 Markdown 排版细节',
  '# 沿着旧城，走完一个没有计划的下午',
  '# 我们如何把“写完”变成“可以发布”',
  '# 公众号太久没更新，我顺手写了个排版工具',
]
const storedMd = loadText(KEYS.content, sample)
const storedBackup = loadText(KEYS.backup, null)
const isLegacyDefault =
  LEGACY_DEFAULT_SAMPLES.some((title) => storedMd.trimStart().startsWith(title)) && storedMd !== sample
const initialMd = isLegacyDefault ? sample : storedMd
const initialBackup = isLegacyDefault ? storedMd : storedBackup
if (isLegacyDefault) {
  write(KEYS.content, initialMd)
  write(KEYS.backup, initialBackup)
}

// ---------- 多文档 ----------

export function docTitle(content) {
  const m = String(content || '').match(/^#\s+(.+?)\s*$/m)
  return (m?.[1] || '未命名文章').replace(/[*_`~[\]]/g, '').trim() || '未命名文章'
}

// 字符数（不计空白），状态栏与文档列表共用
export function countChars(text) {
  return String(text || '').replace(/\s/g, '').length
}

function makeDoc(content, now = Date.now()) {
  return {
    id: `doc-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    content: String(content ?? ''),
    createdAt: now,
    updatedAt: now,
  }
}

function loadDocs() {
  const saved = load(KEYS.docs, null)
  if (Array.isArray(saved) && saved.length && saved.every((d) => d && typeof d.content === 'string')) {
    // 旧示例文章随新样章下线：从文档库移入回收站（可恢复），不硬删。
    // 若用户在旧样章上做过自己的修改，也会进回收站而非丢失，可随时找回。
    // 内容与当前示例完全一致的文档保持不动，避免每次启动重复迁移。
    const kept = []
    const legacy = []
    for (const d of saved) {
      const isLegacy =
        d.content !== sample &&
        LEGACY_DEFAULT_SAMPLES.some((title) => d.content.trimStart().startsWith(title))
      ;(isLegacy ? legacy : kept).push(d)
    }
    if (legacy.length) {
      const trash = [...legacy.map((d) => ({ ...d, deletedAt: Date.now() })), ...load(KEYS.trash, [])]
      trash.length = Math.min(trash.length, 10)
      write(KEYS.trash, trash)
      // 迁移结果立刻落盘；否则下次启动会再次迁移，回收站被同一篇刷爆
      const next = kept.length ? kept : [makeDoc(initialMd)]
      write(KEYS.docs, next)
      const activeId = load(KEYS.activeDoc, null)
      if (!next.some((d) => d.id === activeId)) write(KEYS.activeDoc, next[0].id)
      return next
    }
    return saved
  }
  // 首迁：把单文档草稿变成第一篇文章
  return [makeDoc(initialMd)]
}

const initialDocs = loadDocs()
const savedActiveId = load(KEYS.activeDoc, null)
const initialActiveId = initialDocs.some((d) => d.id === savedActiveId) ? savedActiveId : initialDocs[0].id
const initialActiveDoc = initialDocs.find((d) => d.id === initialActiveId) || initialDocs[0]
const effectiveMd = initialActiveDoc.content

export const store = reactive({
  md: effectiveMd,
  backupMd: initialBackup,
  docs: initialDocs,
  activeDocId: initialActiveId,
  themeId: initialThemeId,
  // 悬浮主题面板悬停时的“试看”主题，不落盘；null 表示使用正式主题
  previewThemeId: null,
  settings: loadSettings(),
  lastSavedAt: null,
  trash: load(KEYS.trash, []),
  // 面板开合（持久化）：三个面板均可独立开合；文档栏内部可切换文章与回收站视图。
  ui: (() => {
    const ui = Object.assign(
      {
        drawerOpen: false,
        documentView: 'documents',
        themePanelOpen: false,
        settingsPanelOpen: false,
      },
      load(KEYS.ui, {})
    )
    if (!['documents', 'trash'].includes(ui.documentView)) ui.documentView = 'documents'
    return ui
  })(),
  toast: '',
  // IndexedDB 图片缓存预热完成的信号：预热后 +1，触发预览重渲染
  imageCacheVersion: 0,
  // 图片比例学习到新值的信号：对齐式画廊据此重渲染
  aspectVersion: 0,
})

// 渲染器通过它把 local: 图片引用解析成内存中的 objectURL
setImageResolver((src) => getImageUrl(src.slice('local:'.length)))
// 只预热仍被引用的媒体（文档、回收站、备份），避免把历史遗留的大文件全量载入内存
warmImageCache(usedImageIds()).then(async () => {
  store.imageCacheVersion += 1
  // 启动时自动清理孤儿图片（回收站与备份里的引用保留）
  await pruneImages(usedImageIds()).catch(() => {})
})

// ---- 图片宽高比缓存（对齐式画廊按它分配宽度） ----
const savedAspects = load('wmd-aspects', {})
const imageAspects = reactive(savedAspects && typeof savedAspects === 'object' && !Array.isArray(savedAspects) ? savedAspects : {})
setImageAspectProvider((src) => imageAspects[src])

export function registerImageAspect(src, width, height) {
  if (!src || !width || !height) return false
  const a = Math.round((width / height) * 1000) / 1000
  if (imageAspects[src] && Math.abs(imageAspects[src] - a) < 0.01) return false
  imageAspects[src] = a
  write('wmd-aspects', { ...imageAspects })
  return true
}

// 查询某张图的宽高比（画廊拖拽的解析吸附与渲染器 justifiedWidths 共用同一数据源）
export function getImageAspect(src) {
  return src ? imageAspects[src] : undefined
}

// ---- 画廊宽度覆盖（预览里拖拽/自动微调的结果，按图片地址记忆） ----
// 条目格式 { v: 百分比, auto: 是否自动微调 }；auto 条目允许后续自动修正，
// 手动拖拽（auto:false）永远优先。兼容早期的纯数字格式。
const savedOverrides = load('wmd-gallery-overrides', {})
const galleryOverrides = reactive(
  savedOverrides && typeof savedOverrides === 'object' && !Array.isArray(savedOverrides) ? savedOverrides : {}
)
setGalleryOverrideProvider((src) => {
  const e = galleryOverrides[src]
  return typeof e === 'number' ? e : e?.v
})

export function setGalleryOverride(src, pct, { auto = false } = {}) {
  if (!src) return
  galleryOverrides[src] = { v: Math.round(pct * 100) / 100, auto }
  write('wmd-gallery-overrides', { ...galleryOverrides })
}

export function getGalleryOverride(src) {
  const e = src ? galleryOverrides[src] : undefined
  if (typeof e === 'number') return e
  return e && typeof e.v === 'number' ? e.v : null
}

// 是否手动拖拽产生的覆盖（自动微调条目返回 false，允许继续修正）
export function isManualGalleryOverride(src) {
  const e = src ? galleryOverrides[src] : undefined
  return !!e && typeof e === 'object' && e.auto === false
}

export function clearGalleryOverride(src) {
  if (!src || !(src in galleryOverrides)) return false
  delete galleryOverrides[src]
  write('wmd-gallery-overrides', { ...galleryOverrides })
  return true
}

// 所有存活文档（含回收站与备份）仍在引用的图片 id
export function usedImageIds() {
  const ids = new Set()
  const scan = (text) => {
    for (const m of String(text || '').matchAll(/local:((?:img|vid)-[a-z0-9]+)/g)) ids.add(m[1])
  }
  for (const d of store.docs) scan(d.content)
  for (const d of store.trash) scan(d.content)
  scan(store.backupMd)
  return [...ids]
}

// ---------- 图床（可选） ----------

export function imageHostReady() {
  return !!store.settings.imageHost?.provider
}

// 粘贴媒体时是否应自动上传（kind: 'image' | 'video'）
export function shouldAutoUpload(kind) {
  if (!imageHostReady()) return false
  const always = store.settings.imageHost.always
  return always === 'both' || always === kind
}

// 上传一个 Blob 到已配置的图床，返回公网 URL
export async function uploadBlobToHost(blob, filename) {
  const host = getImageHost(store.settings.imageHost?.provider)
  if (!host) throw new Error('未配置图床')
  return host.upload(blob, store.settings.imageHost.config || {}, filename)
}

// 把指定文档里某一类本地媒体（图片或视频）全部上传到图床并替换为公网链接
export async function uploadDocMedia(docId, kind) {
  const doc = store.docs.find((d) => d.id === docId)
  if (!doc) return { done: 0, failed: 0, total: 0 }
  const isVideo = kind === 'video'
  const re = isVideo ? /local:(vid-[a-z0-9]+)/g : /local:(img-[a-z0-9]+)/g
  const ids = [...new Set([...doc.content.matchAll(re)].map((m) => m[1]))]
  let done = 0
  let failed = 0

  // 并发 3 路上传；内容替换是同步语句，各任务间不会互相覆盖
  const CONCURRENCY = 3
  let cursor = 0
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor]
      cursor += 1
      try {
        const blob = await getImage(id)
        if (!blob) {
          failed += 1
          continue
        }
        const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
        const url = await uploadBlobToHost(blob, `${id}.${ext}`)
        // 后缀断言防止 id 前缀重叠（local:img-abc 不会误匹配 local:img-abcd）
        doc.content = doc.content.replace(new RegExp(`local:${id}(?![a-z0-9])`, 'g'), url)
        done += 1
      } catch {
        failed += 1
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()))

  if (done) {
    doc.updatedAt = Date.now()
    if (doc.id === store.activeDocId) store.md = doc.content
    persistDocs()
    // 替换后本地字节已成孤儿，顺手清掉
    await pruneImages(usedImageIds()).catch(() => {})
  }
  return { done, failed, total: ids.length }
}

export const theme = computed(() => themes.find((t) => t.id === store.themeId) || themes[0])
export const activeAccent = computed(
  () => store.settings.accentByTheme?.[store.themeId] || null
)

export function setActiveAccent(value) {
  const next = { ...(store.settings.accentByTheme || {}) }
  if (typeof value === 'string' && value) next[store.themeId] = value
  else delete next[store.themeId]
  store.settings.accentByTheme = next
}

export const activeSlotColors = computed(
  () => store.settings.accentSlotsByTheme?.[store.themeId] || {}
)

export function setSlotColor(key, value) {
  const all = { ...(store.settings.accentSlotsByTheme || {}) }
  const current = { ...(all[store.themeId] || {}) }
  if (typeof value === 'string' && value) current[key] = value
  else delete current[key]
  if (Object.keys(current).length) all[store.themeId] = current
  else delete all[store.themeId]
  store.settings.accentSlotsByTheme = all
}

let toastTimer = null
export function notify(msg) {
  store.toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (store.toast = ''), 2400)
}

export function replaceDocument(next) {
  const nextMd = String(next ?? '')
  if (nextMd === store.md) return false

  store.backupMd = store.md
  write(KEYS.backup, store.backupMd)
  store.md = nextMd
  return true
}

export function restoreDocument() {
  if (typeof store.backupMd !== 'string') return false

  const current = store.md
  const previous = store.backupMd
  store.backupMd = current
  write(KEYS.backup, current)
  store.md = previous
  return true
}

// ---------- 多文档操作 ----------

function persistDocs() {
  const doc = store.docs.find((d) => d.id === store.activeDocId)
  if (doc) {
    if (doc.content !== store.md) doc.updatedAt = Date.now()
    doc.content = String(store.md ?? '')
  }
  write(KEYS.docs, store.docs)
  write(KEYS.content, String(store.md ?? ''))
  store.lastSavedAt = Date.now()
}

export function createDocument(content = '# 未命名文章\n\n') {
  const doc = makeDoc(content)
  store.docs.push(doc)
  store.activeDocId = doc.id
  store.md = doc.content
  write(KEYS.activeDoc, doc.id)
  persistDocs()
  return doc
}

export function selectDocument(id) {
  if (id === store.activeDocId) return
  const doc = store.docs.find((d) => d.id === id)
  if (!doc) return
  store.activeDocId = doc.id
  store.md = doc.content
  write(KEYS.activeDoc, doc.id)
  persistDocs()
}

export function renameDocument(id, title) {
  const doc = store.docs.find((d) => d.id === id)
  const clean = String(title || '').trim()
  if (!doc || !clean) return
  if (/^#\s+.+$/m.test(doc.content)) doc.content = doc.content.replace(/^#\s+.+$/m, `# ${clean}`)
  else doc.content = `# ${clean}\n\n${doc.content}`
  doc.updatedAt = Date.now()
  if (id === store.activeDocId) store.md = doc.content
  persistDocs()
}

// 删除进入回收站（最多保留 10 篇），可随时恢复
export function deleteDocument(id) {
  const idx = store.docs.findIndex((d) => d.id === id)
  if (idx === -1) return
  const [removed] = store.docs.splice(idx, 1)
  store.trash.unshift({ ...removed, deletedAt: Date.now() })
  if (store.trash.length > 10) store.trash.length = 10
  write(KEYS.trash, store.trash)
  if (!store.docs.length) {
    createDocument()
    return
  }
  if (store.activeDocId === id) {
    const next = store.docs[Math.min(idx, store.docs.length - 1)]
    store.activeDocId = next.id
    store.md = next.content
    write(KEYS.activeDoc, next.id)
  }
  persistDocs()
}

export function restoreFromTrash(id) {
  const idx = store.trash.findIndex((d) => d.id === id)
  if (idx === -1) return
  const [doc] = store.trash.splice(idx, 1)
  write(KEYS.trash, store.trash)
  store.docs.push(doc)
  store.activeDocId = doc.id
  store.md = doc.content
  write(KEYS.activeDoc, doc.id)
  persistDocs()
}

export function removeFromTrash(id) {
  const idx = store.trash.findIndex((d) => d.id === id)
  if (idx === -1) return
  store.trash.splice(idx, 1)
  write(KEYS.trash, store.trash)
}

export function importContents(list, { select = true } = {}) {
  const docs = []
  for (const item of list) {
    if (!item || typeof item.content !== 'string' || !item.content.trim()) continue
    docs.push(makeDoc(item.content))
  }
  if (!docs.length) return []
  store.docs.push(...docs)
  if (select) {
    const last = docs[docs.length - 1]
    store.activeDocId = last.id
    store.md = last.content
    write(KEYS.activeDoc, last.id)
  }
  persistDocs()
  return docs
}

let contentTimer = null
let settingsTimer = null

watch(
  () => store.md,
  () => {
    clearTimeout(contentTimer)
    contentTimer = setTimeout(() => {
      persistDocs()
      contentTimer = null
    }, SAVE_DELAY)
  }
)

watch(
  () => store.themeId,
  (value) => write(KEYS.theme, value)
)

watch(
  () => store.ui,
  (value) => write(KEYS.ui, value),
  { deep: true }
)

watch(
  () => store.settings,
  (value) => {
    clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      write(KEYS.settings, value)
      settingsTimer = null
    }, SAVE_DELAY)
  },
  { deep: true }
)

// 页面在防抖窗口内关闭时，仍把最后一次输入同步落盘。
function flushPendingWrites() {
  if (contentTimer) {
    clearTimeout(contentTimer)
    contentTimer = null
    persistDocs()
  }
  if (settingsTimer) {
    clearTimeout(settingsTimer)
    settingsTimer = null
    write(KEYS.settings, store.settings)
  }
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', flushPendingWrites)
}
