<template>
  <aside
    id="settings-panel"
    class="settings-panel"
    :class="{ closed: !store.ui.settingsPanelOpen }"
    :aria-hidden="!store.ui.settingsPanelOpen"
    :inert="!store.ui.settingsPanelOpen"
  >
    <div class="panel-head">
      <h2>排版设置</h2>
      <button class="panel-x" type="button" title="收起设置" @click="store.ui.settingsPanelOpen = false">
        <Icon name="x" :size="13" aria-hidden="true" />
      </button>
    </div>

    <div class="spanel">
      <div class="s-row">
        <div class="s-label">排版风格</div>
        <div class="s-display">{{ theme.name }}</div>
        <div class="s-hint">主题切换与主题色自定义，统一在左侧 ❖ 主题库中进行</div>
      </div>

      <div class="s-row">
        <div class="s-label">正文字体</div>
        <select v-model="store.settings.fontFamily" class="s-select-input" aria-label="正文字体">
          <option v-for="f in fontOptions" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </div>

      <div class="s-row">
        <div class="s-label">正文字号</div>
        <div class="s-stepper">
          <button type="button" aria-label="减小字号" @click="stepFontSize(-1)">−</button>
          <b>{{ store.settings.fontSize }}px</b>
          <button type="button" aria-label="增大字号" @click="stepFontSize(1)">＋</button>
          <small>14 – 18px</small>
        </div>
      </div>

      <div class="s-row">
        <div class="s-label">代码块外观</div>
        <div class="s-seg">
          <button type="button" :class="{ active: store.settings.macCode }" @click="store.settings.macCode = true">
            Mac 窗口
          </button>
          <button type="button" :class="{ active: !store.settings.macCode }" @click="store.settings.macCode = false">
            纯代码块
          </button>
        </div>
      </div>

      <div class="s-row">
        <div class="s-label">外链处理</div>
        <div class="s-seg">
          <button
            type="button"
            :class="{ active: !store.settings.linkFootnotes }"
            @click="store.settings.linkFootnotes = false"
          >
            保留链接
          </button>
          <button
            type="button"
            :class="{ active: store.settings.linkFootnotes }"
            @click="store.settings.linkFootnotes = true"
          >
            转脚注
          </button>
        </div>
        <div class="s-hint">
          公众号不支持外链（粘贴后链接会失效）；「转脚注」把外部链接移到文末【参考资料】，微信内链（mp.weixin.qq.com）不受影响
        </div>
      </div>

      <div class="s-row">
        <div class="s-label">图库模式</div>
        <div class="s-seg">
          <button
            v-for="mode in galleryModes"
            :key="mode.id"
            type="button"
            :class="{ active: galleryMode === mode.id }"
            :title="mode.hint"
            @click="store.settings.galleryMode = mode.id"
          >
            {{ mode.name }}
          </button>
        </div>
        <div class="s-hint">{{ activeGalleryMode.hint }}</div>
      </div>

      <div class="s-row">
        <div class="s-label">网格比例</div>
        <div class="s-seg">
          <button
            v-for="r in ratioOptions"
            :key="r.value"
            type="button"
            :class="{ active: galleryRatio === r.value }"
            :title="r.hint"
            @click="store.settings.galleryRatio = r.value"
          >
            {{ r.name }}
          </button>
        </div>
        <div class="s-hint">仅「网格」模式生效：所有网格图统一裁切为该比例</div>
      </div>

      <div class="s-divider"></div>

      <button class="advanced-trigger" type="button" :aria-expanded="customOpen" @click="customOpen = !customOpen">
        <span>
          <strong>逐元素样式微调</strong>
          <small>仅修改「{{ theme.name }}」主题</small>
        </span>
        <Icon name="chevron-down" :size="15" aria-hidden="true" />
      </button>
      <div v-if="customOpen" class="custom-style-content">
        <div class="s-hint">直接编辑元素的内联样式，改完即时生效，复制时一并带走</div>
        <div v-for="el in editableElements" :key="el.key" class="custom-item">
          <div class="custom-name">{{ el.name }}</div>
          <textarea
            rows="2"
            spellcheck="false"
            :value="effectiveStyle(el.key)"
            @input="setCustom(el.key, $event.target.value)"
          ></textarea>
        </div>
        <button class="text-button" type="button" @click="resetCustom">重置「{{ theme.name }}」的全部自定义</button>
      </div>

      <div class="s-divider"></div>

      <div class="s-row">
        <div class="s-label">
          资源存储
          <span class="qhint">
            <button class="qhint-btn" type="button" aria-label="资源存储说明" :aria-expanded="hintFor === 'storage'" @click.stop="toggleHint('storage', $event)">?</button>
          </span>
        </div>
        <div class="s-display">{{ imageStatsText }}</div>
        <button class="text-button" type="button" :disabled="cleaningImages" @click="cleanImages">
          {{ cleaningImages ? '清理中…' : '立即清理未使用的文件' }}
        </button>
      </div>

      <div class="s-divider"></div>

      <div class="s-row">
        <div class="s-label">
          图床（可选）
          <span class="qhint">
            <button class="qhint-btn" type="button" aria-label="图床说明" :aria-expanded="hintFor === 'host'" @click.stop="toggleHint('host', $event)">?</button>
          </span>
        </div>
        <select v-model="store.settings.imageHost.provider" class="s-select-input" aria-label="图床供应商">
          <option value="">不使用</option>
          <option v-for="h in IMAGE_HOSTS" :key="h.id" :value="h.id">{{ h.name }}</option>
        </select>
        <template v-if="activeHost">
          <div v-for="f in visibleHostFields" :key="f.key">
            <label v-if="f.type === 'checkbox'" class="s-checkbox-row">
              <input v-model="store.settings.imageHost.config[f.key]" type="checkbox" :aria-label="f.label" />
              <span>{{ f.label }}</span>
            </label>
            <template v-else-if="f.type === 'select'">
              <div class="s-hint">{{ f.label }}</div>
              <select
                class="s-select-input"
                :aria-label="f.label"
                :value="store.settings.imageHost.config[f.key] ?? f.options[0].value"
                @change="store.settings.imageHost.config[f.key] = $event.target.value"
              >
                <option v-for="o in f.options" :key="o.value" :value="o.value">{{ o.name }}</option>
              </select>
            </template>
            <template v-else>
              <div class="s-hint">{{ f.label }}</div>
              <input
                v-model="store.settings.imageHost.config[f.key]"
                class="s-select-input"
                :type="f.secret ? 'password' : 'text'"
                :placeholder="f.placeholder"
                :aria-label="f.label"
              />
            </template>
          </div>
          <div class="s-label">
            粘贴时自动上传
            <span class="qhint">
              <button class="qhint-btn" type="button" aria-label="自动上传说明" :aria-expanded="hintFor === 'always'" @click.stop="toggleHint('always', $event)">?</button>
            </span>
          </div>
          <div class="s-seg">
            <button type="button" :class="{ active: alwaysMode === 'off' }" @click="setAlways('off')">关闭</button>
            <button type="button" :class="{ active: alwaysMode === 'image' }" @click="setAlways('image')">仅图片</button>
            <button type="button" :class="{ active: alwaysMode === 'video' }" @click="setAlways('video')">仅视频</button>
            <button type="button" :class="{ active: alwaysMode === 'both' }" @click="setAlways('both')">图片+视频</button>
          </div>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="hintFor" class="qhint-pop" role="tooltip" :style="hintPopPos" @click.stop>
        {{ hintText }}
      </div>
    </Teleport>
  </aside>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import { store, theme, activeAccent, activeSlotColors, usedImageIds, notify } from '../lib/store.js'
import { fontOptions, buildStyles } from '../lib/themes.js'
import { listImages, pruneImages } from '../lib/imagedb.js'
import { IMAGE_HOSTS } from '../lib/imagehost.js'

const customOpen = ref(false)

// ---- ⓘ 气泡说明 ----
const hintFor = ref(null)
const hintPopPos = ref({ left: '0px', top: '0px', width: '280px' })
const HINTS = {
  storage:
    '媒体只存在本浏览器，不再被引用的文件会自动清理（回收站引用保留）。复制时媒体按总字节 ×1.3 转文本带走：图片建议 ≤2MB、视频 ≤100MB，总大小过大可能复制卡顿或粘贴失败，建议先压缩。',
  host: '凭据只保存在本浏览器的 localStorage（明文）。上传后媒体引用会替换为公网链接，不再受复制体积限制，适合大图与大视频。请勿在公用电脑上配置 Token。',
  always:
    '开启后粘贴即上传并插入公网链接，失败回落本地。已有本地媒体可在预览工具条点「上传到图床」一键替换。',
}
const hintText = computed(() => HINTS[hintFor.value] || '')

function toggleHint(key, event) {
  if (hintFor.value === key) {
    hintFor.value = null
    return
  }
  // 浮窗传送到 body 固定定位：以问号为中心，钳制在视口内；下方空间不足时向上展开
  const rect = event.currentTarget.getBoundingClientRect()
  const width = 280
  const left = Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12))
  const estimatedH = 130
  const openBelow = rect.bottom + 8 + estimatedH <= window.innerHeight
  hintPopPos.value = {
    left: `${left}px`,
    top: openBelow ? `${rect.bottom + 8}px` : `${rect.top - 8}px`,
    width: `${width}px`,
    transform: openBelow ? 'none' : 'translateY(-100%)',
  }
  hintFor.value = key
}
function closeHintOnOutside(event) {
  if (!hintFor.value) return
  if (event.target instanceof Element && event.target.closest('.qhint, .qhint-pop')) return
  hintFor.value = null
}
onMounted(() => document.addEventListener('pointerdown', closeHintOnOutside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeHintOnOutside, true))

// ---- 图床 ----
const activeHost = computed(() => IMAGE_HOSTS.find((h) => h.id === store.settings.imageHost.provider) || null)
// 字段按依赖条件过滤：dependsOn 指定了依赖字段时，仅当依赖值匹配才显示
const visibleHostFields = computed(() =>
  (activeHost.value?.fields || []).filter(
    (f) => !f.dependsOn || store.settings.imageHost.config[f.dependsOn] === (f.dependsValue ?? true)
  )
)
const alwaysMode = computed(() => store.settings.imageHost.always)
function setAlways(value) {
  store.settings.imageHost.always = value
}

// ---- 图片存储统计与清理 ----
const imageStatsText = ref('统计中…')
const cleaningImages = ref(false)

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

async function refreshImageStats() {
  try {
    const items = await listImages()
    const total = items.reduce((sum, item) => sum + item.size, 0)
    imageStatsText.value = items.length ? `${items.length} 个文件 · ${formatSize(total)}` : '暂无文件'
  } catch {
    imageStatsText.value = '无法读取'
  }
}

async function cleanImages() {
  cleaningImages.value = true
  try {
    const { removed, freed } = await pruneImages(usedImageIds())
    notify(removed ? `已清理 ${removed} 个未使用文件，释放 ${formatSize(freed)}` : '没有可清理的文件')
    await refreshImageStats()
  } catch {
    notify('清理失败，请重试')
  } finally {
    cleaningImages.value = false
  }
}

watch(
  () => store.ui.settingsPanelOpen,
  (open) => {
    if (open) refreshImageStats()
  },
  { immediate: true }
)

const galleryModes = [
  { id: 'collage', name: '拼贴', hint: '主图更大，适合有视觉重点的组图' },
  { id: 'grid', name: '网格', hint: '所有图片统一尺寸裁切，整齐划一' },
  { id: 'stack', name: '单列', hint: '图片按原始比例纵向排列' },
]
const galleryMode = computed(() => store.settings.galleryMode || 'collage')
const activeGalleryMode = computed(
  () => galleryModes.find((mode) => mode.id === galleryMode.value) || galleryModes[0]
)

const ratioOptions = [
  { value: '1:1', name: '1:1', hint: '正方形网格（推荐，公众号已实测支持）' },
  { value: '4:5', name: '4:5', hint: '竖版社交卡片比例' },
  { value: '3:4', name: '3:4', hint: '竖版经典比例' },
]
const galleryRatio = computed(() => store.settings.galleryRatio || '1:1')

const editableElements = [
  { key: 'container', name: '正文容器' },
  { key: 'h1', name: '一级标题' },
  { key: 'h2', name: '二级标题' },
  { key: 'h3', name: '三级标题' },
  { key: 'p', name: '段落' },
  { key: 'blockquote', name: '引用块' },
  { key: 'strong', name: '加粗' },
  { key: 'a', name: '链接' },
  { key: 'code', name: '行内代码' },
  { key: 'mathInline', name: '行内公式' },
  { key: 'mathBlock', name: '块级公式' },
  { key: 'img', name: '图片' },
]

const baseStyles = computed(() =>
  buildStyles(theme.value, { ...store.settings, accent: activeAccent.value, slotColors: activeSlotColors.value, custom: undefined })
)

function stepFontSize(delta) {
  const next = (store.settings.fontSize || 16) + delta
  store.settings.fontSize = Math.min(18, Math.max(14, next))
}

function effectiveStyle(key) {
  return (store.settings.custom || {})[theme.value.id]?.[key] ?? baseStyles.value[key] ?? ''
}

function setCustom(key, value) {
  const all = { ...(store.settings.custom || {}) }
  all[theme.value.id] = { ...(all[theme.value.id] || {}), [key]: value }
  store.settings.custom = all
}

function resetCustom() {
  const all = { ...(store.settings.custom || {}) }
  delete all[theme.value.id]
  store.settings.custom = all
}
</script>
