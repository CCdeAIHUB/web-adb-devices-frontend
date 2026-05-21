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
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          class="rounded-2xl px-3 py-2 text-left text-sm transition-all duration-300"
          :class="conversation.id === activeConversationId ? 'bg-white/70 text-sky-700 shadow-sm dark:bg-white/15 dark:text-sky-200' : 'hover:bg-white/40 dark:hover:bg-white/10'"
          @click="switchConversation(conversation.id)"
        >
          <span class="block truncate font-medium">{{ conversation.title }}</span>
          <span class="mt-1 block text-xs text-slate-500">{{ new Date(conversation.updatedAt).toLocaleString() }}</span>
        </button>
      </div>
    </aside>

    <div class="glass-panel flex min-h-[720px] flex-col overflow-hidden">
      <div class="border-b border-white/40 px-5 py-4 dark:border-white/10">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="font-semibold">{{ activeConversation?.title || 'AI Agent' }}</h2>
            <p class="mt-1 text-sm text-slate-500">真正调用已配置模型，并把可用设备、ADB/APK 能力作为上下文提供给 AI。</p>
          </div>
          <RouterLink class="glass-button" to="/settings">
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
            <select v-model="selectedProvider" class="glass-input">
              <option value="" disabled>选择模型</option>
              <option v-for="provider in usableProviders" :key="provider.id" :value="provider.id">{{ provider.displayName }} · {{ provider.model }}</option>
            </select>
            <select v-model="permissionMode" class="glass-input">
              <option value="Default">默认权限</option>
              <option value="AutoApproval">自动审批低风险操作</option>
              <option value="FullAccess">完全权限</option>
            </select>
            <div class="relative">
              <button class="glass-button" @click="deviceMenuOpen = !deviceMenuOpen">
                <span class="icon-[solar--devices-outline] size-5" />
                <span>{{ selectedDeviceSummary }}</span>
              </button>
              <div v-if="deviceMenuOpen" class="glass-panel absolute bottom-12 left-0 z-20 grid max-h-80 w-80 gap-2 overflow-auto p-3">
                <label v-for="device in devices.devices" :key="device.deviceId" class="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-2 hover:bg-white/40 dark:hover:bg-white/10">
                  <input type="checkbox" class="mt-1 size-4" :checked="selectedDevices.includes(device.deviceId)" @change="toggleDevice(device.deviceId)" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{{ device.model || device.deviceId }}</span>
                    <span class="block truncate text-xs text-slate-500">{{ device.displayState }} · {{ device.temporaryAdbSerial || device.apkVersion || '未连接' }}</span>
                  </span>
                </label>
                <div v-if="devices.devices.length === 0" class="p-3 text-sm text-slate-500">暂无设备。</div>
              </div>
            </div>
            <label class="glass-button cursor-pointer">
              <input type="checkbox" class="size-4" v-model="webSearchEnabled" />
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
