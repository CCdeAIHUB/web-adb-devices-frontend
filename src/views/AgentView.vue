<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '@/api/client'
import { useDeviceStore } from '@/stores/devices'

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

const activeConversation = computed(() => conversations.value.find((item) => item.id === activeConversationId.value) ?? conversations.value[0])
const sortedConversations = computed(() => [...conversations.value].sort((a, b) => {
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}))
const messages = computed(() => activeConversation.value?.messages ?? [])
const usableProviders = computed(() => providers.value.filter((provider) => provider.enabled && provider.model))
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
      { role: 'agent', text: '选择模型后直接描述目标。需要操作设备时，先在输入框下方选择本次对话要使用的设备；我会基于 ADB/APK 能力判断能做什么，普通对话不会自动创建任务。' },
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

onMounted(load)
</script>

<template>
  <section class="liquid-shell grid min-h-screen grid-cols-1 gap-4 p-4 text-slate-950 dark:text-slate-100 sm:p-6 xl:grid-cols-[280px_1fr]">
    <aside class="glass-panel flex min-h-[220px] flex-col p-3">
      <div class="mb-3 flex items-center justify-between">
        <h1 class="font-semibold">AI Agent</h1>
        <button class="glass-button h-9 px-3" @click="createConversation">
          <span class="icon-[solar--add-circle-outline] size-5" />
          <span>新对话</span>
        </button>
      </div>
      <div class="grid gap-2 overflow-auto">
        <div
          v-for="conversation in sortedConversations"
          :key="conversation.id"
          class="group rounded-2xl px-3 py-2 text-left text-sm transition-all duration-300"
          :class="conversation.id === activeConversationId ? 'bg-white/70 text-sky-700 shadow-sm dark:bg-white/15 dark:text-sky-200' : 'hover:bg-white/40 dark:hover:bg-white/10'"
          @click="switchConversation(conversation.id)"
        >
          <div class="flex items-start gap-2">
            <button class="min-w-0 flex-1 text-left" @click.stop="switchConversation(conversation.id)">
              <span class="flex items-center gap-1 truncate font-medium">
                <span v-if="conversation.pinned" class="icon-[solar--pin-outline] size-4 shrink-0 text-sky-500" />
                <span class="truncate">{{ conversation.title }}</span>
              </span>
              <span class="mt-1 block text-xs text-slate-500">{{ new Date(conversation.updatedAt).toLocaleString() }}</span>
            </button>
            <div class="flex shrink-0 items-center gap-1 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
              <button class="rounded-full p-1.5 hover:bg-white/55 dark:hover:bg-white/10" title="置顶" @click.stop="togglePin(conversation)">
                <span :class="[conversation.pinned ? 'icon-[solar--pin-bold] text-sky-500' : 'icon-[solar--pin-outline]', 'size-4']" />
              </button>
              <button class="rounded-full p-1.5 hover:bg-white/55 dark:hover:bg-white/10" title="重命名" @click.stop="renameConversation(conversation)">
                <span class="icon-[solar--pen-new-square-outline] size-4" />
              </button>
              <button class="rounded-full p-1.5 hover:bg-white/55 dark:hover:bg-white/10" title="导出 PDF" @click.stop="exportConversationPdf(conversation)">
                <span class="icon-[solar--share-outline] size-4" />
              </button>
              <button class="rounded-full p-1.5 text-rose-600 hover:bg-rose-50/80 dark:hover:bg-rose-950" title="删除" @click.stop="deleteConversation(conversation.id)">
                <span class="icon-[solar--trash-bin-trash-outline] size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <div class="glass-panel flex min-h-[720px] flex-col overflow-hidden">
      <div class="border-b border-white/40 px-5 py-4 dark:border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">{{ activeConversation?.title || 'AI Agent' }}</h2>
            <p class="mt-1 text-sm text-slate-500">真正调用已配置模型，并把可用设备、ADB/APK 能力作为上下文提供给 AI。</p>
          </div>
          <RouterLink class="glass-button" :to="{ name: 'settings', query: { section: 'agent' } }">
            <span class="icon-[solar--settings-outline] size-5" />
            <span>模型设置</span>
          </RouterLink>
        </div>
      </div>

      <div class="flex-1 space-y-3 overflow-auto p-4">
        <div
          v-for="(message, index) in messages"
          :key="index"
          class="max-w-[82%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm shadow-sm"
          :class="message.role === 'user' ? 'ml-auto bg-sky-500/85 text-white' : 'border border-white/45 bg-white/55 text-slate-700 backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:text-slate-200'"
        >
          {{ message.text }}
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

      <div class="border-t border-white/40 p-4 dark:border-white/10">
        <textarea
          v-model="prompt"
          class="min-h-24 w-full resize-none rounded-2xl border border-white/55 bg-white/55 p-3 text-sm outline-none backdrop-blur-xl transition-all duration-300 focus:border-sky-400 dark:border-white/10 dark:bg-white/10"
          placeholder="描述你要完成的目标，例如：检查这些设备是否都打开了首页。如果需要重复定时执行，我会再建议保存为任务。"
          @keydown.ctrl.enter.prevent="sendMessage"
        />

        <div class="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div class="flex flex-wrap gap-2">
            <select v-model="selectedProvider" class="glass-input glass-select">
              <option value="" disabled>选择模型</option>
              <option v-for="provider in usableProviders" :key="provider.id" :value="provider.id">{{ provider.displayName }} · {{ provider.model }}</option>
            </select>
            <select v-model="permissionMode" class="glass-input glass-select">
              <option value="Default">默认权限</option>
              <option value="AutoApproval">自动审批低风险操作</option>
              <option value="FullAccess">完全权限</option>
            </select>
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
              <span>文件/图片/语音</span>
              <input class="hidden" type="file" multiple accept="image/*,audio/*,.txt,.json,.csv,.log,.apk" @change="attachFiles" />
            </label>
          </div>
          <button class="glass-button glass-button-primary" :disabled="running" @click="sendMessage">
            <span class="icon-[solar--plain-2-outline] size-5" />
            <span>{{ running ? '发送中' : '发送' }}</span>
          </button>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span v-for="file in attachments" :key="`${file.name}-${file.size}`" class="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{{ file.name }}</span>
          <span v-if="notice" class="text-rose-600">{{ notice }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
