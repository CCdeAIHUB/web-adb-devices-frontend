<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ApiError, api } from '@/api/client'
import { useDeviceStore } from '@/stores/devices'

interface AdbCommandResult {
  success: boolean
  stdout: string
  stderr: string
  errorCode?: string
}

interface PackageItem {
  packageName: string
  apkPath: string
}

interface FileEntry {
  name: string
  type: 'directory' | 'file' | 'link' | 'unknown'
  size: string
  permissions: string
}

interface HardwareInfo {
  cpu: string
  memory: string
  battery: string
  display: string
  properties: string
}

const route = useRoute()
const devices = useDeviceStore()
const deviceId = computed(() => String(route.params.deviceId ?? ''))
const device = computed(() => devices.devices.find((item) => item.deviceId === deviceId.value))
const canUseAdb = computed(() => Boolean(device.value?.temporaryAdbSerial || deviceId.value.startsWith('adb:')))
const canUseApk = computed(() => device.value?.displayState === 'Online')

const activeTab = ref<'control' | 'terminal' | 'apps' | 'files' | 'hardware' | 'system' | 'power'>('control')
const screenshotUrl = ref('')
const streaming = ref(false)
const controlEnabled = ref(false)
const busy = ref(false)
const message = ref('')
const inputText = ref('')
const pointerDown = ref<{ x: number; y: number; time: number } | null>(null)
const liveScreen = ref({ width: 1080, height: 2400 })
let refreshTimer: ReturnType<typeof window.setInterval> | undefined

const terminalCommand = ref('shell getprop ro.product.model')
const terminalOutput = ref('')
const packages = ref<PackageItem[]>([])
const packageScope = ref<'all' | 'user' | 'system'>('all')
const packageFilter = ref('')
const selectedPackage = ref('')
const appInfo = ref('')
const currentPath = ref('/sdcard')
const fileEntries = ref<FileEntry[]>([])
const hardware = ref<HardwareInfo | null>(null)
const hiddenIcons = ref<string[]>([])
const collapsedTileCount = ref(6)
const iconTopPadding = ref(0)

const screenSize = computed(() => {
  const width = liveScreen.value.width || device.value?.screenWidth || 1080
  const height = liveScreen.value.height || device.value?.screenHeight || 2400
  return { width, height }
})
const isLandscape = computed(() => screenSize.value.width > screenSize.value.height)
const filteredPackages = computed(() => {
  const keyword = packageFilter.value.trim().toLowerCase()
  return keyword ? packages.value.filter((item) => item.packageName.toLowerCase().includes(keyword)) : packages.value
})

const tabs = [
  ['control', '屏幕控制', 'icon-[solar--smartphone-2-outline]'],
  ['terminal', 'ADB 终端', 'icon-[solar--code-square-outline]'],
  ['apps', '软件管理', 'icon-[solar--widget-outline]'],
  ['files', '文件管理', 'icon-[solar--folder-with-files-outline]'],
  ['hardware', '硬件信息', 'icon-[solar--cpu-outline]'],
  ['system', '系统界面', 'icon-[solar--tuning-2-outline]'],
  ['power', '快速重启', 'icon-[solar--restart-outline]'],
] as const

const quickKeys = [
  ['返回', 4, 'icon-[solar--undo-left-round-outline]'],
  ['主页', 3, 'icon-[solar--home-2-outline]'],
  ['任务', 187, 'icon-[solar--widget-5-outline]'],
  ['电源', 26, 'icon-[solar--power-outline]'],
  ['音量+', 24, 'icon-[solar--volume-loud-outline]'],
  ['音量-', 25, 'icon-[solar--volume-small-outline]'],
] as const

const settingGroups = [
  {
    title: '连接',
    items: [
      ['无线网络', 'wifi', 'icon-[solar--wi-fi-router-outline]'],
      ['蓝牙', 'bluetooth', 'icon-[solar--bluetooth-outline]'],
      ['飞行模式', 'airplane', 'icon-[solar--airbuds-case-open-outline]'],
    ],
  },
  {
    title: '显示与输入',
    items: [
      ['显示', 'display', 'icon-[solar--monitor-outline]'],
      ['无障碍', 'accessibility', 'icon-[solar--accessibility-outline]'],
      ['输入法', 'input', 'icon-[solar--keyboard-outline]'],
      ['语言', 'locale', 'icon-[solar--translation-outline]'],
    ],
  },
  {
    title: '系统',
    items: [
      ['系统设置', 'settings', 'icon-[solar--settings-outline]'],
      ['开发者选项', 'developer', 'icon-[solar--code-square-outline]'],
      ['应用管理', 'apps', 'icon-[solar--widget-outline]'],
      ['省电', 'battery', 'icon-[solar--battery-charge-outline]'],
      ['通知', 'notification', 'icon-[solar--bell-outline]'],
      ['安全', 'security', 'icon-[solar--shield-check-outline]'],
    ],
  },
] as const

const statusIconOptions = [
  ['time', '时间'],
  ['location', '定位'],
  ['headset', '耳机'],
  ['cast', '投射'],
  ['alarm', '闹钟'],
  ['sound', '声音'],
  ['signal', '信号'],
  ['airplane', '飞行'],
  ['bluetooth', '蓝牙'],
  ['battery', '电池'],
  ['wifi', '无线'],
  ['seconds', '显秒'],
  ['nfc', 'NFC'],
  ['rotateSuggestion', '左下角旋转提示'],
] as const

const powerActions = [
  ['reboot', '重启', 'icon-[solar--restart-outline]'],
  ['fastboot', 'Fastboot', 'icon-[solar--usb-outline]'],
  ['edl', 'EDL', 'icon-[solar--danger-triangle-outline]'],
  ['shutdown', '关机', 'icon-[solar--power-outline]'],
  ['fastbootd', 'fastbootd', 'icon-[solar--smartphone-update-outline]'],
  ['recovery', 'Recovery', 'icon-[solar--shield-warning-outline]'],
] as const

function controlUrl(path: string) {
  return `/api/devices/${encodeURIComponent(deviceId.value)}/${path}`
}

function reportError(error: unknown, fallback: string) {
  message.value = error instanceof ApiError ? error.message : fallback
}

function refreshScreenshot() {
  if (!canUseAdb.value) {
    message.value = '该设备还没有可用的 ADB serial，无法获取屏幕。'
    return
  }

  screenshotUrl.value = `${controlUrl('control/screenshot')}?t=${Date.now()}`
}

function onScreenLoaded(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    liveScreen.value = { width: image.naturalWidth, height: image.naturalHeight }
  }
}

function startStream() {
  streaming.value = true
  refreshScreenshot()
  stopTimer()
  refreshTimer = window.setInterval(refreshScreenshot, 1200)
}

function stopStream() {
  streaming.value = false
  stopTimer()
}

function stopTimer() {
  if (refreshTimer !== undefined) {
    window.clearInterval(refreshTimer)
    refreshTimer = undefined
  }
}

function pointFromEvent(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratioX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  const ratioY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
  return {
    x: Math.round(ratioX * screenSize.value.width),
    y: Math.round(ratioY * screenSize.value.height),
  }
}

function onPointerDown(event: PointerEvent) {
  if (!controlEnabled.value || !canUseAdb.value) return
  pointerDown.value = { ...pointFromEvent(event), time: Date.now() }
}

async function onPointerUp(event: PointerEvent) {
  if (!controlEnabled.value || !canUseAdb.value || !pointerDown.value) return
  const start = pointerDown.value
  pointerDown.value = null
  const end = pointFromEvent(event)
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  if (distance < 18) {
    await sendControl('tap', { x: end.x, y: end.y }, '点击已发送。')
    return
  }

  await sendControl(
    'swipe',
    { fromX: start.x, fromY: start.y, toX: end.x, toY: end.y, durationMs: Math.max(120, Date.now() - start.time) },
    '滑动已发送。',
  )
}

async function sendControl(action: string, body: object, successText: string) {
  busy.value = true
  message.value = ''
  try {
    const result = await api<AdbCommandResult>(controlUrl(`control/${action}`), {
      method: 'POST',
      body: JSON.stringify(body),
    })
    message.value = result.success ? successText : `控制失败：${result.stderr || result.stdout || 'ADB 命令执行失败。'}`
    if (streaming.value) refreshScreenshot()
  } catch (error) {
    reportError(error, '控制请求发送失败。')
  } finally {
    busy.value = false
  }
}

async function sendKey(keyCode: number) {
  await sendControl('keyevent', { keyCode }, '按键已发送。')
}

async function sendText() {
  if (!inputText.value.trim()) {
    message.value = '请输入要发送到手机的文本。'
    return
  }
  await sendControl('text', { text: inputText.value }, '文本已发送。')
}

async function openSetting(target: string) {
  await sendControl('open-setting', { target }, '设置页已打开。')
}

async function runTerminal() {
  busy.value = true
  try {
    const result = await api<AdbCommandResult>(controlUrl('terminal'), {
      method: 'POST',
      body: JSON.stringify({ command: terminalCommand.value }),
    })
    terminalOutput.value = [result.stdout, result.stderr].filter(Boolean).join('\n') || (result.success ? '命令已执行，无输出。' : '命令执行失败。')
  } catch (error) {
    terminalOutput.value = error instanceof ApiError ? error.message : '终端命令发送失败。'
  } finally {
    busy.value = false
  }
}

async function loadPackages() {
  busy.value = true
  try {
    const response = await api<{ packages: PackageItem[] }>(controlUrl(`apps?scope=${packageScope.value}`))
    packages.value = response.packages
  } catch (error) {
    reportError(error, '软件包列表读取失败。')
  } finally {
    busy.value = false
  }
}

async function appAction(action: string, packageName = selectedPackage.value) {
  if (!packageName) {
    message.value = '请先选择软件包。'
    return
  }

  busy.value = true
  try {
    const result = await api<AdbCommandResult>(controlUrl('apps/action'), {
      method: 'POST',
      body: JSON.stringify({ packageName, action }),
    })
    if (action === 'info') {
      appInfo.value = result.stdout || result.stderr || '没有返回软件信息。'
    } else {
      message.value = result.success ? '软件操作已执行。' : `软件操作失败：${result.stderr || result.stdout}`
      await loadPackages()
    }
  } catch (error) {
    reportError(error, '软件操作请求失败。')
  } finally {
    busy.value = false
  }
}

function extractApk(packageName = selectedPackage.value) {
  if (!packageName) {
    message.value = '请先选择软件包。'
    return
  }
  window.open(controlUrl(`apps/${encodeURIComponent(packageName)}/apk`), '_blank')
}

async function installApk(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const form = new FormData()
  form.append('file', file)
  busy.value = true
  try {
    const response = await fetch(controlUrl('apps/install'), { method: 'POST', credentials: 'include', body: form })
    const body = await response.json()
    message.value = body.success ? 'APK 已安装。' : body.message || body.stderr || 'APK 安装失败。'
    await loadPackages()
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function loadFiles(path = currentPath.value) {
  busy.value = true
  try {
    const response = await api<{ path: string; entries: FileEntry[] }>(controlUrl(`files?path=${encodeURIComponent(path)}`))
    currentPath.value = response.path
    fileEntries.value = response.entries
  } catch (error) {
    reportError(error, '文件列表读取失败。')
  } finally {
    busy.value = false
  }
}

function enterFile(entry: FileEntry) {
  if (entry.type !== 'directory') return
  const base = currentPath.value.endsWith('/') ? currentPath.value.slice(0, -1) : currentPath.value
  loadFiles(`${base}/${entry.name}`)
}

function parentPath() {
  if (currentPath.value === '/sdcard') return
  const next = currentPath.value.replace(/\/$/, '').split('/').slice(0, -1).join('/') || '/sdcard'
  loadFiles(next.startsWith('/sdcard') ? next : '/sdcard')
}

function downloadFile(entry: FileEntry) {
  const base = currentPath.value.endsWith('/') ? currentPath.value.slice(0, -1) : currentPath.value
  window.open(controlUrl(`files/download?path=${encodeURIComponent(`${base}/${entry.name}`)}`), '_blank')
}

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const form = new FormData()
  form.append('path', currentPath.value.endsWith('/') ? currentPath.value : `${currentPath.value}/`)
  form.append('file', file)
  busy.value = true
  try {
    const response = await fetch(controlUrl('files/upload'), { method: 'POST', credentials: 'include', body: form })
    const body = await response.json()
    message.value = body.success ? '文件已发送。' : body.message || body.stderr || '文件发送失败。'
    await loadFiles()
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function loadHardware() {
  busy.value = true
  try {
    hardware.value = await api<HardwareInfo>(controlUrl('hardware'))
  } catch (error) {
    reportError(error, '硬件信息读取失败。')
  } finally {
    busy.value = false
  }
}

async function saveStatusIcons() {
  await postSimple('system-ui/status-icons', { hiddenIcons: hiddenIcons.value }, '状态栏图标设置已发送。')
}

async function saveQuickSettings() {
  await postSimple('system-ui/quick-settings', { collapsedTileCount: collapsedTileCount.value, iconTopPadding: iconTopPadding.value }, '快捷设置布局命令已发送。')
}

async function powerAction(action: string) {
  await postSimple('power', { action }, '电源命令已发送。')
}

async function postSimple(path: string, body: object, successText: string) {
  busy.value = true
  try {
    const result = await api<AdbCommandResult>(controlUrl(path), { method: 'POST', body: JSON.stringify(body) })
    message.value = result.success ? successText : `命令失败：${result.stderr || result.stdout}`
  } catch (error) {
    reportError(error, '命令发送失败。')
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await devices.load()
  refreshScreenshot()
})

onUnmounted(stopTimer)
</script>

<template>
  <section class="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <RouterLink class="mb-2 inline-flex items-center gap-2 text-sm text-sky-700 hover:underline dark:text-sky-300" to="/devices">
          <span class="icon-[solar--alt-arrow-left-outline] size-4" />
          <span>返回设备列表</span>
        </RouterLink>
        <h1 class="text-xl font-semibold">{{ device?.model || deviceId }}</h1>
        <p class="mt-1 text-sm text-slate-500">
          {{ device?.temporaryAdbSerial || '暂无 ADB serial' }} · {{ device?.displayState || '未知状态' }} · {{ screenSize.width }} x {{ screenSize.height }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium transition-all duration-300 hover:border-sky-300 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900" :disabled="!canUseAdb" @click="refreshScreenshot">
          <span class="icon-[solar--refresh-outline] size-5" />
          <span>刷新屏幕</span>
        </button>
        <button class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60" :disabled="!canUseAdb" @click="streaming ? stopStream() : startStream()">
          <span :class="[streaming ? 'icon-[solar--pause-circle-outline]' : 'icon-[solar--play-circle-outline]', 'size-5']" />
          <span>{{ streaming ? '停止投屏' : '开启投屏' }}</span>
        </button>
      </div>
    </div>

    <div class="mb-4 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800">
      <button
        v-for="[key, label, icon] in tabs"
        :key="key"
        class="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-all duration-300"
        :class="activeTab === key ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'hover:bg-white dark:hover:bg-slate-900'"
        @click="activeTab = key"
      >
        <span :class="[icon, 'size-5']" />
        <span>{{ label }}</span>
      </button>
    </div>

    <div v-if="message" class="mb-4 rounded-md bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{{ message }}</div>

    <div v-if="activeTab === 'control'" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-white">
          <div class="flex items-center gap-2 text-sm">
            <span class="icon-[solar--smartphone-2-outline] size-5 text-sky-300" />
            <span>{{ streaming ? '实时观看中' : '屏幕预览' }}</span>
            <span v-if="canUseApk" class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">APK 在线</span>
            <span v-else class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">ADB 控制</span>
          </div>
          <label class="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input v-model="controlEnabled" class="size-4 accent-sky-500" type="checkbox" :disabled="!canUseAdb" />
            <span>控制状态</span>
          </label>
        </div>
        <div class="flex min-h-[560px] items-center justify-center bg-slate-950 p-4">
          <div
            class="relative overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl"
            :class="isLandscape ? 'max-h-[70vh] w-full max-w-[900px]' : 'max-h-[76vh] w-full max-w-[420px]'"
            :style="{ aspectRatio: `${screenSize.width} / ${screenSize.height}` }"
            @pointerdown="onPointerDown"
            @pointerup="onPointerUp"
          >
            <img v-if="screenshotUrl" :src="screenshotUrl" class="h-full w-full select-none object-fill" draggable="false" alt="设备屏幕" @load="onScreenLoaded" @error="message = '截图加载失败，请确认设备已授权 ADB 且当前在线。'" />
            <div v-else class="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">等待屏幕截图。</div>
            <div v-if="controlEnabled" class="pointer-events-none absolute inset-0 border-2 border-sky-400/80" />
          </div>
        </div>
      </div>

      <aside class="space-y-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 text-sm font-semibold">快捷控制</h2>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="[label, keyCode, icon] in quickKeys" :key="label" class="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 text-sm transition-all duration-300 hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:hover:text-sky-300" :disabled="busy || !canUseAdb" :title="label" @click="sendKey(keyCode)">
              <span :class="[icon, 'size-5']" />
              <span>{{ label }}</span>
            </button>
          </div>
          <textarea v-model="inputText" class="mt-3 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-all duration-300 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950" placeholder="输入要发送到手机的文本" />
          <button class="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60" :disabled="busy || !canUseAdb" @click="sendText">
            <span class="icon-[solar--plain-2-outline] size-5" />
            <span>发送文本</span>
          </button>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 text-sm font-semibold">手机设置快捷入口</h2>
          <details v-for="group in settingGroups" :key="group.title" class="mb-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" open>
            <summary class="cursor-pointer text-sm font-medium">{{ group.title }}</summary>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <button v-for="[label, target, icon] in group.items" :key="target" class="inline-flex h-10 items-center justify-start gap-2 rounded-md border border-slate-200 px-3 text-sm transition-all duration-300 hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:hover:text-sky-300" :disabled="busy || !canUseAdb" :title="label" @click="openSetting(target)">
                <span :class="[icon, 'size-5 shrink-0']" />
                <span class="truncate">{{ label }}</span>
              </button>
            </div>
          </details>
        </div>
      </aside>
    </div>

    <div v-else-if="activeTab === 'terminal'" class="grid gap-3">
      <textarea v-model="terminalCommand" class="min-h-24 rounded-md border border-slate-300 bg-white p-3 font-mono text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="例如：shell dumpsys battery" />
      <button class="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 disabled:opacity-60" :disabled="busy || !canUseAdb" @click="runTerminal">
        <span class="icon-[solar--play-outline] size-5" />
        <span>执行</span>
      </button>
      <pre class="min-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-100">{{ terminalOutput || '终端输出会显示在这里。' }}</pre>
    </div>

    <div v-else-if="activeTab === 'apps'" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-3 flex flex-wrap gap-2">
          <select v-model="packageScope" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="all">全部软件</option>
            <option value="user">用户软件</option>
            <option value="system">系统软件</option>
          </select>
          <input v-model="packageFilter" class="h-10 min-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="搜索包名" />
          <button class="h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-300 disabled:opacity-60" :disabled="busy || !canUseAdb" @click="loadPackages">列出软件包</button>
          <label class="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm transition-all duration-300 hover:border-sky-300 dark:border-slate-700">
            安装 APK
            <input class="hidden" type="file" accept=".apk,application/vnd.android.package-archive" @change="installApk" />
          </label>
        </div>
        <div class="max-h-[620px] overflow-auto">
          <button v-for="item in filteredPackages" :key="item.packageName" class="grid w-full gap-1 border-t border-slate-100 px-2 py-3 text-left text-sm transition-all duration-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" :class="selectedPackage === item.packageName ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : ''" @click="selectedPackage = item.packageName">
            <span class="font-medium">{{ item.packageName }}</span>
            <span class="truncate text-xs text-slate-500">{{ item.apkPath }}</span>
          </button>
        </div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 text-sm font-semibold">软件操作</h2>
        <p class="mb-3 break-all text-sm text-slate-500">{{ selectedPackage || '请选择一个软件包。' }}</p>
        <div class="grid grid-cols-2 gap-2">
          <button class="h-10 rounded-md border border-slate-200 text-sm transition-all duration-300 disabled:opacity-50 dark:border-slate-700" :disabled="!selectedPackage" @click="appAction('launch')">运行</button>
          <button class="h-10 rounded-md border border-slate-200 text-sm transition-all duration-300 disabled:opacity-50 dark:border-slate-700" :disabled="!selectedPackage" @click="appAction('forceStop')">强制停止</button>
          <button class="h-10 rounded-md border border-slate-200 text-sm transition-all duration-300 disabled:opacity-50 dark:border-slate-700" :disabled="!selectedPackage" @click="appAction('disable')">禁用</button>
          <button class="h-10 rounded-md border border-slate-200 text-sm transition-all duration-300 disabled:opacity-50 dark:border-slate-700" :disabled="!selectedPackage" @click="appAction('enable')">启用</button>
          <button class="h-10 rounded-md border border-slate-200 text-sm transition-all duration-300 disabled:opacity-50 dark:border-slate-700" :disabled="!selectedPackage" @click="extractApk()">提取 APK</button>
          <button class="h-10 rounded-md border border-slate-200 text-sm transition-all duration-300 disabled:opacity-50 dark:border-slate-700" :disabled="!selectedPackage" @click="appAction('info')">软件信息</button>
          <button class="h-10 rounded-md border border-rose-200 text-sm text-rose-600 transition-all duration-300 disabled:opacity-50 dark:border-rose-900" :disabled="!selectedPackage" @click="appAction('clear')">清除数据</button>
          <button class="h-10 rounded-md border border-rose-200 text-sm text-rose-600 transition-all duration-300 disabled:opacity-50 dark:border-rose-900" :disabled="!selectedPackage" @click="appAction('uninstall')">卸载</button>
          <button class="col-span-2 h-10 rounded-md border border-amber-200 text-sm text-amber-700 transition-all duration-300 disabled:opacity-50 dark:border-amber-900 dark:text-amber-300" :disabled="!selectedPackage" @click="appAction('uninstallKeepData')">保留数据卸载</button>
        </div>
        <pre class="mt-3 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{{ appInfo || '软件信息会显示在这里。' }}</pre>
      </div>
    </div>

    <div v-else-if="activeTab === 'files'" class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-3 flex flex-wrap gap-2">
        <input v-model="currentPath" class="h-10 min-w-80 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" />
        <button class="h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-300" :disabled="busy || !canUseAdb" @click="loadFiles()">查看</button>
        <button class="h-10 rounded-md border border-slate-300 px-4 text-sm transition-all duration-300 dark:border-slate-700" @click="parentPath">上级</button>
        <label class="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm transition-all duration-300 hover:border-sky-300 dark:border-slate-700">
          发送文件
          <input class="hidden" type="file" @change="uploadFile" />
        </label>
      </div>
      <div class="overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-slate-500"><tr><th class="py-2">名称</th><th>类型</th><th>大小</th><th>权限</th><th></th></tr></thead>
          <tbody>
            <tr v-for="entry in fileEntries" :key="entry.name" class="border-t border-slate-100 dark:border-slate-800">
              <td class="py-2"><button class="text-sky-700 hover:underline dark:text-sky-300" @click="enterFile(entry)">{{ entry.name }}</button></td>
              <td>{{ entry.type }}</td>
              <td>{{ entry.size }}</td>
              <td>{{ entry.permissions }}</td>
              <td><button v-if="entry.type !== 'directory'" class="text-sky-700 hover:underline dark:text-sky-300" @click="downloadFile(entry)">提取</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else-if="activeTab === 'hardware'" class="grid gap-3">
      <button class="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-300" :disabled="busy || !canUseAdb" @click="loadHardware">
        <span class="icon-[solar--refresh-outline] size-5" />
        <span>检测硬件信息</span>
      </button>
      <div class="grid gap-3 lg:grid-cols-2">
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">CPU\n{{ hardware?.cpu || '等待检测。' }}</pre>
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">内存\n{{ hardware?.memory || '等待检测。' }}</pre>
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">电池\n{{ hardware?.battery || '等待检测。' }}</pre>
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">显示/属性\n{{ [hardware?.display, hardware?.properties].filter(Boolean).join('\n') || '等待检测。' }}</pre>
      </div>
    </div>

    <div v-else-if="activeTab === 'system'" class="grid gap-4 xl:grid-cols-2">
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 text-sm font-semibold">状态栏图标隐藏</h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label v-for="[key, label] in statusIconOptions" :key="key" class="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <input v-model="hiddenIcons" type="checkbox" :value="key" class="size-4 accent-sky-500" />
            <span>{{ label }}</span>
          </label>
        </div>
        <button class="mt-3 h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-300" :disabled="busy || !canUseAdb" @click="saveStatusIcons">应用图标隐藏</button>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 text-sm font-semibold">下拉快捷图标</h2>
        <label class="mb-3 block text-sm">下拉首行图标个数：{{ collapsedTileCount }}</label>
        <input v-model.number="collapsedTileCount" class="w-full accent-sky-500" type="range" min="1" max="12" />
        <label class="mb-3 mt-4 block text-sm">图标置顶间距：{{ iconTopPadding }}</label>
        <input v-model.number="iconTopPadding" class="w-full accent-sky-500" type="range" min="0" max="80" />
        <button class="mt-4 h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-300" :disabled="busy || !canUseAdb" @click="saveQuickSettings">应用快捷设置</button>
        <p class="mt-3 text-xs text-slate-500">不同 Android 版本或 ROM 对这些 SystemUI 键的支持不同；不支持时命令可能执行但界面不变化。</p>
      </div>
    </div>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button v-for="[action, label, icon] in powerActions" :key="action" class="inline-flex h-16 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-medium transition-all duration-300 hover:border-sky-300 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" :disabled="busy || !canUseAdb" @click="powerAction(action)">
        <span :class="[icon, 'size-5']" />
        <span>{{ label }}</span>
      </button>
    </div>
  </section>
</template>
