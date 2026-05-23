<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ApiError, api } from '@/api/client'
import { useDeviceStore } from '@/stores/devices'
import LiquidSelect from '@/components/LiquidSelect.vue'
import PageHeader from '@/components/PageHeader.vue'

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
const showHelp = ref(false)
const form = reactive({
  id: '',
  name: '',
  framework: 'appium-adb',
  scriptLanguage: 'javascript',
  script: '',
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

const frameworkOptions = [
  { value: 'appium-adb', label: 'Appium 2 + ADB' },
  { value: 'adb-shell', label: '纯 ADB Shell' },
  { value: 'apk-companion', label: 'APK Companion 能力' },
]

const selectedTrigger = computed(() => triggers.find((item) => item.value === form.triggerType) ?? triggers[0])
const scriptPlaceholder = `// Appium 2 + ADB 示例
// deviceId 由任务选择的设备注入
await adb.shell(deviceId, 'am start -n com.example/.MainActivity')
await driver.pause(1000)
// 可以结合 driver 查找元素、点击、输入，也可以调用 adb shell / install / pull / push。`

function notify(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('wad:notify', { detail: { message, type } }))
}

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
    notify('任务已保存。', 'success')
    resetForm()
    await loadTasks()
  } catch (error) {
    message.value = error instanceof ApiError ? error.message : '任务保存失败。'
    notify(message.value, 'error')
  } finally {
    saving.value = false
  }
}

async function deleteTask(taskId: string) {
  await api(`/api/automation/tasks/${taskId}`, { method: 'DELETE' })
  await loadTasks()
  notify('任务已删除。', 'success')
}

async function setTaskEnabled(task: AutomationTask, enabled: boolean) {
  await api<AutomationTask>('/api/automation/tasks', {
    method: 'POST',
    body: JSON.stringify({ ...task, enabled }),
  })
  await loadTasks()
  notify(enabled ? '任务已启用。' : '任务已暂停。', 'success')
}

onMounted(load)
</script>

<template>
  <section class="flex min-h-[calc(100vh-8rem)] flex-col text-slate-950 dark:text-slate-100">
    <PageHeader>
      <h1 class="text-xl font-semibold">任务</h1>
      <p class="mt-1 text-sm text-slate-500">自动化脚本框架采用 Appium 2 + ADB，兼顾界面自动化、ADB 命令、APK 安装和跨设备执行。</p>
      <template #actions>
        <button class="glass-button" @click="showHelp = true">
          <span class="icon-[solar--question-circle-outline] size-5" />
          <span>脚本教程</span>
        </button>
      </template>
    </PageHeader>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">

    <div class="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div class="grid gap-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="font-semibold">添加自动化脚本</h2>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <input v-model="form.name" class="glass-input" placeholder="任务名称" />
            <LiquidSelect v-model="form.framework" :options="frameworkOptions" />
            <LiquidSelect v-model="form.triggerType" :options="triggers" />
            <input v-model="form.triggerConfig" class="glass-input" :placeholder="selectedTrigger.placeholder" />
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

          <textarea v-model="form.script" class="mt-4 min-h-64 w-full resize-y rounded-lg border border-slate-300 bg-slate-950 p-4 font-mono text-sm text-slate-100 outline-none focus:border-sky-400 placeholder:text-slate-500" :placeholder="scriptPlaceholder" spellcheck="false" />

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
              <label class="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" class="glass-checkbox" :checked="task.enabled" @change="setTaskEnabled(task, ($event.target as HTMLInputElement).checked)" />
                <span>{{ task.enabled ? '启用' : '暂停' }}</span>
              </label>
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

    <div v-if="showHelp" class="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div class="glass-panel max-h-[82vh] w-full max-w-3xl overflow-auto p-5">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-lg font-semibold">任务脚本教程</h2>
          <button class="rounded-xl p-2 hover:bg-white/40 dark:hover:bg-white/10" @click="showHelp = false">
            <span class="icon-[solar--close-circle-outline] size-5" />
          </button>
        </div>
        <div class="space-y-4 text-sm leading-6 text-slate-700 dark:text-slate-200">
          <p>推荐使用 Appium 2 + ADB。脚本语言为 JavaScript，运行时会为每台目标设备注入 <code>deviceId</code>、<code>adb</code> 和 <code>driver</code>。</p>
          <pre class="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">await adb.shell(deviceId, 'am start -n com.example/.MainActivity')
await driver.pause(1000)
// 后续可读取界面、点击元素、输入文本或执行 adb 命令</pre>
          <p>适合保存为任务的场景：定时巡检、循环执行、打开指定 App 后触发、屏幕出现关键文字、收到通知、电量或网络变化。普通 AI 对话不会自动变成任务，只有明确重复执行或条件触发时才建议保存。</p>
          <p>注意事项：删除、卸载、重启、清除数据等高风险动作需要显式确认；多设备任务要避免写死分辨率；截图和识别建议使用低频率，防止前端和设备卡顿。</p>
        </div>
      </div>
    </div>
    </div><!-- end scrollable content -->
  </section>
</template>
