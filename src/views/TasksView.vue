<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError, api } from '@/api/client'
import { useDeviceStore } from '@/stores/devices'

interface AutomationTask {
  id: string
  name: string
  framework: string
  scriptLanguage: string
  script: string
  deviceIds: string[]
  triggerType: string
  triggerConfig: string
  enabled: boolean
  updatedAt: string
}

const devices = useDeviceStore()
const tasks = ref<AutomationTask[]>([])
const saving = ref(false)
const message = ref('')
const form = reactive({
  id: '',
  name: '',
  framework: 'appium-adb',
  scriptLanguage: 'javascript',
  script: `// Appium 2 + ADB 示例
// 可通过脚本运行 Appium UI 自动化，并在需要时调用 adb / apk 操作。
await adb.shell(deviceId, 'am start -n com.example/.MainActivity')
await driver.pause(1000)`,
  deviceIds: [] as string[],
  triggerType: 'manual',
  triggerConfig: '',
  enabled: true,
})

const triggers = [
  { value: 'manual', label: '手动执行', placeholder: '无需配置' },
  { value: 'schedule', label: '定时执行', placeholder: '每天 09:00 或 cron: 0 9 * * *' },
  { value: 'interval', label: '定时循环', placeholder: '例如：每 30 分钟' },
  { value: 'app-opened', label: '打开指定 App', placeholder: '包名：com.example.app' },
  { value: 'device-online', label: '设备上线', placeholder: '可选：设备 ID 或全部' },
  { value: 'screen-text', label: '屏幕出现文字', placeholder: '例如：登录 / 支付成功' },
  { value: 'notification', label: '收到通知', placeholder: '应用包名或通知关键词' },
  { value: 'battery', label: '电量条件', placeholder: '例如：低于 20%' },
  { value: 'network', label: '网络变化', placeholder: 'WiFi / 蜂窝 / 断网' },
]

const selectedTrigger = computed(() => triggers.find((item) => item.value === form.triggerType) ?? triggers[0])

async function load() {
  await Promise.all([devices.load(), loadTasks()])
}

async function loadTasks() {
  tasks.value = await api<AutomationTask[]>('/api/automation/tasks')
}

function toggleDevice(deviceId: string) {
  form.deviceIds = form.deviceIds.includes(deviceId)
    ? form.deviceIds.filter((id) => id !== deviceId)
    : [...form.deviceIds, deviceId]
}

function editTask(task: AutomationTask) {
  form.id = task.id
  form.name = task.name
  form.framework = task.framework
  form.scriptLanguage = task.scriptLanguage
  form.script = task.script
  form.deviceIds = [...task.deviceIds]
  form.triggerType = task.triggerType
  form.triggerConfig = task.triggerConfig
  form.enabled = task.enabled
}

function resetForm() {
  form.id = ''
  form.name = ''
  form.deviceIds = []
  form.triggerType = 'manual'
  form.triggerConfig = ''
  form.enabled = true
}

async function saveTask() {
  saving.value = true
  message.value = ''
  try {
    await api<AutomationTask>('/api/automation/tasks', {
      method: 'POST',
      body: JSON.stringify(form),
    })
    message.value = '任务已保存。'
    resetForm()
    await loadTasks()
  } catch (error) {
    message.value = error instanceof ApiError ? error.message : '任务保存失败。'
  } finally {
    saving.value = false
  }
}

async function deleteTask(taskId: string) {
  await api(`/api/automation/tasks/${taskId}`, { method: 'DELETE' })
  await loadTasks()
}

onMounted(load)
</script>

<template>
  <section class="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5">
      <h1 class="text-xl font-semibold">任务</h1>
      <p class="mt-1 text-sm text-slate-500">自动化脚本框架采用 Appium 2 + ADB，兼顾界面自动化、ADB 命令、APK 安装和跨设备执行。</p>
    </div>

    <div class="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div class="grid gap-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold">添加自动化脚本</h2>
            <label class="inline-flex items-center gap-2 text-sm">
              <input v-model="form.enabled" type="checkbox" class="size-4" />
              <span>启用</span>
            </label>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <input v-model="form.name" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="任务名称" />
            <select v-model="form.framework" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option value="appium-adb">Appium 2 + ADB</option>
              <option value="adb-shell">纯 ADB Shell</option>
              <option value="apk-companion">APK Companion 能力</option>
            </select>
            <select v-model="form.triggerType" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
              <option v-for="trigger in triggers" :key="trigger.value" :value="trigger.value">{{ trigger.label }}</option>
            </select>
            <input v-model="form.triggerConfig" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" :placeholder="selectedTrigger.placeholder" />
          </div>

          <div class="mt-4">
            <div class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">选择设备</div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="device in devices.devices"
                :key="device.deviceId"
                class="rounded-md border px-3 py-2 text-sm transition-all duration-300"
                :class="form.deviceIds.includes(device.deviceId) ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950'"
                @click="toggleDevice(device.deviceId)"
              >
                {{ device.model || device.deviceId }}
              </button>
              <span v-if="devices.devices.length === 0" class="text-sm text-slate-500">暂无设备，任务仍可先保存。</span>
            </div>
          </div>

          <textarea v-model="form.script" class="mt-4 min-h-64 w-full resize-y rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none focus:border-sky-400" spellcheck="false" />

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60" :disabled="saving" @click="saveTask">
              <span class="icon-[solar--diskette-outline] size-5" />
              <span>{{ saving ? '保存中' : form.id ? '更新任务' : '添加任务' }}</span>
            </button>
            <button class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium dark:border-slate-700 dark:bg-slate-900" @click="resetForm">
              <span class="icon-[solar--restart-outline] size-5" />
              <span>清空</span>
            </button>
            <span v-if="message" class="text-sm" :class="message.includes('失败') || message.includes('请') ? 'text-rose-600' : 'text-emerald-600'">{{ message }}</span>
          </div>
        </div>
      </div>

      <aside class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 font-semibold">任务列表</h2>
        <div class="space-y-3">
          <div v-for="task in tasks" :key="task.id" class="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-medium">{{ task.name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ task.framework }} · {{ triggers.find((item) => item.value === task.triggerType)?.label ?? task.triggerType }}</div>
              </div>
              <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="task.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'">
                {{ task.enabled ? '启用' : '暂停' }}
              </span>
            </div>
            <div class="mt-3 flex gap-2">
              <button class="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" @click="editTask(task)">编辑</button>
              <button class="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-600 dark:border-rose-900" @click="deleteTask(task.id)">删除</button>
            </div>
          </div>
          <div v-if="tasks.length === 0" class="rounded-md bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-800">还没有任务。</div>
        </div>
      </aside>
    </div>
  </section>
</template>
