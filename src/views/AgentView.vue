<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ApiError, api } from '@/api/client'
import { useDeviceStore } from '@/stores/devices'
import LiquidSelect from '@/components/LiquidSelect.vue'

interface AiProvider {
  id: string
  providerType: string
  displayName: string
  model: string
  enabled: boolean
}

interface AgentRunResponse {
  runId: string
  status: string
  message: string
}

interface AttachmentItem {
  name: string
  type: string
  size: number
}

interface ChatMessage {
  role: 'user' | 'agent'
  text: string
}

interface Conversation {
  id: string
  title: string
  pinned?: boolean
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  selectedDevices: string[]
}

const storageKey = 'wad_agent_conversations'
const devices = useDeviceStore()
const providers = ref<AiProvider[]>([])
const conversations = ref<Conversation[]>([])
const activeConversationId = ref('')
const selectedProvider = ref('')
const selectedDevices = ref<string[]>([])
const permissionMode = ref<'Default' | 'AutoApproval' | 'FullAccess'>('Default')
const webSearchEnabled = ref(false)
const prompt = ref('')
const running = ref(false)
const deviceMenuOpen = ref(false)
const notice = ref('')
const attachments = ref<AttachmentItem[]>([])
const isMobileView = ref(false)
const showConversationPanel = ref(false)

function checkMobile() {
  isMobileView.value = typeof window !== 'undefined' ? window.innerWidth < 768 : false
}

const activeConversation = computed(() => conversations.value.find((item) => item.id === activeConversationId.value) ?? conversations.value[0])
const sortedConversations = computed(() => [...conversations.value].sort((a, b) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}))
const messages = computed(() => activeConversation.value?.messages ?? [])
const usableProviders = computed(() => providers.value.filter((provider) => provider.enabled && provider.model))
const providerOptions = computed(() => usableProviders.value.map((provider) => ({ label: `${provider.displayName} / ${provider.model}`, value: provider.id })))
const permissionOptions = [
  { label: '默认权限', value: 'Default' },
  { label: '自动审批低风险操作', value: 'AutoApproval' },
  { label: '完全权限', value: 'FullAccess' },
]
const selectedDeviceSummary = computed(() => selectedDevices.value.length === 0 ? '未选择设备' : `已选择 ${selectedDevices.value.length} 台设备`)

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('wad:notify', { detail: { message, type } }))
}

function createConversation() {
  const now = new Date().toISOString()
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: '新的对话',
    createdAt: now,
    updatedAt: now,
    selectedDevices: [],
    messages: [
      { role: 'agent', text: '选择模型后直接描述目标。需要操作设备时，先在输入框下方选择本次对话要使用的设备；我会基于完整的 ADB/APK 能力判断能做什么，普通对话不会自动创建任务。\n\n## 我的能力范围\n\n### 设备基础操作\n| 能力 | 说明 |\n|------|------|\n| **截屏** | 对设备截图获取当前界面 |\n| **点击** | 通过相对坐标(0~1)点击屏幕任意位置 |\n| **滑动** | 从某坐标滑动到另一坐标 |\n| **输入文字** | 通过配套输入法向设备输入文本 |\n| **按键模拟** | 发送返回、主页、任务、音量等系统按键 |\n\n### 应用管理\n| 能力 | 说明 |\n|------|------|\n| **安装APK** | 支持安装本地下载的APK或通过应用商店链接安装 |\n| **打开App** | 启动指定包名的应用 |\n| **获取App信息** | 查看应用的版本、权限、签名等信息 |\n| **卸载/清除数据** | 卸载应用或清除用户数据 |\n| **强制停止** | 终止正在运行的应用进程 |\n| **启用/禁用** | 禁用或启用已安装的应用 |\n| **提取APK** | 从设备提取已安装的APK文件 |\n| **列出所有软件** | 查看设备上安装的全部/用户/系统软件列表 |\n\n### 文件管理\n| 能力 | 说明 |\n|------|------|\n| **文件浏览** | 浏览设备文件系统(/sdcard等目录) |\n| **上传文件** | 向设备发送文件 |\n| **下载文件** | 从设备提取文件 |\n| **删除文件** | 删除/sdcard/下的文件 |\n\n### 系统控制\n| 能力 | 说明 |\n|------|------|\n| **ADB终端** | 执行任意ADB shell命令 |\n| **硬件信息** | 获取CPU、内存、电池、显示等硬件参数 |\n| **重启/关机** | 重启设备或关机 |\n| **Fastboot/Recovery** | 进入特殊启动模式 |\n| **系统设置快捷入口** | 直接打开WiFi、蓝牙、无障碍、开发者选项等设置页 |\n| **状态栏图标管理** | 隐藏/显示状态栏图标 |\n| **快捷设置布局** | 自定义下拉通知栏布局 |\n\n### APK伴侣能力(需安装配套APK)\n| 能力 | 说明 |\n|------|------|\n| **无障碍服务** | 读取屏幕内容、自动化UI交互 |\n| **输入法服务** | 稳定的中文/英文输入支持 |\n| **后台保活** | 保持连接不被系统杀掉 |\n| **通知权限** | 接收和发送状态通知 |\n\n### 多设备与群控\n| 能力 | 说明 |\n|------|------|\n| **群控广播** | 多台设备同步执行相同操作 |\n| **批量操作** | 对多台设备执行统一命令 |\n\n⚠️ 请告诉我你的具体需求，我会根据以上能力帮你完成。' },
    ],
  }
  conversations.value = [conversation, ...conversations.value]
  activeConversationId.value = conversation.id
  selectedDevices.value = []
  saveConversations()
}

function loadConversations() {
  const raw = localStorage.getItem(storageKey)
  conversations.value = raw ? JSON.parse(raw) : []
  if (conversations.value.length === 0) createConversation()
  activeConversationId.value = conversations.value[0]?.id ?? ''
  selectedDevices.value = conversations.value[0]?.selectedDevices ?? []
}

function saveConversations() {
  localStorage.setItem(storageKey, JSON.stringify(conversations.value.slice(0, 30)))
}

function switchConversation(id: string) {
  activeConversationId.value = id
  selectedDevices.value = activeConversation.value?.selectedDevices ?? []
}

function renameConversation(conversation: Conversation) {
  const nextTitle = window.prompt('重命名对话', conversation.title)?.trim()
  if (!nextTitle) return
  conversation.title = nextTitle.slice(0, 40)
  conversation.updatedAt = new Date().toISOString()
  saveConversations()
  notify('对话已重命名。', 'success')
}

function deleteConversation(id: string) {
  if (conversations.value.length <= 1) {
    notify('至少保留一个对话。', 'info')
    return
  }

  if (!window.confirm('删除这个对话？此操作不会删除设备或任务。')) return
  conversations.value = conversations.value.filter((item) => item.id !== id)
  if (activeConversationId.value === id) {
    activeConversationId.value = sortedConversations.value[0]?.id ?? conversations.value[0]?.id ?? ''
    selectedDevices.value = activeConversation.value?.selectedDevices ?? []
  }
  saveConversations()
  notify('对话已删除。', 'success')
}

function togglePin(conversation: Conversation) {
  conversation.pinned = !conversation.pinned
  conversation.updatedAt = new Date().toISOString()
  saveConversations()
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function exportConversationPdf(conversation: Conversation) {
  const popup = window.open('', '_blank', 'width=860,height=980')
  if (!popup) {
    notify('浏览器阻止了导出窗口，请允许弹窗后重试。', 'error')
    return
  }

  const body = conversation.messages.map((message) => `
    <section class="message ${message.role}">
      <strong>${message.role === 'user' ? '用户' : 'AI Agent'}</strong>
      <p>${escapeHtml(message.text).replaceAll('\n', '<br>')}</p>
    </section>
  `).join('')

  popup.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${escapeHtml(conversation.title)}</title>
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:36px;color:#0f172a}
      h1{font-size:22px;margin:0 0 6px}.meta{color:#64748b;font-size:12px;margin-bottom:24px}
      .message{break-inside:avoid;border:1px solid #e2e8f0;border-radius:16px;padding:14px 16px;margin:12px 0}
      .user{background:#eff6ff}.agent{background:#f8fafc}strong{display:block;margin-bottom:8px}p{white-space:normal;margin:0;line-height:1.65}
    </style></head><body>
    <h1>${escapeHtml(conversation.title)}</h1>
    <div class="meta">导出时间：${new Date().toLocaleString()}</div>
    ${body}
    <script>window.onload=()=>setTimeout(()=>window.print(),120)<\/script>
    </body></html>`)
  popup.document.close()
  notify('已打开导出窗口，可选择保存为 PDF。', 'success')
}

function pushMessage(message: ChatMessage) {
  const conversation = activeConversation.value
  if (!conversation) return
  conversation.messages.push(message)
  conversation.updatedAt = new Date().toISOString()
  if (message.role === 'user' && conversation.title === '新的对话') {
    conversation.title = message.text.slice(0, 18)
  }
  saveConversations()
}

async function load() {
  loadConversations()
  await Promise.all([devices.load(), loadProviders()])
}

async function loadProviders() {
  providers.value = await api<AiProvider[]>('/api/agent/providers')
  selectedProvider.value = usableProviders.value[0]?.id ?? ''
}

function toggleDevice(deviceId: string) {
  selectedDevices.value = selectedDevices.value.includes(deviceId)
    ? selectedDevices.value.filter((id) => id !== deviceId)
    : [...selectedDevices.value, deviceId]
}

function attachFiles(event: Event) {
  const input = event.target as HTMLInputElement
  attachments.value = [...attachments.value, ...Array.from(input.files ?? []).map((file) => ({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
  }))]
  input.value = ''
}

async function sendMessage() {
  if (!prompt.value.trim()) return
  if (!selectedProvider.value) {
    notice.value = '请先在设置中添加并验证一个模型。'
    notify(notice.value, 'error')
    return
  }

  const text = prompt.value.trim()
  pushMessage({ role: 'user', text })
  prompt.value = ''
  running.value = true
  notice.value = ''
  try {
    const response = await api<AgentRunResponse>('/api/agent/runs', {
      method: 'POST',
      body: JSON.stringify({
        prompt: text,
        providerId: selectedProvider.value,
        deviceIds: selectedDevices.value,
        permissionMode: permissionMode.value,
        scopes: ['device:control', 'device:input', 'media:read', selectedDevices.value.length > 1 ? 'group:control' : 'device:single'],
        webSearchEnabled: webSearchEnabled.value,
        attachments: attachments.value,
        history: messages.value.slice(-12).map((item) => ({ role: item.role, text: item.text })),
      }),
    })
    pushMessage({ role: 'agent', text: response.message })
    attachments.value = []
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Agent 请求失败。'
    pushMessage({ role: 'agent', text: message })
    notify(message, 'error')
  } finally {
    running.value = false
  }
}

watch(selectedDevices, () => {
  if (!activeConversation.value) return
  activeConversation.value.selectedDevices = [...selectedDevices.value]
  saveConversations()
}, { deep: true })

onMounted(() => {
  load()
  checkMobile()
  window.addEventListener('resize', checkMobile)
})
if (typeof window !== 'undefined') {
  onUnmounted(() => window.removeEventListener('resize', checkMobile))
}
</script>

<template>
  <section class="grid min-h-[calc(100vh-8rem)] grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
    <!-- Conversation sidebar - hidden on mobile, shown as overlay panel -->
    <aside class="glass-panel flex min-h-[220px] flex-col p-3" :class="isMobileView ? 'fixed inset-x-4 top-20 z-50 h-[60vh] max-h-[500px] shadow-2xl' : ''">
      <div class="mb-3 flex items-center justify-between">
        <h1 class="font-semibold">AI Agent</h1>
        <div class="flex items-center gap-2">
          <button v-if="isMobileView" class="rounded-md p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" @click="showConversationPanel = false">
            <span class="icon-[solar--close-circle-outline size-5 text-slate-400" />
          </button>
          <button v-if="!isMobileView" class="glass-button h-9 px-3" @click="createConversation">
            <span class="icon-[solar--add-circle-outline] size-5" />
            <span>新对话</span>
          </button>
        </div>
      </div>
      <!-- Fixed height scrollable list without horizontal overflow -->
      <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          v-for="conversation in sortedConversations"
          :key="conversation.id"
          class="group mb-1 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-300 min-w-0"
          :class="conversation.id === activeConversationId ? 'bg-white/70 text-sky-700 shadow-sm dark:bg-white/15 dark:text-sky-200' : 'hover:bg-white/40 dark:hover:bg-white/10'"
          @click="switchConversation(conversation.id); isMobileView && (showConversationPanel = false)"
        >
          <div class="flex items-start gap-2 min-w-0">
            <button class="min-w-0 flex-1 text-left" @click.stop="switchConversation(conversation.id)">
              <span class="flex items-center gap-1 truncate font-medium block">
                <span v-if="conversation.pinned" class="icon-[solar--pin-outline size-4 shrink-0 text-sky-500" />
                <span class="truncate">{{ conversation.title }}</span>
              </span>
              <span class="mt-1 block text-xs text-slate-500 truncate">{{ new Date(conversation.updatedAt).toLocaleString() }}</span>
            </button>
            <div class="flex shrink-0 items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
              <button class="rounded-full p-1 hover:bg-white/55 dark:hover:bg-white/10" title="置顶" @click.stop="togglePin(conversation)">
                <span :class="[conversation.pinned ? 'icon-[solar--pin-bold] text-sky-500' : 'icon-[solar--pin-outline]', 'size-3.5']" />
              </button>
              <button class="rounded-full p-1 hover:bg-white/55 dark:hover:bg-white/10" title="重命名" @click.stop="renameConversation(conversation)">
                <span class="icon-[solar--pen-new-square-outline size-3.5" />
              </button>
              <button class="rounded-full p-1 hover:bg-white/55 dark:hover:bg-white/10" title="导出 PDF" @click.stop="exportConversationPdf(conversation)">
                <span class="icon-[solar--share-outline size-3.5" />
              </button>
              <button class="rounded-full p-1 text-rose-600 hover:bg-rose-50/80 dark:hover:bg-rose-950" title="删除" @click.stop="deleteConversation(conversation.id)">
                <span class="icon-[solar--trash-bin-trash-outline size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <!-- Mobile new conversation button at bottom -->
      <button v-if="isMobileView" class="glass-button glass-button-primary mt-2 w-full justify-center" @click="createConversation(); showConversationPanel = false">
        <span class="icon-[solar--add-circle-outline size-5" />
        <span>新对话</span>
      </button>
    </aside>

    <!-- Main chat area -->
    <div class="glass-panel flex h-[calc(100vh-2rem)] max-h-[800px] flex-col overflow-hidden sm:h-[calc(100vh-3rem)]">
      <!-- Header with conversation switcher on mobile -->
      <div class="border-b border-white/40 px-4 py-3 sm:px-5 sm:py-4 dark:border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <!-- Mobile: tap to open conversation panel -->
            <button
              v-if="isMobileView"
              class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-white/30 hover:bg-white/50 dark:bg-white/5 dark:hover:bg-white/10 transition-colors min-w-0"
              @click="showConversationPanel = true"
            >
              <span class="icon-[solar--chat-round-dots-bold size-5 text-sky-400 shrink-0" />
              <span class="truncate">{{ activeConversation?.title || 'AI 助手' }}</span>
              <span class="icon-[solar--alt-arrow-down-linear size-3.5 text-slate-400" />
            </button>
            <template v-else>
              <div class="min-w-0">
                <h2 class="font-semibold truncate">{{ activeConversation?.title || 'AI Agent' }}</h2>
                <p class="mt-0.5 text-xs text-slate-500 hidden sm:block">真正调用已配置模型，并把可用设备、ADB/APK 能力作为上下文提供给 AI。</p>
              </div>
            </template>
          </div>
          <RouterLink class="glass-button shrink-0" :to="{ name: 'settings', query: { section: 'agent' } }">
            <span class="icon-[solar--settings-outline size-5" />
            <span class="hidden sm:inline">模型设置</span>
          </RouterLink>
        </div>
      </div>

      <!-- Messages area -->
      <div class="flex-1 space-y-3 overflow-y-auto p-4">
        <div class="space-y-3">
        <div
          v-for="(message, index) in messages"
          :key="index"
          class="max-w-[85%] break-words whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm"
          :class="[
            message.role === 'user'
              ? 'ml-auto bg-sky-500/85 text-white'
              : 'mr-auto max-w-[85%] border border-white/45 bg-white/55 text-slate-700 backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:text-slate-200',
            message.role !== 'user' ? 'self-start' : ''
          ]"
        >
          {{ message.text }}
        </div>
        </div>
        <div v-if="running" class="inline-flex items-center gap-3 rounded-2xl border border-white/45 bg-white/55 px-4 py-3 text-sm text-slate-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
          <span>AI 正在思考</span>
          <span class="inline-flex gap-1">
            <span class="thinking-dot" />
            <span class="thinking-dot" />
            <span class="thinking-dot" />
          </span>
        </div>
      </div>

      <!-- Input area - different layout for mobile vs desktop -->
      <div class="border-t border-white/40 p-3 sm:p-4 dark:border-white/10">
        <!-- Attachment tags shown above input when files exist -->
        <div v-if="attachments.length > 0" class="mb-2 flex flex-wrap gap-1.5">
          <span
            v-for="(file, idx) in attachments"
            :key="`${file.name}-${file.size}`"
            class="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
          >
            <span class="icon-[solar--document-text-bold size-3" />
            <span class="max-w-[120px] truncate">{{ file.name }}</span>
            <button class="ml-0.5 rounded-full p-0.5 hover:bg-sky-200 dark:hover:bg-sky-700" @click="attachments.splice(idx, 1)">
              <span class="icon-[solar--close-circle-bold size-3" />
            </button>
          </span>
        </div>

        <!-- Desktop input layout (preserves current design) -->
        <template v-if="!isMobileView">
          <textarea
            v-model="prompt"
            class="min-h-20 w-full resize-none rounded-2xl border border-white/55 bg-white/55 p-3 text-sm outline-none backdrop-blur-xl transition-all duration-300 focus:border-sky-400 dark:border-white/10 dark:bg-white/10"
            placeholder="描述你要完成的目标，例如：检查这些设备是否都打开了首页。如果需要重复定时执行，我会再建议保存为任务。"
            @keydown.ctrl.enter.prevent="sendMessage"
          />

          <div class="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div class="flex flex-wrap gap-2">
              <LiquidSelect v-model="selectedProvider" class="min-w-52" :options="providerOptions" placeholder="选择模型" />
              <LiquidSelect v-model="permissionMode" class="min-w-52" :options="permissionOptions" />
              <div class="relative">
                <button class="glass-button" @click="deviceMenuOpen = !deviceMenuOpen">
                  <span class="icon-[solar--devices-outline] size-5" />
                  <span>{{ selectedDeviceSummary }}</span>
                </button>
                <div v-if="deviceMenuOpen" class="glass-menu absolute bottom-12 left-0 z-20 grid max-h-80 w-80 gap-2 overflow-auto p-3">
                  <label v-for="device in devices.devices" :key="device.deviceId" class="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-2 hover:bg-white/40 dark:hover:bg-white/10">
                    <input type="checkbox" class="glass-checkbox mt-1" :checked="selectedDevices.includes(device.deviceId)" @change="toggleDevice(device.deviceId)" />
                    <span class="min-w-0">
                      <span class="block truncate text-sm font-medium">{{ device.model || device.deviceId }}</span>
                      <span class="block truncate text-xs text-slate-500">{{ device.displayState }} · {{ device.temporaryAdbSerial || device.apkVersion || '未连接' }}</span>
                    </span>
                  </label>
                  <div v-if="devices.devices.length === 0" class="p-3 text-sm text-slate-500">暂无设备。</div>
                </div>
              </div>
              <label class="glass-button cursor-pointer">
                <input type="checkbox" class="glass-checkbox" v-model="webSearchEnabled" />
                <span>联网搜索</span>
              </label>
              <label class="glass-button cursor-pointer">
                <span class="icon-[solar--paperclip-outline] size-5" />
                <span>文件/图片</span>
                <input class="hidden" type="file" multiple accept="image/*,audio/*,.txt,.json,.csv,.log,.apk" @change="attachFiles" />
              </label>
            </div>
            <button class="glass-button glass-button-primary" :disabled="running || !prompt.trim()" @click="sendMessage">
              <span class="icon-[solar--plain-2-outline] size-5" />
              <span>{{ running ? '发送中' : '发送' }}</span>
            </button>
          </div>
          <div v-if="notice" class="mt-2 text-xs text-rose-600">{{ notice }}</div>
        </template>

        <!-- Mobile input layout (optimized per user's screenshot reference) -->
        <template v-else>
          <!-- Model + Device selection row -->
          <div class="flex gap-2 mb-2">
            <LiquidSelect v-model="selectedProvider" class="flex-1 min-w-0" :options="providerOptions" placeholder="选择模型" />
            <button class="glass-button relative !px-3" @click="deviceMenuOpen = !deviceMenuOpen">
              <span class="icon-[solar--devices-outline size-5" />
              <span class="text-xs">{{ selectedDevices.length > 0 ? `${selectedDevices.length}台` : '设备' }}</span>
              <div v-if="deviceMenuOpen" class="glass-menu absolute bottom-12 left-0 right-0 z-20 grid max-h-60 gap-2 overflow-auto p-3">
                <label v-for="device in devices.devices" :key="device.deviceId" class="flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 hover:bg-white/40 dark:hover:bg-white/10">
                  <input type="checkbox" class="glass-checkbox mt-0.5" :checked="selectedDevices.includes(device.deviceId)" @change="toggleDevice(device.deviceId)" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{{ device.model || device.deviceId }}</span>
                    <span class="block truncate text-xs text-slate-500">{{ device.displayState }}</span>
                  </span>
                </label>
                <div v-if="devices.devices.length === 0" class="p-3 text-sm text-slate-500">暂无设备。</div>
              </div>
            </button>
          </div>
          
          <!-- Permission mode inline selector -->
          <div class="flex gap-2 mb-2">
            <LiquidSelect v-model="permissionMode" class="flex-1 min-w-0" :options="permissionOptions" placeholder="权限模式" />
          </div>

          <!-- Input row with voice, file, and send buttons -->
          <div class="flex items-end gap-2">
            <!-- Voice button (left) -->
            <button class="glass-button !p-2.5 shrink-0" title="语音输入">
              <span class="icon-[solar--microphone-3-bold-duotone size-5" />
            </button>
            
            <!-- Text input (center) -->
            <textarea
              v-model="prompt"
              class="flex-1 min-h-10 max-h-32 resize-none rounded-2xl border border-white/55 bg-white/55 px-3 py-2.5 text-sm outline-none backdrop-blur-xl transition-all duration-300 focus:border-sky-400 dark:border-white/10 dark:bg-white/10"
              placeholder="发消息或按住说话..."
              rows="1"
              @keydown.ctrl.enter.prevent="sendMessage"
            />
            
            <!-- File/Image button (right) -->
            <label class="glass-button !p-2.5 shrink-0 cursor-pointer" title="选择文件">
              <span class="icon-[solar--gallery-add-bold-duotone size-5" />
              <input class="hidden" type="file" multiple accept="image/*,audio/*,.txt,.json,.csv,.log,.apk" @change="attachFiles" />
            </label>
            
            <!-- Send button (only shows when has text) -->
            <Transition name="slide-left">
              <button
                v-if="prompt.trim()"
                class="glass-button glass-button-primary !p-2.5 shrink-0"
                :disabled="running"
                @click="sendMessage"
              >
                <span class="icon-[solar--plain-2-bold size-5" />
              </button>
            </Transition>
          </div>

          <!-- Notice text -->
          <div v-if="notice" class="mt-1.5 text-xs text-rose-600 text-center">{{ notice }}</div>
        </template>
      </div>
    </div>

    <!-- Mobile conversation panel overlay backdrop -->
    <Transition name="fade">
      <div
        v-if="isMobileView && showConversationPanel"
        class="fixed inset-0 z-40 bg-black/20"
        @click="showConversationPanel = false"
      />
    </Transition>
  </section>
</template>

<style scoped>
.slide-left-enter-active { transition: all 200ms ease-out; }
.slide-left-leave-active { transition: all 150ms ease-in; }
.slide-left-enter-from { opacity: 0; transform: translateX(10px); }
.slide-left-leave-to { opacity: 0; transform: translateX(10px); }

.fade-enter-active, .fade-leave-active { transition: opacity 200ms; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
