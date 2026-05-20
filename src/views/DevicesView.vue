<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore, type AdbScannedDevice } from '@/stores/devices'
import { ApiError, api } from '@/api/client'

const { t } = useI18n()
const devices = useDeviceStore()
const showConnect = ref(false)
const activeMode = ref<'usb' | 'pair' | 'tcpip'>('usb')
const pairHost = ref('')
const pairPort = ref('')
const pairCode = ref('')
const tcpipHost = ref('')
const tcpipPort = ref('5555')
const commandRunning = ref(false)
const commandMessage = ref('')
const environmentLoading = ref(false)
const adbInstalling = ref(false)
const environment = ref<EnvironmentSelfCheck | null>(null)
let scanTimer: ReturnType<typeof window.setInterval> | undefined

interface AdbCommandResult {
  success: boolean
  stdout: string
  stderr: string
  errorCode?: string
}

interface AdbMirrorProbe {
  name: string
  url: string
  available: boolean
  latencyMs: number
  latest: boolean
  note?: string
}

interface EnvironmentSelfCheck {
  adb: {
    exists: boolean
    path: string
    rid: string
    supported: boolean
    manualInstall: {
      targetDirectory: string
      extractFrom: string
      executableName: string
    }
    mirrors: AdbMirrorProbe[]
  }
}

interface AdbInstallResult {
  ok: boolean
  code?: string
  message?: string
}

const connectedUsb = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'device'))
const unauthorizedUsb = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'unauthorized'))
const offlineUsb = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'offline'))
const hasAnyScan = computed(() => Boolean(devices.adbScan))

function stateClass(state: string) {
  if (state === 'Online') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (state === 'Unauthorized') return 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  if (state === 'Protected') return 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  if (state === 'Updating') return 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function adbStateText(device: AdbScannedDevice) {
  if (device.state === 'device') return '已授权'
  if (device.state === 'unauthorized') return '待手机确认'
  if (device.state === 'offline') return '离线'
  return device.state
}

async function refreshAll() {
  await devices.load()
}

async function scanAdb() {
  await devices.scanAdb()
}

function localizeAdbError(result: AdbCommandResult) {
  if (result.errorCode === 'ERR_ADB_MISSING') {
    return '未检测到 ADB，请先下载或手动导入 ADB 后再连接设备。'
  }

  const detail = result.stderr || result.stdout || 'ADB 命令执行失败。'
  return detail.startsWith('连接错误') ? detail : `连接错误：${detail}`
}

function localizeApiError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message || fallback
  }

  return fallback
}

function formatCommandSuccess(prefix: string, stdout: string, suffix = '') {
  if (stdout) {
    return `${prefix} 原始信息：${stdout}`
  }

  return `${prefix}${suffix}`
}

async function loadEnvironment() {
  environmentLoading.value = true
  try {
    environment.value = await api<EnvironmentSelfCheck>('/api/system/environment/self-check')
  } finally {
    environmentLoading.value = false
  }
}

async function installAdb() {
  adbInstalling.value = true
  commandMessage.value = ''
  try {
    const result = await api<AdbInstallResult>('/api/system/resources/adb/install', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    commandMessage.value = result.ok ? 'ADB 已下载并安装到私有工具目录。' : result.message || 'ADB 下载失败，请检查网络或手动导入。'
    await loadEnvironment()
    if (result.ok) {
      await scanAdb()
    }
  } finally {
    adbInstalling.value = false
  }
}

async function runPair() {
  commandRunning.value = true
  commandMessage.value = ''
  try {
    const result = await api<AdbCommandResult>('/api/devices/adb/pair', {
      method: 'POST',
      body: JSON.stringify({ host: pairHost.value, port: pairPort.value, pairingCode: pairCode.value }),
    })
    commandMessage.value = result.success
      ? formatCommandSuccess('配对命令已执行。', result.stdout, '请使用无线调试主页面显示的 IP 和连接端口继续连接。')
      : localizeAdbError(result)
    await scanAdb()
  } catch (error) {
    commandMessage.value = localizeApiError(error, '连接错误：无线配对请求发送失败。')
  } finally {
    commandRunning.value = false
  }
}

async function runConnect() {
  commandRunning.value = true
  commandMessage.value = ''
  try {
    const result = await api<AdbCommandResult>('/api/devices/adb/connect', {
      method: 'POST',
      body: JSON.stringify({ host: tcpipHost.value, port: tcpipPort.value }),
    })
    commandMessage.value = result.success ? formatCommandSuccess('连接命令已执行。', result.stdout) : localizeAdbError(result)
    await scanAdb()
  } catch (error) {
    commandMessage.value = localizeApiError(error, '连接错误：无线连接请求发送失败。')
  } finally {
    commandRunning.value = false
  }
}

async function openConnect(mode: 'usb' | 'pair' | 'tcpip' = 'usb') {
  activeMode.value = mode
  showConnect.value = true
  await loadEnvironment()
  if (environment.value?.adb.exists) {
    await scanAdb()
  }
  stopScanTimer()
  scanTimer = window.setInterval(() => {
    if (showConnect.value && environment.value?.adb.exists) {
      devices.scanAdb().catch(() => undefined)
    }
  }, 5000)
}

function closeConnect() {
  showConnect.value = false
  stopScanTimer()
}

function stopScanTimer() {
  if (scanTimer !== undefined) {
    window.clearInterval(scanTimer)
    scanTimer = undefined
  }
}

onMounted(refreshAll)
onUnmounted(stopScanTimer)
</script>

<template>
  <section class="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">设备</h1>
        <p class="mt-1 text-sm text-slate-500">USB ADB、无线配对和 APK 在线状态统一显示在这里。</p>
      </div>
      <div class="flex gap-2">
        <button
          class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium transition-all duration-300 hover:border-sky-300 dark:border-slate-700 dark:bg-slate-900"
          @click="scanAdb"
        >
          <span class="icon-[solar--refresh-outline] size-5" />
          <span>{{ devices.scanning ? '扫描中' : '扫描 ADB' }}</span>
        </button>
        <button
          class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600"
          @click="openConnect('usb')"
        >
          <span class="icon-[solar--add-circle-outline] size-5" />
          <span>添加设备</span>
        </button>
      </div>
    </div>

    <div class="mb-4 grid gap-3 md:grid-cols-3">
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">ADB 已授权</span>
          <span class="icon-[solar--usb-outline] size-5 text-sky-500" />
        </div>
        <strong class="mt-2 block text-2xl">{{ connectedUsb.length }}</strong>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">等待授权</span>
          <span class="icon-[solar--shield-warning-outline] size-5 text-amber-500" />
        </div>
        <strong class="mt-2 block text-2xl">{{ unauthorizedUsb.length }}</strong>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">平台记录</span>
          <span class="icon-[solar--devices-outline] size-5 text-sky-500" />
        </div>
        <strong class="mt-2 block text-2xl">{{ devices.devices.length }}</strong>
      </div>
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-100 text-slate-500 dark:bg-slate-800">
          <tr>
            <th class="px-4 py-3">设备</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3">APK</th>
            <th class="px-4 py-3">ADB</th>
            <th class="px-4 py-3">更新时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="devices.devices.length === 0" class="border-t border-slate-100 dark:border-slate-800">
            <td colspan="5" class="px-4 py-10 text-center text-slate-500">
              <button class="text-sky-600 hover:underline dark:text-sky-300" @click="openConnect('usb')">添加第一台设备</button>
            </td>
          </tr>
          <tr v-for="device in devices.devices" :key="device.deviceId" class="border-t border-slate-100 dark:border-slate-800">
            <td class="px-4 py-3">
              <RouterLink class="font-medium text-sky-700 hover:underline dark:text-sky-300" :to="{ name: 'device-detail', params: { deviceId: device.deviceId } }">
                {{ device.model || device.deviceId }}
              </RouterLink>
              <div class="mt-1 text-xs text-slate-500">{{ device.deviceId }}</div>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="stateClass(device.displayState)">
                {{ t(`states.${device.displayState}`) }}
              </span>
            </td>
            <td class="px-4 py-3">{{ device.apkVersion || '-' }}</td>
            <td class="px-4 py-3">{{ device.temporaryAdbSerial || '-' }}</td>
            <td class="px-4 py-3 text-slate-500">{{ new Date(device.updatedAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showConnect" class="fixed inset-0 z-40 bg-slate-950/40 p-4 backdrop-blur-sm">
      <div class="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900">
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <span class="icon-[solar--devices-outline] size-6 text-sky-500" />
            <h2 class="text-base font-semibold">添加设备</h2>
          </div>
          <button class="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800" @click="closeConnect">
            <span class="icon-[solar--close-circle-outline] size-5" />
          </button>
        </div>

        <div
          v-if="environment && !environment.adb.exists"
          class="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="font-medium">未检测到 ADB，当前无法扫描、配对或连接设备。</div>
              <div class="mt-1 text-xs opacity-90">
                目标位置：{{ environment.adb.path }}。联网时可自动选择延迟最低的可用源；离线时请手动下载 Platform-Tools，并把 {{ environment.adb.manualInstall?.extractFrom ?? 'platform-tools' }} 目录内容放入 {{ environment.adb.manualInstall?.targetDirectory ?? '私有 ADB 工具目录' }}。
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <a
                  v-for="mirror in environment.adb.mirrors"
                  :key="mirror.url"
                  class="rounded-md bg-white/70 px-2.5 py-1 text-xs underline-offset-2 hover:underline dark:bg-slate-900/70"
                  :href="mirror.url"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ mirror.name }}{{ mirror.available ? ` · ${mirror.latencyMs}ms` : mirror.note ? ` · ${mirror.note}` : '' }}
                </a>
              </div>
              <div v-if="!environment.adb.supported" class="mt-2 text-xs">
                当前平台 {{ environment.adb.rid }} 没有官方独立 ADB zip。Linux arm64 建议使用系统软件源安装 android-sdk-platform-tools，或手动导入可信 adb。
              </div>
            </div>
            <button
              class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-amber-500 px-3 text-sm font-medium text-white transition-all duration-300 hover:bg-amber-600 disabled:opacity-60"
              :disabled="adbInstalling || environmentLoading || !environment.adb.supported"
              @click="installAdb"
            >
              <span class="icon-[solar--download-minimalistic-outline] size-4" />
              <span>{{ adbInstalling ? '下载中' : '自动下载 ADB' }}</span>
            </button>
          </div>
        </div>

        <div class="grid min-h-0 flex-1 lg:grid-cols-[260px_1fr]">
          <aside class="border-b border-slate-200 p-3 dark:border-slate-800 lg:border-b-0 lg:border-r">
            <button
              class="mb-2 flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-all duration-300"
              :class="activeMode === 'usb' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
              @click="activeMode = 'usb'"
            >
              <span class="icon-[solar--usb-outline] size-5" />
              <span>USB ADB</span>
            </button>
            <button
              class="mb-2 flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-all duration-300"
              :class="activeMode === 'pair' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
              @click="activeMode = 'pair'"
            >
              <span class="icon-[solar--wi-fi-router-outline] size-5" />
              <span>Android 11+ 无线配对</span>
            </button>
            <button
              class="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-all duration-300"
              :class="activeMode === 'tcpip' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'"
              @click="activeMode = 'tcpip'"
            >
              <span class="icon-[solar--smartphone-2-outline] size-5" />
              <span>旧版无线连接</span>
            </button>
          </aside>

          <div class="min-h-0 overflow-auto p-5">
            <div v-if="activeMode === 'usb'" class="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div class="space-y-4">
                <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 class="mb-3 font-semibold">USB ADB 连接</h3>
                  <ol class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    <li class="flex gap-3"><span class="font-semibold text-sky-600">1</span><span>在手机开发者选项中开启 USB 调试。</span></li>
                    <li class="flex gap-3"><span class="font-semibold text-sky-600">2</span><span>用数据线连接电脑和手机。</span></li>
                    <li class="flex gap-3"><span class="font-semibold text-sky-600">3</span><span>手机弹出授权时选择允许。</span></li>
                    <li class="flex gap-3"><span class="font-semibold text-sky-600">4</span><span>保持此窗口打开，平台会自动刷新 ADB 状态。</span></li>
                  </ol>
                </div>

                <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <div class="mb-3 flex items-center justify-between">
                    <h3 class="font-semibold">USB ADB 状态</h3>
                    <button class="inline-flex h-9 items-center gap-2 rounded-md bg-sky-500 px-3 text-sm text-white transition-all duration-300" @click="scanAdb">
                      <span class="icon-[solar--refresh-outline] size-4" />
                      <span>{{ devices.scanning ? '扫描中' : '刷新' }}</span>
                    </button>
                  </div>

                  <div v-if="!hasAnyScan" class="rounded-md bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-800">
                    等待首次扫描。
                  </div>

                  <div v-else-if="devices.adbScan && !devices.adbScan.success" class="rounded-md bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    {{ devices.adbScan.errorCode === 'ERR_ADB_MISSING' ? '未检测到私有 ADB，请先在环境自检中下载。' : devices.adbScan.stderr || 'ADB 扫描失败。' }}
                  </div>

                  <div v-else class="space-y-2">
                    <div
                      v-for="device in devices.adbScan?.devices"
                      :key="device.serial"
                      class="grid gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <div class="font-medium">{{ device.model || device.serial }}</div>
                        <div class="mt-1 text-xs text-slate-500">{{ device.serial }}</div>
                      </div>
                      <span
                        class="h-7 rounded-full px-2.5 py-1 text-xs font-medium"
                        :class="device.state === 'device' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : device.state === 'unauthorized' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'"
                      >
                        {{ adbStateText(device) }}
                      </span>
                    </div>

                    <div v-if="devices.adbScan?.devices.length === 0" class="rounded-md bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-800">
                      暂未发现 USB ADB 设备。
                    </div>
                  </div>
                </div>
              </div>

              <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 class="mb-3 font-semibold">等待连接</h3>
                <div class="space-y-3 text-sm">
                  <div class="flex items-center justify-between"><span>已授权设备</span><strong>{{ connectedUsb.length }}</strong></div>
                  <div class="flex items-center justify-between"><span>等待手机授权</span><strong>{{ unauthorizedUsb.length }}</strong></div>
                  <div class="flex items-center justify-between"><span>离线记录</span><strong>{{ offlineUsb.length }}</strong></div>
                  <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div class="h-full rounded-full bg-sky-500 transition-all" :style="{ width: connectedUsb.length > 0 ? '100%' : unauthorizedUsb.length > 0 ? '55%' : '20%' }" />
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeMode === 'pair'" class="space-y-4">
              <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 class="mb-3 font-semibold">Android 11+ 无线配对</h3>
                <div class="grid gap-3 md:grid-cols-3">
                  <input v-model="pairHost" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="IP 地址" />
                  <input v-model="pairPort" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="配对端口" />
                  <input v-model="pairCode" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="配对码" />
                </div>
                <button class="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 disabled:opacity-60" :disabled="commandRunning || !environment?.adb.exists" @click="runPair">
                  <span class="icon-[solar--wi-fi-router-outline] size-5" />
                  <span>开始配对</span>
                </button>
                <p v-if="commandMessage" class="mt-3 rounded-md bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ commandMessage }}</p>
              </div>
            </div>

            <div v-else class="space-y-4">
              <div class="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 class="mb-3 font-semibold">旧版 Android 无线连接</h3>
                <div class="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div class="grid gap-3 md:grid-cols-[1fr_120px]">
                    <input v-model="tcpipHost" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="手机 WiFi IP，例如 192.168.1.25" />
                    <input v-model="tcpipPort" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="端口" />
                  </div>
                  <button class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 disabled:opacity-60" :disabled="commandRunning || !environment?.adb.exists" @click="runConnect">
                    <span class="icon-[solar--link-circle-outline] size-5" />
                    <span>连接</span>
                  </button>
                </div>
                <p v-if="commandMessage" class="mt-3 rounded-md bg-slate-100 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">{{ commandMessage }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
