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

const route = useRoute()
const devices = useDeviceStore()
const deviceId = computed(() => String(route.params.deviceId ?? ''))
const device = computed(() => devices.devices.find((item) => item.deviceId === deviceId.value))
const screenshotUrl = ref('')
const streaming = ref(false)
const controlEnabled = ref(false)
const busy = ref(false)
const message = ref('')
const inputText = ref('')
const pointerDown = ref<{ x: number; y: number; time: number } | null>(null)
let refreshTimer: ReturnType<typeof window.setInterval> | undefined

const screenSize = computed(() => ({
  width: device.value?.screenWidth || 1080,
  height: device.value?.screenHeight || 2400,
}))

const canUseAdb = computed(() => Boolean(device.value?.temporaryAdbSerial || deviceId.value.startsWith('adb:')))
const canUseApk = computed(() => device.value?.displayState === 'Online')

const quickKeys = [
  ['返回', 4, 'icon-[solar--undo-left-round-outline]'],
  ['主页', 3, 'icon-[solar--home-2-outline]'],
  ['任务', 187, 'icon-[solar--widget-5-outline]'],
  ['电源', 26, 'icon-[solar--power-outline]'],
  ['音量+', 24, 'icon-[solar--volume-loud-outline]'],
  ['音量-', 25, 'icon-[solar--volume-small-outline]'],
] as const

const settings = [
  ['系统设置', 'settings', 'icon-[solar--settings-outline]'],
  ['无线网络', 'wifi', 'icon-[solar--wi-fi-router-outline]'],
  ['蓝牙', 'bluetooth', 'icon-[solar--bluetooth-outline]'],
  ['显示', 'display', 'icon-[solar--monitor-outline]'],
  ['无障碍', 'accessibility', 'icon-[solar--accessibility-outline]'],
  ['输入法', 'input', 'icon-[solar--keyboard-outline]'],
  ['开发者选项', 'developer', 'icon-[solar--code-square-outline]'],
  ['应用管理', 'apps', 'icon-[solar--widget-outline]'],
  ['省电', 'battery', 'icon-[solar--battery-charge-outline]'],
  ['通知', 'notification', 'icon-[solar--bell-outline]'],
  ['安全', 'security', 'icon-[solar--shield-check-outline]'],
  ['语言', 'locale', 'icon-[solar--translation-outline]'],
] as const

function refreshScreenshot() {
  if (!canUseAdb.value) {
    message.value = '该设备还没有可用的 ADB serial，无法获取屏幕。'
    return
  }

  screenshotUrl.value = `/api/devices/${encodeURIComponent(deviceId.value)}/control/screenshot?t=${Date.now()}`
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
    {
      fromX: start.x,
      fromY: start.y,
      toX: end.x,
      toY: end.y,
      durationMs: Math.max(120, Date.now() - start.time),
    },
    '滑动已发送。',
  )
}

async function sendControl(action: string, body: object, successText: string) {
  busy.value = true
  message.value = ''
  try {
    const result = await api<AdbCommandResult>(`/api/devices/${encodeURIComponent(deviceId.value)}/control/${action}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    message.value = result.success ? successText : `控制失败：${result.stderr || result.stdout || 'ADB 命令执行失败。'}`
    if (streaming.value) refreshScreenshot()
  } catch (error) {
    message.value = error instanceof ApiError ? error.message : '控制请求发送失败。'
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
          {{ device?.temporaryAdbSerial || '暂无 ADB serial' }} · {{ device?.displayState || '未知状态' }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium transition-all duration-300 hover:border-sky-300 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
          :disabled="!canUseAdb"
          @click="refreshScreenshot"
        >
          <span class="icon-[solar--refresh-outline] size-5" />
          <span>刷新屏幕</span>
        </button>
        <button
          class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60"
          :disabled="!canUseAdb"
          @click="streaming ? stopStream() : startStream()"
        >
          <span :class="[streaming ? 'icon-[solar--pause-circle-outline]' : 'icon-[solar--play-circle-outline]', 'size-5']" />
          <span>{{ streaming ? '停止投屏' : '开启投屏' }}</span>
        </button>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div class="min-w-0">
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
              class="relative max-h-[72vh] w-full max-w-[420px] overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl"
              :style="{ aspectRatio: `${screenSize.width} / ${screenSize.height}` }"
              @pointerdown="onPointerDown"
              @pointerup="onPointerUp"
            >
              <img
                v-if="screenshotUrl"
                :src="screenshotUrl"
                class="h-full w-full select-none object-contain"
                draggable="false"
                alt="设备屏幕"
                @error="message = '截图加载失败，请确认设备已授权 ADB 且当前在线。'"
              />
              <div v-else class="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">
                等待屏幕截图。
              </div>
              <div
                v-if="controlEnabled"
                class="pointer-events-none absolute inset-0 border-2 border-sky-400/80"
              />
            </div>
          </div>
        </div>

        <p v-if="message" class="mt-3 rounded-md bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {{ message }}
        </p>
      </div>

      <aside class="space-y-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 text-sm font-semibold">快捷控制</h2>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="[label, keyCode, icon] in quickKeys"
              :key="label"
              class="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 text-sm transition-all duration-300 hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:hover:text-sky-300"
              :disabled="busy || !canUseAdb"
              :title="label"
              @click="sendKey(keyCode)"
            >
              <span :class="[icon, 'size-5']" />
              <span>{{ label }}</span>
            </button>
          </div>
          <div class="mt-3 grid gap-2">
            <textarea
              v-model="inputText"
              class="min-h-20 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-all duration-300 focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
              placeholder="输入要发送到手机的文本"
            />
            <button
              class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60"
              :disabled="busy || !canUseAdb"
              @click="sendText"
            >
              <span class="icon-[solar--plain-2-outline] size-5" />
              <span>发送文本</span>
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 text-sm font-semibold">手机设置</h2>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="[label, target, icon] in settings"
              :key="target"
              class="inline-flex h-10 items-center justify-start gap-2 rounded-md border border-slate-200 px-3 text-sm transition-all duration-300 hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:hover:text-sky-300"
              :disabled="busy || !canUseAdb"
              :title="label"
              @click="openSetting(target)"
            >
              <span :class="[icon, 'size-5 shrink-0']" />
              <span class="truncate">{{ label }}</span>
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 font-semibold">能力状态</h2>
          <div class="space-y-2">
            <div class="flex items-center justify-between"><span>ADB 控制</span><strong>{{ canUseAdb ? '可用' : '不可用' }}</strong></div>
            <div class="flex items-center justify-between"><span>APK 通道</span><strong>{{ canUseApk ? '在线' : '未在线' }}</strong></div>
            <div class="flex items-center justify-between"><span>屏幕尺寸</span><strong>{{ screenSize.width }} x {{ screenSize.height }}</strong></div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
