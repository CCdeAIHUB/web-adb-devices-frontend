<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  plan: Array<{ title: string; detail: string; risk: string; requiresApproval: boolean }>
}

interface AttachmentItem {
  name: string
  type: string
  size: number
}

const devices = useDeviceStore()
const providers = ref<AiProvider[]>([])
const selectedProvider = ref('')
const selectedDevices = ref<string[]>([])
const permissionMode = ref<'Default' | 'AutoApproval' | 'FullAccess'>('Default')
const webSearchEnabled = ref(false)
const prompt = ref('')
const running = ref(false)
const notice = ref('')
const attachments = ref<AttachmentItem[]>([])
const messages = ref<Array<{ role: 'user' | 'agent'; text: string }>>([
  { role: 'agent', text: '我是设备操作 Agent。选择模型和设备后，直接描述目标，例如打开 App、检查界面、批量输入、截图判断或执行多步操作。任务页只用于保存重复性自动化脚本。' },
])

const usableProviders = computed(() => providers.value.filter((provider) => provider.enabled && provider.model))
const selectedDeviceSummary = computed(() => selectedDevices.value.length === 0 ? '未选择设备' : `已选择 ${selectedDevices.value.length} 台设备`)

async function load() {
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
    return
  }

  const text = prompt.value.trim()
  messages.value.push({ role: 'user', text })
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
      }),
    })
    const planText = response.plan?.length
      ? response.plan.map((step, index) => `${index + 1}. ${step.title}：${step.detail}${step.requiresApproval ? '（需要确认）' : ''}`).join('\n')
      : 'Agent 已进入设备操作流程。'
    messages.value.push({ role: 'agent', text: `${response.message}\n运行编号：${response.runId}\n${planText}` })
    attachments.value = []
  } catch (error) {
    const message = error instanceof ApiError ? error.message : 'Agent 请求失败。'
    messages.value.push({ role: 'agent', text: message })
  } finally {
    running.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="liquid-shell flex min-h-screen flex-col p-4 text-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">AI Agent</h1>
        <p class="mt-1 text-sm text-slate-500">对话、选模型、选设备和控制权限集中在这里。</p>
      </div>
      <RouterLink class="glass-button" to="/settings">
        <span class="icon-[solar--settings-outline] size-5" />
        <span>模型设置</span>
      </RouterLink>
    </div>

    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_320px]">
      <div class="glass-panel flex min-h-[620px] flex-col overflow-hidden">
        <div class="flex-1 space-y-3 overflow-auto p-4">
          <div
            v-for="(message, index) in messages"
            :key="index"
            class="max-w-[82%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm shadow-sm"
            :class="message.role === 'user' ? 'ml-auto bg-sky-500/85 text-white' : 'border border-white/45 bg-white/55 text-slate-700 backdrop-blur-xl dark:border-white/10 dark:bg-white/10 dark:text-slate-200'"
          >
            {{ message.text }}
          </div>
        </div>

        <div class="border-t border-white/40 p-4 dark:border-white/10">
          <textarea
            v-model="prompt"
            class="min-h-24 w-full resize-none rounded-2xl border border-white/55 bg-white/55 p-3 text-sm outline-none backdrop-blur-xl transition-all duration-300 focus:border-sky-400 dark:border-white/10 dark:bg-white/10"
            placeholder="输入要让 Agent 完成的设备操作，例如：打开选中设备的指定 App，并检查首页是否加载成功。"
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
            <span>{{ selectedDeviceSummary }}</span>
            <span v-for="file in attachments" :key="`${file.name}-${file.size}`" class="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">{{ file.name }}</span>
            <span v-if="notice" class="text-rose-600">{{ notice }}</span>
          </div>
        </div>
      </div>

      <aside class="glass-panel p-4">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold">可控设备</h2>
          <button class="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800" @click="devices.load">
            <span class="icon-[solar--refresh-outline] size-5" />
          </button>
        </div>
        <div class="space-y-2">
          <button
            v-for="device in devices.devices"
            :key="device.deviceId"
            class="grid w-full grid-cols-[auto_1fr] gap-3 rounded-2xl border p-3 text-left text-sm transition-all duration-300"
            :class="selectedDevices.includes(device.deviceId) ? 'border-sky-300 bg-sky-50/80 dark:border-sky-800 dark:bg-sky-950/60' : 'border-white/45 bg-white/35 hover:border-sky-200 dark:border-white/10 dark:bg-white/5'"
            @click="toggleDevice(device.deviceId)"
          >
            <input type="checkbox" class="mt-1 size-4" :checked="selectedDevices.includes(device.deviceId)" readonly />
            <span>
              <span class="block font-medium">{{ device.model || device.deviceId }}</span>
              <span class="mt-1 block text-xs text-slate-500">{{ device.displayState }} · {{ device.temporaryAdbSerial || 'APK' }}</span>
            </span>
          </button>
          <div v-if="devices.devices.length === 0" class="rounded-md bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-800">暂无设备。</div>
        </div>
      </aside>
    </div>
  </section>
</template>
