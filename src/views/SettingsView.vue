<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '@/api/client'
import LiquidSelect from '@/components/LiquidSelect.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useClientMode } from '@/composables/useClientMode'

const { t, locale } = useI18n()
const route = useRoute()
const { isDesktopClient, isMobileClient } = useClientMode()

type FieldType = 'text' | 'password' | 'number' | 'select' | 'toggle'

interface SettingField {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  readonly?: boolean
  options?: Array<{ label: string; value: string }>
}

interface SettingSection {
  key: string
  icon: string
  fields: SettingField[]
}

interface SettingsResponse {
  values: Record<string, string | null>
  runtime?: Record<string, unknown> | null
}

interface AiProvider {
  id: string
  providerType: string
  displayName: string
  baseUrl: string
  model: string
  modelVersion: string
  enabled: boolean
  hasApiKey: boolean
  lastVerifiedAt?: string
}

interface LogRecord {
  id: number
  level: string
  module: string
  message: string
  createdAt: string
}

const modelCatalog = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3', 'gpt-5.2', 'gpt-4o', 'gpt-4o-mini'],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  },
  zhipu: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.1', 'glm-4.7', 'glm-4-plus', 'glm-4-air', 'glm-4-flash'],
  },
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  },
  qwen: {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3-coder-plus', 'qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-vl-plus'],
  },
  moonshot: {
    label: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.5', 'kimi-latest', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  siliconflow: {
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3.2', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen3-Coder-30B-A3B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  custom: {
    label: '自定义 OpenAI 兼容',
    baseUrl: '',
    models: ['custom'],
  },
} as const

const providerTypes = Object.entries(modelCatalog).map(([value, item]) => ({ value, label: item.label }))
const providerModelOptions = computed(() => modelCatalog[providerForm.providerType as keyof typeof modelCatalog]?.models ?? ['custom'])
const providerModelSelectOptions = computed(() => providerModelOptions.value.map((model) => ({ label: model, value: model })))

const sections: SettingSection[] = [
  {
    key: 'general',
    icon: 'icon-[solar--tuning-2-bold-duotone]',
    fields: [
      { key: 'ui.language', label: '界面语言', type: 'select', options: [{ label: '简体中文', value: 'zh' }, { label: 'English', value: 'en' }] },
      { key: 'ui.theme', label: '主题', type: 'select', options: [{ label: '跟随系统', value: 'system' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }] },
      { key: 'startup.openBrowser', label: '启动后自动打开管理页面', type: 'toggle' },
    ],
  },
  {
    key: 'network',
    icon: 'icon-[solar--global-bold-duotone]',
    fields: [
      { key: 'network.adminPort', label: '前端访问端口', type: 'number', readonly: true },
      { key: 'network.apkWsPort', label: 'APK 专用端口', type: 'number', readonly: true },
      { key: 'network.publicAccess', label: '允许公网访问前端端口', type: 'toggle' },
      { key: 'network.externalHost', label: '外部访问域名', type: 'text', placeholder: 'example.com' },
      { key: 'network.frontendHttps', label: '前端 HTTPS', type: 'toggle' },
      { key: 'network.certificatePath', label: '证书路径', type: 'text', placeholder: 'C:\\certs\\fullchain.pem' },
      { key: 'network.privateKeyPath', label: '私钥路径', type: 'text', placeholder: 'C:\\certs\\privkey.pem' },
    ],
  },
  {
    key: 'security',
    icon: 'icon-[solar--shield-keyhole-bold-duotone]',
    fields: [
      { key: 'security.sessionDays', label: '登录保持天数', type: 'number', placeholder: '30' },
      { key: 'security.adminPassword', label: '管理员密码', type: 'password' },
    ],
  },
  {
    key: 'devices',
    icon: 'icon-[solar--devices-bold-duotone]',
    fields: [
      { key: 'devices.autoInstallApk', label: '授权后自动安装 APK', type: 'toggle' },
      { key: 'devices.autoLaunchApk', label: '安装后自动唤起 APK', type: 'toggle' },
      { key: 'devices.wirelessPairTimeout', label: '无线配对超时秒数', type: 'number', placeholder: '15' },
      { key: 'devices.keepAlive', label: 'ADB 空命令保活', type: 'toggle' },
    ],
  },
  {
    key: 'media',
    icon: 'icon-[solar--video-frame-play-horizontal-bold-duotone]',
    fields: [
      { key: 'media.defaultCodec', label: '默认编码', type: 'select', options: [{ label: 'H.264', value: 'h264' }, { label: 'H.265', value: 'h265' }] },
      { key: 'media.defaultBitrate', label: '默认码率 Kbps', type: 'number', placeholder: '6000' },
      { key: 'media.lowResStream', label: '启用低分辨率截图流', type: 'toggle' },
      { key: 'media.previewStreamEnabled', label: '总览页面设备预览', type: 'toggle' },
      { key: 'media.previewRefreshSeconds', label: '预览刷新秒数', type: 'number', placeholder: '8' },
      { key: 'media.previewMaxWidth', label: '预览最大宽度', type: 'number', placeholder: '360' },
    ],
  },
  {
    key: 'automation',
    icon: 'icon-[solar--programming-bold-duotone]',
    fields: [
      { key: 'automation.maxParallelTasks', label: '最大并发任务数', type: 'number', placeholder: '4' },
      { key: 'automation.skipOnError', label: '错误时跳过并记录', type: 'toggle' },
      { key: 'automation.persistOfflineTasks', label: '启用 APK 离线任务缓存', type: 'toggle' },
    ],
  },
  { key: 'agent', icon: 'icon-[solar--magic-stick-3-bold-duotone]', fields: [] },
  {
    key: 'advanced',
    icon: 'icon-[solar--settings-minimalistic-bold-duotone]',
    fields: [
      { key: 'advanced.dataDirectory', label: '数据目录', type: 'text', placeholder: '留空使用默认路径' },
      { key: 'advanced.logRetentionDays', label: '日志保留天数', type: 'number', placeholder: '30' },
      { key: 'advanced.debugLogging', label: '调试日志', type: 'toggle' },
      { key: 'advanced.exportConfig', label: '配置导入导出入口', type: 'text', readonly: true, placeholder: '后续版本启用' },
    ],
  },
  { key: 'help', icon: 'icon-[solar--question-circle-bold-duotone]', fields: [] },
]

const defaultValues: Record<string, string> = Object.fromEntries(
  sections.flatMap((section) =>
    section.fields.map((field) => {
      if (field.key === 'ui.language') return [field.key, 'zh']
      if (field.key === 'ui.theme') return [field.key, 'system']
      if (field.key === 'startup.openBrowser') return [field.key, 'true']
      if (field.key === 'devices.autoInstallApk') return [field.key, 'true']
      if (field.key === 'devices.autoLaunchApk') return [field.key, 'true']
      if (field.key === 'devices.keepAlive') return [field.key, 'true']
      if (field.key === 'devices.wirelessPairTimeout') return [field.key, '15']
      if (field.key === 'media.previewRefreshSeconds') return [field.key, '8']
      if (field.key === 'media.previewMaxWidth') return [field.key, '360']
      if (field.type === 'select') return [field.key, field.options?.[0]?.value ?? '']
      if (field.type === 'toggle') return [field.key, 'false']
      return [field.key, '']
    }),
  ),
)

const selectedKey = ref(sections[0].key)
const selected = computed(() => sections.find((section) => section.key === selectedKey.value) ?? sections[0])
const mobileDetailOpen = ref(false)
const values = reactive<Record<string, string>>({})
const runtime = ref<Record<string, unknown>>({})
const saving = ref(false)
const savedAt = ref('')
const initialSnapshot = ref('')
const providerSaving = ref(false)
const providerMessage = ref('')
const providers = ref<AiProvider[]>([])
const logs = ref<LogRecord[]>([])
const editingProviderId = ref('')
const providerForm = reactive<{
  providerType: string
  displayName: string
  baseUrl: string
  model: string
  modelVersion: string
  apiKey: string
}>({
  providerType: 'openai',
  displayName: '',
  baseUrl: modelCatalog.openai.baseUrl,
  model: modelCatalog.openai.models[0],
  modelVersion: '',
  apiKey: '',
})

const runtimeRows = computed(() => [
  ['软件版本', String(runtime.value.appVersion ?? 'v1.0.1')],
  ['管理端口', String(runtime.value.adminPort ?? '6333')],
  ['APK 端口', String(runtime.value.apkWsPort ?? '6334')],
  ['ADB 私有端口', String(runtime.value.privateAdbPort ?? '5038')],
  ['.NET', String(runtime.value.dotnetVersion ?? '-')],
  ['系统', String(runtime.value.os ?? '-')],
  ['数据目录', String(runtime.value.dataRoot ?? '-')],
])
const settingsSnapshot = computed(() => JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))))
const hasChanges = computed(() => initialSnapshot.value !== '' && settingsSnapshot.value !== initialSnapshot.value)

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('wad:notify', { detail: { message, type } }))
}

function fieldValue(key: string) {
  return values[key] ?? defaultValues[key] ?? ''
}

function setFieldValue(key: string, value: string | boolean) {
  values[key] = typeof value === 'boolean' ? String(value) : value
}

function selectSection(key: string) {
  selectedKey.value = key
  if (isMobileClient.value) {
    mobileDetailOpen.value = true
  }
}

function applyAppearance() {
  const language = fieldValue('ui.language') || 'zh'
  const theme = fieldValue('ui.theme') || 'system'
  locale.value = language
  localStorage.setItem('wad_locale', language)
  localStorage.setItem('wad_theme', theme)

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark))
}

async function loadSettings() {
  const response = await api<SettingsResponse>('/api/settings')
  Object.entries(defaultValues).forEach(([key, value]) => {
    values[key] = value
  })
  Object.entries(response.values ?? {}).forEach(([key, value]) => {
    values[key] = value ?? defaultValues[key] ?? ''
  })
  runtime.value = response.runtime ?? {}
  values['network.adminPort'] = String(runtime.value.adminPort ?? values['network.adminPort'] ?? '6333')
  values['network.apkWsPort'] = String(runtime.value.apkWsPort ?? values['network.apkWsPort'] ?? '6334')
  applyAppearance()
  initialSnapshot.value = settingsSnapshot.value
}

async function loadProviders() {
  providers.value = await api<AiProvider[]>('/api/agent/providers')
}

async function loadLogs() {
  logs.value = await api<LogRecord[]>('/api/system/logs')
}

function useProviderTemplate() {
  if (editingProviderId.value) return
  const selectedType = modelCatalog[providerForm.providerType as keyof typeof modelCatalog]
  if (!selectedType) return
  providerForm.baseUrl = selectedType.baseUrl
  providerForm.model = selectedType.models[0]
  providerForm.displayName = selectedType.label
}

function resetProviderForm() {
  editingProviderId.value = ''
  providerForm.providerType = 'openai'
  providerForm.displayName = ''
  providerForm.baseUrl = modelCatalog.openai.baseUrl
  providerForm.model = modelCatalog.openai.models[0]
  providerForm.modelVersion = ''
  providerForm.apiKey = ''
}

function editProvider(provider: AiProvider) {
  editingProviderId.value = provider.id
  providerForm.providerType = provider.providerType
  providerForm.displayName = provider.displayName
  providerForm.baseUrl = provider.baseUrl
  providerForm.model = provider.model
  providerForm.modelVersion = provider.modelVersion || ''
  providerForm.apiKey = ''
  providerMessage.value = '正在修改已有模型；API 密钥留空表示沿用已保存密钥。'
}

async function saveProvider() {
  providerSaving.value = true
  providerMessage.value = ''
  try {
    const isEditing = Boolean(editingProviderId.value)
    await api<AiProvider>(isEditing ? `/api/agent/providers/${editingProviderId.value}` : '/api/agent/providers', {
      method: isEditing ? 'PUT' : 'POST',
      body: JSON.stringify(providerForm),
    })
    providerMessage.value = isEditing ? '模型验证通过，修改已保存。' : '模型验证通过，已添加到 Agent 可用模型。'
    resetProviderForm()
    await loadProviders()
    await loadSettings()
    window.dispatchEvent(new CustomEvent('wad:agent-providers-changed'))
    notify(isEditing ? 'AI 模型已修改并验证通过。' : 'AI 模型已添加并验证通过。', 'success')
  } catch (error) {
    providerMessage.value = error instanceof ApiError ? error.message : '模型保存失败，请检查配置。'
    notify(providerMessage.value, 'error')
  } finally {
    providerSaving.value = false
  }
}

async function deleteProvider(providerId: string) {
  await api(`/api/agent/providers/${providerId}`, { method: 'DELETE' })
  await loadProviders()
  window.dispatchEvent(new CustomEvent('wad:agent-providers-changed'))
  notify('AI 模型已删除。', 'success')
}

async function saveSettings() {
  saving.value = true
  try {
    const payload = Object.fromEntries(Object.entries(values).filter(([key]) => !key.startsWith('network.adminPort') && !key.startsWith('network.apkWsPort')))
    const response = await api<SettingsResponse>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ values: payload }),
    })
    Object.entries(response.values ?? {}).forEach(([key, value]) => {
      values[key] = value ?? defaultValues[key] ?? ''
    })
    applyAppearance()
    initialSnapshot.value = settingsSnapshot.value
    savedAt.value = new Date().toLocaleTimeString()
    notify('设置已保存。', 'success')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadProviders(), loadLogs()])
  const section = String(route.query.section ?? '')
  if (sections.some((item) => item.key === section)) {
    selectSection(section)
  }
})
watch(() => route.query.section, (section) => {
  const key = String(section ?? '')
  if (sections.some((item) => item.key === key)) {
    selectSection(key)
  }
})
watch(() => providerForm.providerType, useProviderTemplate)
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden text-slate-950 dark:text-slate-100">
    <PageHeader>
      <h1 class="text-xl font-semibold">设置</h1>
      <template #actions>
        <button class="glass-button" :class="hasChanges ? 'glass-button-primary ring-2 ring-sky-200' : ''" :disabled="saving || !hasChanges" @click="saveSettings">
          <span class="icon-[solar--diskette-bold-duotone] size-5" />
          <span>{{ saving ? '保存中' : hasChanges ? '保存更改' : '已保存' }}</span>
        </button>
      </template>
    </PageHeader>

    <!-- Scrollable content -->
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">

    <div class="grid items-start gap-4" :class="isDesktopClient ? 'grid-cols-[240px_1fr]' : ''">
      <nav
        class="glass-panel gap-2 p-2"
        :class="[
          isDesktopClient ? 'block min-h-[552px] space-y-1' : 'grid',
          isMobileClient && mobileDetailOpen ? 'hidden' : ''
        ]"
      >
        <button
          v-for="section in sections"
          :key="section.key"
          class="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-all duration-300 hover:bg-slate-100/85 hover:text-sky-700 hover:shadow-sm dark:hover:bg-white/10 dark:hover:text-sky-200"
          :class="[
            'text-slate-600 dark:text-slate-300',
            selectedKey === section.key && isDesktopClient ? 'bg-white/65 text-sky-700 shadow-sm ring-1 ring-white/70 dark:bg-white/15 dark:text-sky-200' : ''
          ]"
          @click="selectSection(section.key)"
        >
          <span :class="[section.icon, 'size-5']" />
          <span class="flex-1">{{ t(`settings.${section.key}`) }}</span>
          <span v-if="isMobileClient" class="icon-[solar--alt-arrow-right-outline] size-4 text-slate-400" />
        </button>
      </nav>

      <div class="glass-panel overflow-hidden" :class="isDesktopClient || mobileDetailOpen ? 'block' : 'hidden'">
        <div v-if="isMobileClient" class="flex items-center gap-2 border-b border-white/40 px-4 py-3 dark:border-white/10">
          <button class="inline-grid size-9 place-items-center rounded-lg text-slate-500 transition-all duration-300 hover:bg-slate-100 hover:text-sky-700 dark:hover:bg-slate-800 dark:hover:text-sky-200" @click="mobileDetailOpen = false">
            <span class="icon-[solar--alt-arrow-left-outline] size-5" />
          </button>
          <span class="text-sm font-semibold">{{ t(`settings.${selected.key}`) }}</span>
        </div>
          <div v-if="isDesktopClient" class="border-b border-white/40 px-5 py-4 dark:border-white/10">
          <div class="flex items-center gap-3">
            <span :class="[selected.icon, 'size-6 text-sky-500']" />
            <h2 class="text-base font-semibold">{{ t(`settings.${selected.key}`) }}</h2>
          </div>
        </div>

        <div v-if="selected.key === 'help'" class="grid gap-5 p-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <RouterLink to="/logs" class="glass-panel flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span class="icon-[solar--document-text-bold-duotone] size-10 text-sky-500" />
              <div>
                <h3 class="font-semibold">运行日志</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">查看系统运行日志，排查问题</p>
              </div>
            </RouterLink>
            <RouterLink to="/help" class="glass-panel flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span class="icon-[solar--question-circle-bold-duotone] size-10 text-sky-500" />
              <div>
                <h3 class="font-semibold">连接帮助</h3>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">设备连接、APK安装、权限配置指南</p>
              </div>
            </RouterLink>
          </div>
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-slate-700/40 dark:bg-slate-800/40 dark:text-slate-400">
            日志和帮助已从导航栏移至设置页。如需快速访问可收藏对应页面。
          </div>
        </div>

        <div v-else-if="selected.key === 'agent'" class="grid gap-5 p-5">
          <div class="grid gap-3 md:grid-cols-2">
            <label class="grid gap-2 text-sm">
              <span class="font-medium text-slate-700 dark:text-slate-200">模型类型</span>
              <LiquidSelect v-model="providerForm.providerType" :options="providerTypes" />
            </label>
            <label class="grid gap-2 text-sm">
              <span class="font-medium text-slate-700 dark:text-slate-200">显示名称</span>
              <input v-model="providerForm.displayName" class="glass-input" placeholder="例如：设备控制主模型" />
            </label>
            <label class="grid gap-2 text-sm">
              <span class="font-medium text-slate-700 dark:text-slate-200">模型版本</span>
              <LiquidSelect v-model="providerForm.model" :options="providerModelSelectOptions" />
            </label>
            <label class="grid gap-2 text-sm">
              <span class="font-medium text-slate-700 dark:text-slate-200">版本备注</span>
              <input v-model="providerForm.modelVersion" class="glass-input" placeholder="可选，例如 fast / pro / 32k" />
            </label>
            <label class="grid gap-2 text-sm md:col-span-2">
              <span class="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">API 地址 <span class="rounded-full border border-sky-200 bg-sky-50/80 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">OpenAI API 格式</span></span>
              <input v-model="providerForm.baseUrl" class="glass-input" placeholder="https://api.example.com/v1" />
            </label>
            <label class="grid gap-2 text-sm md:col-span-2">
              <span class="font-medium text-slate-700 dark:text-slate-200">API 密钥</span>
              <input v-model="providerForm.apiKey" type="password" class="glass-input" :placeholder="editingProviderId ? '留空则沿用已保存密钥' : '添加时后端会立即验证'" />
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <button class="glass-button glass-button-primary" :disabled="providerSaving" @click="saveProvider">
              <span :class="[editingProviderId ? 'icon-[solar--diskette-bold-duotone]' : 'icon-[solar--add-circle-bold-duotone]', 'size-5']" />
              <span>{{ providerSaving ? '验证中' : editingProviderId ? '保存模型' : '添加模型' }}</span>
            </button>
            <button v-if="editingProviderId" class="glass-button" :disabled="providerSaving" @click="resetProviderForm">取消修改</button>
            <span v-if="providerMessage" class="text-sm" :class="providerMessage.includes('失败') || providerMessage.includes('无法') || providerMessage.includes('无效') ? 'text-rose-600' : 'text-emerald-600'">
              {{ providerMessage }}
            </span>
          </div>

          <div class="overflow-hidden rounded-2xl border border-white/45 bg-white/35 dark:border-white/10 dark:bg-white/5">
            <table class="w-full text-left text-sm">
              <thead class="bg-white/50 text-slate-500 dark:bg-white/5">
                <tr>
                  <th class="px-4 py-3">名称</th>
                  <th class="px-4 py-3">模型</th>
                  <th class="px-4 py-3">API 地址</th>
                  <th class="px-4 py-3">状态</th>
                  <th class="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="providers.length === 0" class="border-t border-white/35 dark:border-white/10">
                  <td colspan="5" class="px-4 py-8 text-center text-slate-500">还没有添加可用模型。</td>
                </tr>
                <tr v-for="provider in providers" :key="provider.id" class="border-t border-white/35 dark:border-white/10">
                  <td class="px-4 py-3">
                    <div class="font-medium">{{ provider.displayName }}</div>
                    <div class="text-xs text-slate-500">{{ provider.providerType }}</div>
                  </td>
                  <td class="px-4 py-3">{{ provider.model }}{{ provider.modelVersion ? ` · ${provider.modelVersion}` : '' }}</td>
                  <td class="max-w-[280px] truncate px-4 py-3 text-slate-500">{{ provider.baseUrl }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">已验证</span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button class="rounded-xl p-2 text-sky-600 hover:bg-sky-50/80 dark:hover:bg-sky-950" title="编辑模型" @click="editProvider(provider)">
                      <span class="icon-[solar--pen-new-square-outline] size-5" />
                    </button>
                    <button class="rounded-xl p-2 text-rose-600 hover:bg-rose-50/80 dark:hover:bg-rose-950" title="删除模型" @click="deleteProvider(provider.id)">
                      <span class="icon-[solar--trash-bin-trash-outline] size-5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else class="divide-y divide-white/35 dark:divide-white/10">
          <div v-if="selected.key === 'general'" class="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
            <div v-for="[label, value] in runtimeRows" :key="label" class="rounded-2xl border border-white/45 bg-white/35 p-3 text-sm dark:border-white/10 dark:bg-white/5">
              <div class="text-xs text-slate-500">{{ label }}</div>
              <div class="mt-1 break-all font-medium">{{ value }}</div>
            </div>
          </div>

          <label v-for="field in selected.fields" :key="field.key" class="grid gap-3 px-5 py-4 sm:grid-cols-[220px_1fr] sm:items-center">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ field.label }}</span>

            <LiquidSelect v-if="field.type === 'select'" :model-value="fieldValue(field.key)" :options="field.options ?? []" :disabled="field.readonly" @update:model-value="setFieldValue(field.key, $event)" />

            <button v-else-if="field.type === 'toggle'" type="button" class="flex h-8 w-14 items-center rounded-full p-1 transition-all duration-300" :class="fieldValue(field.key) === 'true' ? 'bg-sky-500/80 shadow-inner' : 'bg-white/45 ring-1 ring-white/60 dark:bg-white/10 dark:ring-white/10'" :disabled="field.readonly" @click="setFieldValue(field.key, fieldValue(field.key) !== 'true')">
              <span class="size-6 rounded-full bg-white shadow transition-all duration-300" :class="fieldValue(field.key) === 'true' ? 'translate-x-6' : ''" />
            </button>

            <input v-else class="glass-input" :type="field.type" :value="fieldValue(field.key)" :placeholder="field.placeholder" :readonly="field.readonly" @input="setFieldValue(field.key, ($event.target as HTMLInputElement).value)" />
          </label>
        </div>
      </div>
    </div>

    <p v-if="savedAt" class="mt-3 text-sm text-slate-500">已保存 {{ savedAt }}</p>
    </div><!-- end scrollable content -->
  </section>
</template>
