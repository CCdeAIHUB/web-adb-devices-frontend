<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '@/api/client'

const { t, locale } = useI18n()

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

const sections: SettingSection[] = [
  {
    key: 'general',
    icon: 'icon-[solar--tuning-2-outline]',
    fields: [
      { key: 'ui.language', label: '界面语言', type: 'select', options: [{ label: '简体中文', value: 'zh' }, { label: 'English', value: 'en' }] },
      { key: 'ui.theme', label: '主题', type: 'select', options: [{ label: '跟随系统', value: 'system' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }] },
      { key: 'startup.openBrowser', label: '启动后自动打开管理页面', type: 'toggle' },
    ],
  },
  {
    key: 'network',
    icon: 'icon-[solar--global-outline]',
    fields: [
      { key: 'network.adminPort', label: '前端访问端口', type: 'number', readonly: true },
      { key: 'network.apkWsPort', label: 'APK 专用端口', type: 'number', readonly: true },
      { key: 'network.publicAccess', label: '允许公网访问前端端口', type: 'toggle' },
      { key: 'network.externalHost', label: '外部访问域名', type: 'text', placeholder: 'example.com' },
    ],
  },
  {
    key: 'security',
    icon: 'icon-[solar--shield-keyhole-outline]',
    fields: [
      { key: 'security.sessionDays', label: '登录保持天数', type: 'number', placeholder: '30' },
      { key: 'security.frontendHttps', label: '前端 HTTPS', type: 'toggle' },
      { key: 'security.certificatePath', label: '证书路径', type: 'text', placeholder: 'C:\\certs\\fullchain.pem' },
      { key: 'security.privateKeyPath', label: '私钥路径', type: 'text', placeholder: 'C:\\certs\\privkey.pem' },
    ],
  },
  {
    key: 'resources',
    icon: 'icon-[solar--download-minimalistic-outline]',
    fields: [
      { key: 'resources.manifestUrl', label: '远程资源 JSON 地址', type: 'text', placeholder: 'https://...' },
      { key: 'resources.verifySignature', label: '校验资源签名', type: 'toggle' },
      { key: 'resources.autoDownloadAdb', label: '缺失时自动下载私有 ADB', type: 'toggle' },
      { key: 'resources.autoDownloadApk', label: '缺失时自动下载 APK', type: 'toggle' },
    ],
  },
  {
    key: 'devices',
    icon: 'icon-[solar--devices-outline]',
    fields: [
      { key: 'devices.autoInstallApk', label: '授权后自动安装 APK', type: 'toggle' },
      { key: 'devices.autoLaunchApk', label: '安装后自动唤起 APK', type: 'toggle' },
      { key: 'devices.wirelessPairTimeout', label: '无线配对超时秒数', type: 'number', placeholder: '15' },
      { key: 'devices.keepAlive', label: 'ADB 空命令保活', type: 'toggle' },
    ],
  },
  {
    key: 'media',
    icon: 'icon-[solar--video-frame-play-horizontal-outline]',
    fields: [
      { key: 'media.defaultCodec', label: '默认编码', type: 'select', options: [{ label: 'H.264', value: 'h264' }, { label: 'H.265', value: 'h265' }] },
      { key: 'media.defaultBitrate', label: '默认码率 Kbps', type: 'number', placeholder: '6000' },
      { key: 'media.lowResStream', label: '启用低分辨率截图流', type: 'toggle' },
    ],
  },
  {
    key: 'automation',
    icon: 'icon-[solar--programming-outline]',
    fields: [
      { key: 'automation.maxParallelTasks', label: '最大并发任务数', type: 'number', placeholder: '4' },
      { key: 'automation.skipOnError', label: '错误时跳过并记录', type: 'toggle' },
      { key: 'automation.persistOfflineTasks', label: '启用 APK 离线任务缓存', type: 'toggle' },
    ],
  },
  {
    key: 'agent',
    icon: 'icon-[solar--magic-stick-3-outline]',
    fields: [
      { key: 'agent.provider', label: '默认模型供应商', type: 'select', options: [{ label: 'ChatGPT', value: 'openai' }, { label: 'DeepSeek', value: 'deepseek' }, { label: '智谱 GLM', value: 'zhipu' }] },
      { key: 'agent.permissionMode', label: 'Agent 权限模式', type: 'select', options: [{ label: '默认', value: 'default' }, { label: '自动审批', value: 'autoApproval' }, { label: '完全权限', value: 'fullAccess' }] },
      { key: 'agent.trustedSteps', label: '自动执行步数', type: 'number', placeholder: '3' },
      { key: 'agent.apiKey', label: 'API Key', type: 'password' },
    ],
  },
  {
    key: 'advanced',
    icon: 'icon-[solar--settings-minimalistic-outline]',
    fields: [
      { key: 'advanced.logRetentionDays', label: '日志保留天数', type: 'number', placeholder: '30' },
      { key: 'advanced.debugLogging', label: '调试日志', type: 'toggle' },
      { key: 'advanced.exportConfig', label: '配置导入导出入口', type: 'text', readonly: true, placeholder: '后续版本启用' },
    ],
  },
]

const defaultValues: Record<string, string> = Object.fromEntries(
  sections.flatMap((section) =>
    section.fields.map((field) => {
      if (field.key === 'ui.language') return [field.key, 'zh']
      if (field.key === 'ui.theme') return [field.key, 'system']
      if (field.key === 'devices.autoInstallApk') return [field.key, 'true']
      if (field.key === 'devices.autoLaunchApk') return [field.key, 'true']
      if (field.key === 'devices.keepAlive') return [field.key, 'true']
      if (field.key === 'resources.autoDownloadAdb') return [field.key, 'true']
      if (field.key === 'resources.autoDownloadApk') return [field.key, 'true']
      if (field.key === 'resources.verifySignature') return [field.key, 'true']
      if (field.key === 'devices.wirelessPairTimeout') return [field.key, '15']
      if (field.type === 'select') return [field.key, field.options?.[0]?.value ?? '']
      if (field.type === 'toggle') return [field.key, 'false']
      return [field.key, '']
    }),
  ),
)

const selectedKey = ref(sections[0].key)
const selected = computed(() => sections.find((section) => section.key === selectedKey.value) ?? sections[0])
const values = reactive<Record<string, string>>({})
const runtime = ref<Record<string, unknown>>({})
const saving = ref(false)
const savedAt = ref('')

function fieldValue(key: string) {
  return values[key] ?? defaultValues[key] ?? ''
}

function setFieldValue(key: string, value: string | boolean) {
  values[key] = typeof value === 'boolean' ? String(value) : value
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
    savedAt.value = new Date().toLocaleTimeString()
  } finally {
    saving.value = false
  }
}

onMounted(loadSettings)
watch(() => [values['ui.language'], values['ui.theme']], applyAppearance)
</script>

<template>
  <section class="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">设置</h1>
      <button
        class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60"
        :disabled="saving"
        @click="saveSettings"
      >
        <span class="icon-[solar--diskette-outline] size-5" />
        <span>{{ saving ? '保存中' : '保存' }}</span>
      </button>
    </div>

    <div class="grid gap-4 lg:grid-cols-[240px_1fr]">
      <nav class="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 transition-all duration-300 dark:border-slate-800 dark:bg-slate-900 lg:block lg:space-y-1">
        <button
          v-for="section in sections"
          :key="section.key"
          class="flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-all duration-300 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-slate-800"
          :class="selectedKey === section.key ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'"
          @click="selectedKey = section.key"
        >
          <span :class="[section.icon, 'size-5']" />
          <span>{{ t(`settings.${section.key}`) }}</span>
        </button>
      </nav>

      <div class="rounded-lg border border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900">
        <div class="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <span :class="[selected.icon, 'size-6 text-sky-500']" />
            <h2 class="text-base font-semibold">{{ t(`settings.${selected.key}`) }}</h2>
          </div>
        </div>

        <div class="divide-y divide-slate-100 dark:divide-slate-800">
          <label
            v-for="field in selected.fields"
            :key="field.key"
            class="grid gap-3 px-5 py-4 sm:grid-cols-[220px_1fr] sm:items-center"
          >
            <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ field.label }}</span>

            <select
              v-if="field.type === 'select'"
              class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-950"
              :value="fieldValue(field.key)"
              :disabled="field.readonly"
              @change="setFieldValue(field.key, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>

            <button
              v-else-if="field.type === 'toggle'"
              type="button"
              class="flex h-8 w-14 items-center rounded-full p-1 transition-all duration-300"
              :class="fieldValue(field.key) === 'true' ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'"
              :disabled="field.readonly"
              @click="setFieldValue(field.key, fieldValue(field.key) !== 'true')"
            >
              <span
                class="size-6 rounded-full bg-white shadow transition-all duration-300"
                :class="fieldValue(field.key) === 'true' ? 'translate-x-6' : ''"
              />
            </button>

            <input
              v-else
              class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-950"
              :type="field.type"
              :value="fieldValue(field.key)"
              :placeholder="field.placeholder"
              :readonly="field.readonly"
              @input="setFieldValue(field.key, ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </div>
    </div>

    <p v-if="savedAt" class="mt-3 text-sm text-slate-500">已保存 {{ savedAt }}</p>
  </section>
</template>
