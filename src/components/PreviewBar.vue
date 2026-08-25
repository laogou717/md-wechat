<template>
  <div class="pbar">
    <div class="seg view-seg" role="group" aria-label="工作区视图">
      <button
        v-for="v in views"
        :key="v.id"
        type="button"
        :class="{ active: viewMode === v.id }"
        :aria-pressed="viewMode === v.id"
        @click="$emit('change-view', v.id)"
      >
        {{ v.name }}
      </button>
    </div>

    <span class="bar-div" aria-hidden="true"></span>

    <div class="seg pdev" role="group" aria-label="预览设备">
      <button
        v-for="m in deviceModes"
        :key="m.value"
        type="button"
        :class="{ active: store.settings.previewWidth === m.value }"
        :aria-pressed="store.settings.previewWidth === m.value"
        :title="m.title"
        @click="$emit('change-device', m.value)"
      >
        <Icon :name="m.icon" :size="14" aria-hidden="true" />
      </button>
    </div>

    <div class="seg color-mode-seg" role="group" aria-label="阅读环境">
      <button
        v-for="mode in colorModes"
        :key="mode.value"
        type="button"
        :class="{ active: store.settings.previewColorMode === mode.value }"
        :aria-pressed="store.settings.previewColorMode === mode.value"
        :title="mode.title"
        @click="store.settings.previewColorMode = mode.value"
      >
        <Icon :name="mode.icon" :size="14" aria-hidden="true" />
      </button>
    </div>

    <div class="spacer"></div>

    <div class="copy-split pmenu-wrap">
      <button
        class="pcopy copy-main"
        type="button"
        :title="`${currentCopyLabel}（⌘⇧C）`"
        @click="actCopy(store.settings.previewColorMode)"
      >
        <Icon name="copy" :size="14" aria-hidden="true" /> {{ currentCopyLabel }}
      </button>
      <button
        class="copy-more"
        type="button"
        aria-label="选择复制版本"
        :aria-expanded="copyOpen"
        @click="copyOpen = !copyOpen"
      >
        <Icon name="chevron-down" :size="13" aria-hidden="true" />
      </button>
      <div v-if="copyOpen" class="pmenu-backdrop" @click="copyOpen = false"></div>
      <Transition name="pop">
        <div v-if="copyOpen" class="pmenu copy-menu">
          <button class="menu-item" type="button" @click="actCopy('light')">
            <span class="menu-icon"><Icon name="sun" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>复制白天版</strong><small>浅色阅读环境与原始模板配色</small></span>
          </button>
          <button class="menu-item" type="button" @click="actCopy('dark')">
            <span class="menu-icon"><Icon name="moon" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>复制夜间版</strong><small>深色背景、文字及组件配色</small></span>
          </button>
        </div>
      </Transition>
    </div>

    <div v-if="hostReady" class="pmenu-wrap">
      <button class="pio" type="button" :class="{ open: upOpen }" @click="upOpen = !upOpen">
        <Icon name="upload" :size="14" aria-hidden="true" /> 上传到图床
      </button>
      <div v-if="upOpen" class="pmenu-backdrop" @click="upOpen = false"></div>
      <Transition name="pop">
        <div v-if="upOpen" class="pmenu">
          <button class="menu-item" type="button" :disabled="uploading" @click="uploadAll('image')">
            <span class="menu-icon"><Icon name="image" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>上传全部图片</strong><small>本文本地图片一键替换为公网链接</small></span>
          </button>
          <button class="menu-item" type="button" :disabled="uploading" @click="uploadAll('video')">
            <span class="menu-icon"><Icon name="file-code" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>上传全部视频</strong><small>本文本地视频一键替换为公网链接</small></span>
          </button>
        </div>
      </Transition>
    </div>

    <div class="pmenu-wrap">
      <button class="pio" type="button" :class="{ open: ioOpen }" @click="ioOpen = !ioOpen">
        <Icon name="upload" :size="14" aria-hidden="true" /> 导入 / 导出
      </button>
      <div v-if="ioOpen" class="pmenu-backdrop" @click="ioOpen = false"></div>
      <Transition name="pop">
        <div v-if="ioOpen" class="pmenu">
          <button class="menu-item" type="button" @click="actIo('import')">
            <span class="menu-icon"><Icon name="upload" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>导入 Markdown</strong><small>从本地 .md 文件新建文章</small></span>
          </button>
          <button class="menu-item" type="button" @click="actIo('export')">
            <span class="menu-icon"><Icon name="download" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>导出 Markdown</strong><small>当前文章保存为 .md 文件</small></span>
          </button>
        </div>
      </Transition>
    </div>

    <button
      class="icon-btn"
      :class="{ open: store.ui.settingsPanelOpen }"
      type="button"
      title="排版设置"
      aria-label="排版设置"
      aria-controls="settings-panel"
      :aria-expanded="store.ui.settingsPanelOpen"
      @click="store.ui.settingsPanelOpen = !store.ui.settingsPanelOpen"
    >
      <Icon name="sliders" :size="16" aria-hidden="true" />
    </button>

    <div class="pmenu-wrap">
      <button class="icon-btn" type="button" title="文档与更多" :class="{ open: menuOpen }" @click="menuOpen = !menuOpen">
        <Icon name="more" :size="16" aria-hidden="true" />
      </button>
      <div v-if="menuOpen" class="pmenu-backdrop" @click="menuOpen = false"></div>
      <Transition name="pop">
        <div v-if="menuOpen" class="pmenu">
          <div class="menu-heading">打开样章</div>
          <button
            v-for="item in sampleOptions"
            :key="item.id"
            class="menu-item"
            type="button"
            @click="act('load-sample', item.id)"
          >
            <span class="menu-icon"><Icon name="file-text" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.eyebrow }}</small>
            </span>
          </button>
          <div class="menu-div"></div>
          <button class="menu-item" type="button" @click="act('copy-source')">
            <span class="menu-icon"><Icon name="file-code" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>复制 HTML 源码</strong><small>用于高级粘贴与调试</small></span>
          </button>
          <button v-if="canRestore" class="menu-item" type="button" @click="act('restore')">
            <span class="menu-icon"><Icon name="refresh" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>恢复刚才的文档</strong><small>撤回最近一次整篇替换</small></span>
          </button>
          <button class="menu-item danger" type="button" @click="act('reset')">
            <span class="menu-icon"><Icon name="refresh" :size="15" aria-hidden="true" /></span>
            <span class="menu-item-copy"><strong>新建默认样章</strong><small>作为新文章打开，不影响当前内容</small></span>
          </button>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import { store, imageHostReady, uploadDocMedia, notify } from '../lib/store.js'
import { samples } from '../lib/sample.js'
import { startProgress, doneProgress } from '../lib/progress.js'

const props = defineProps({
  viewMode: { type: String, default: 'split' },
  canRestore: { type: Boolean, default: false },
})

const emit = defineEmits(['change-view', 'copy', 'copy-source', 'restore', 'reset', 'load-sample', 'change-device', 'import', 'export'])

const ioOpen = ref(false)
const copyOpen = ref(false)
const currentCopyLabel = computed(() =>
  store.settings.previewColorMode === 'dark' ? '复制夜间版' : '复制白天版'
)

function actCopy(mode) {
  copyOpen.value = false
  emit('copy', mode === 'dark' ? 'dark' : 'light')
}

function actIo(name) {
  ioOpen.value = false
  emit(name)
}

// ---- 上传到图床 ----
const hostReady = computed(() => imageHostReady())
const upOpen = ref(false)
const uploading = ref(false)

async function uploadAll(kind) {
  upOpen.value = false
  uploading.value = true
  startProgress()
  try {
    const label = kind === 'video' ? '视频' : '图片'
    const { done, failed, total } = await uploadDocMedia(store.activeDocId, kind)
    if (!total) notify(`本文没有本地${label}`)
    else if (failed) notify(`上传完成：${done} 成功，${failed} 失败`)
    else {
      const cdnNote = store.settings.imageHost?.provider === 'github' ? '（jsdelivr CDN 生效可能需几分钟）' : ''
      notify(`已上传 ${done} 个${label}，链接已替换为公网地址${cdnNote}`)
    }
  } finally {
    uploading.value = false
    doneProgress()
  }
}

const views = [
  { id: 'split', name: '对照' },
  { id: 'preview', name: '预览' },
]

const deviceModes = [
  { value: 'full', icon: 'maximize', title: '满屏（工作区宽度）' },
  { value: 'mobile', icon: 'smartphone', title: '手机（375px）' },
  { value: 'desktop', icon: 'monitor', title: '桌面（677px）' },
]

const colorModes = [
  { value: 'light', icon: 'sun', title: '白天阅读模式' },
  { value: 'dark', icon: 'moon', title: '夜间阅读模式' },
]

const menuOpen = ref(false)

const sampleOptions = computed(() =>
  (Array.isArray(samples) ? samples : []).slice(0, 3).map((item, index) => ({
    id: item.id || `sample-${index + 1}`,
    title: item.title || `示例文章 ${index + 1}`,
    eyebrow: item.eyebrow || item.description || '',
  }))
)

function act(name, arg) {
  menuOpen.value = false
  emit(name, arg)
}
</script>
