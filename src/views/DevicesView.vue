<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore, type AdbScanResponse, type AdbScannedDevice, type DeviceRecord } from '@/stores/devices'
import { ApiError, api } from '@/api/client'
import LiquidSelect from '@/components/LiquidSelect.vue'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()
const devices = useDeviceStore()
const showConnect = ref(false)
const activeMode = ref<'usb' | 'pair' | 'tcpip'>('usb')
const pairHost = ref('')
const pairPort = ref('')
const pairCode = ref('')
const pairConnectPort = ref('')
const tcpipHost = ref('')
const tcpipPort = ref('5555')
const commandRunning = ref(false)
const commandMessage = ref('')
const environmentLoading = ref(false)
const adbInstalling = ref(false)
const environment = ref<EnvironmentSelfCheck | null>(null)
const editingDeviceId = ref('')
const metadataSaving = ref(false)
const metadataForm = ref({ remark: '', group: '', tags: '' })
const searchText = ref('')
const groupFilter = ref('all')
const tagFilter = ref('all')
let scanTimer: ReturnType<typeof window.setInterval> | undefined

interface AdbCommandResult {
  success: boolean
  stdout: string
  stderr: string
  errorCode?: string
  requiresConnect?: boolean
  scan?: AdbScanResponse | null
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
  apk: {
    exists: boolean
    path: string
  }
}

interface AdbInstallResult {
  ok: boolean
  code?: string
  message?: string
}

const isWirelessAdb = (serial: string) => serial.includes(':') || serial.includes('_adb-tls-connect')
const alreadyAddedSerials = computed(() => new Set(devices.devices.map((d) => d.temporaryAdbSerial).filter(Boolean)))
const connectedUsb = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'device' && !isWirelessAdb(device.serial) && !alreadyAddedSerials.value.has(device.serial)))
const connectedWireless = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'device' && isWirelessAdb(device.serial) && !alreadyAddedSerials.value.has(device.serial)))
const unauthorizedUsb = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'unauthorized' && !isWirelessAdb(device.serial)))
const offlineUsb = computed(() => (devices.adbScan?.devices ?? []).filter((device) => device.state === 'offline'))
// Filtered scan list for USB ADB section: only USB devices, excluding already-added ones
const usbScanList = computed(() => (devices.adbScan?.devices ?? []).filter((device) => !isWirelessAdb(device.serial) && !alreadyAddedSerials.value.has(device.serial)))
const hasAnyScan = computed(() => Boolean(devices.adbScan))
const groups = computed(() => [...new Set(devices.devices.map((device) => device.group).filter(Boolean))] as string[])
const tags = computed(() => [...new Set(devices.devices.flatMap((device) => device.tags ?? []))])
const groupOptions = computed(() => [{ label: '全部分组', value: 'all' }, ...groups.value.map((group) => ({ label: group, value: group }))])
const tagOptions = computed(() => [{ label: '全部标签', value: 'all' }, ...tags.value.map((tag) => ({ label: tag, value: tag }))])
const filteredDevices = computed(() => {
  const keyword = searchText.value.trim().toLowerCase()
  return devices.devices.filter((device) => {
    const matchesGroup = groupFilter.value === 'all' || (device.group ?? '') === groupFilter.value
    const matchesTag = tagFilter.value === 'all' || (device.tags ?? []).includes(tagFilter.value)
    const haystack = [device.model, device.remark, device.deviceId, device.temporaryAdbSerial].filter(Boolean).join(' ').toLowerCase()
    return matchesGroup && matchesTag && (!keyword || haystack.includes(keyword))
  })
})

function stateClass(state: string) {
  if (state === 'Online') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (state === 'Authorized') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
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
  try {
    await devices.scanAdb()
  } catch {
    await devices.load()
  }
}

async function scanAdb() {
  await devices.scanAdb()
}

function applyAdbScan(scan?: AdbScanResponse | null) {
  if (!scan) return
  devices.adbScan = scan
  devices.devices = scan.records
}

function notify(message: string, type: 'success' | 'error' | 'info' = 'info', target?: string) {
  window.dispatchEvent(new CustomEvent('wad:notify', { detail: { message, type, target } }))
}

function beginEditDevice(device: DeviceRecord) {
  editingDeviceId.value = device.deviceId
  metadataForm.value = {
    remark: device.remark ?? '',
    group: device.group ?? '',
    tags: (device.tags ?? []).join(', '),
  }
}

const editingDevice = computed(() => devices.devices.find((item) => item.deviceId === editingDeviceId.value))

function cancelEditDevice() {
  editingDeviceId.value = ''
}

async function saveDeviceMetadata(deviceId: string) {
  metadataSaving.value = true
  try {
    await api<DeviceRecord>(`/api/devices/${encodeURIComponent(deviceId)}/metadata`, {
      method: 'PUT',
      body: JSON.stringify({
        remark: metadataForm.value.remark,
        group: metadataForm.value.group,
        tags: metadataForm.value.tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
      }),
    })
    await devices.load()
    editingDeviceId.value = ''
    notify('设备信息已保存。', 'success')
  } finally {
    metadataSaving.value = false
  }
}

async function deleteDevice(device: DeviceRecord) {
  if (!window.confirm(`删除设备记录：${device.remark || device.model || device.deviceId}？`)) return
  await api(`/api/devices/${encodeURIComponent(device.deviceId)}`, { method: 'DELETE' })
  await devices.load()
  notify('设备已删除。', 'success')
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
  const message = stdout.trim() ? `${prefix} 原始信息：${stdout.trim()}` : prefix
  return suffix ? `${message} ${suffix}` : message
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

async function installBundledApk(deviceId: string) {
  commandRunning.value = true
  try {
    const result = await api<AdbCommandResult>(`/api/devices/${encodeURIComponent(deviceId)}/apps/install-bundled`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (result.success) {
      notify(result.stdout?.includes('旧版 APK') ? '检测到旧版 APK，已自动替换并打开手机端引导页。' : '内置 APK 已安装，并已打开手机端引导页。', 'success')
    } else {
      notify(localizeAdbError(result), 'error', '/help#apk-cert')
    }
    await refreshAll()
  } catch (error) {
    notify(localizeApiError(error, '内置 APK 安装请求发送失败。'), 'error', '/help#install-apk')
  } finally {
    commandRunning.value = false
  }
}

async function runPair() {
  commandRunning.value = true
  commandMessage.value = ''
  try {
    const result = await api<AdbCommandResult>('/api/devices/adb/pair', {
      method: 'POST',
      body: JSON.stringify({ host: pairHost.value, port: pairPort.value, pairingCode: pairCode.value, connectPort: pairConnectPort.value }),
    })
    applyAdbScan(result.scan)
    if (!result.scan) {
      await scanAdb()
    }
    commandMessage.value = result.success
      ? result.requiresConnect
        ? formatCommandSuccess('配对已完成。', result.stdout, '还需要填写无线调试主页面显示的连接端口，然后点击“仅连接”。配对成功本身不会让设备出现在列表中。')
        : formatCommandSuccess('配对并连接已完成。', result.stdout)
      : localizeAdbError(result)
    checkForNewDevice()
  } catch (error) {
    commandMessage.value = localizeApiError(error, '连接错误：无线配对请求发送失败。')
  } finally {
    commandRunning.value = false
  }
}

async function runConnect() {
  await connectWireless(tcpipHost.value, tcpipPort.value, '连接命令已执行。')
}

async function runPairConnectOnly() {
  await connectWireless(pairHost.value, pairConnectPort.value, '连接命令已执行。')
}

async function connectWireless(host: string, port: string, successPrefix: string) {
  commandRunning.value = true
  commandMessage.value = ''
  try {
    const result = await api<AdbCommandResult>('/api/devices/adb/connect', {
      method: 'POST',
      body: JSON.stringify({ host, port }),
    })
    applyAdbScan(result.scan)
    if (!result.scan) {
      await scanAdb()
    }
    commandMessage.value = result.success ? formatCommandSuccess(successPrefix, result.stdout) : localizeAdbError(result)
    checkForNewDevice()
  } catch (error) {
    commandMessage.value = localizeApiError(error, '连接错误：无线连接请求发送失败。')
  } finally {
    commandRunning.value = false
  }
}

let lastDeviceCountBeforeOperation = 0

function checkForNewDevice() {
  const currentDevices = devices.adbScan?.devices ?? []
  const newAuthorized = currentDevices.filter((d) => d.state === 'device')
  if (newAuthorized.length > lastDeviceCountBeforeOperation) {
    const newDevice = newAuthorized[newAuthorized.length - 1]
    notify(`已添加设备：${newDevice.model || newDevice.serial}`, 'success', `/devices/${encodeURIComponent(`adb:${newDevice.serial}`)}`)
    closeConnect()
  }
}

// Save device count before operations for comparison
async function openConnect(mode: 'usb' | 'pair' | 'tcpip' = 'usb') {
  activeMode.value = mode
  showConnect.value = true
  await loadEnvironment()
  if (environment.value?.adb.exists) {
    await scanAdb()
    lastDeviceCountBeforeOperation = (devices.adbScan?.devices ?? []).filter((d) => d.state === 'device').length
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
  <section class="flex h-full min-h-0 flex-col overflow-hidden text-slate-950 dark:text-slate-100">
    <PageHeader>
      <h1 class="text-xl font-semibold">设备</h1>
      <p class="mt-1 text-sm text-slate-500">USB ADB、无线配对和 APK 在线状态统一显示在这里。</p>
      <template #actions>
        <button class="glass-button" @click="scanAdb">
          <span class="icon-[solar--refresh-bold-duotone] size-5" />
          <span>{{ devices.scanning ? '扫描中' : '扫描 ADB' }}</span>
        </button>
        <button class="glass-button glass-button-primary" @click="openConnect('usb')">
          <span class="icon-[solar--add-circle-bold-duotone] size-5" />
          <span>添加设备</span>
        </button>
      </template>
    </PageHeader>

    <!-- Scrollable content -->
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">

    <div class="glass-panel mb-4 grid gap-3 p-3 lg:grid-cols-[1fr_180px_180px]">
      <input v-model="searchText" class="glass-input" placeholder="搜索设备名称、备注、ADB serial" />
      <LiquidSelect v-model="groupFilter" :options="groupOptions" />
      <LiquidSelect v-model="tagFilter" :options="tagOptions" />
    </div>

    <div class="mb-4 grid gap-3 md:grid-cols-3">
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">ADB 已授权</span>
          <span class="icon-[solar--usb-outline] size-5 text-sky-500" />
        </div>
        <strong class="mt-2 block text-2xl">{{ connectedUsb.length }}</strong>
        <div class="mt-1 text-xs text-slate-500">无线 ADB：{{ connectedWireless.length }}</div>
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

    <!-- Mobile card layout -->
    <div class="lg:hidden">
      <div v-if="filteredDevices.length === 0" class="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <button class="text-sky-600 hover:underline dark:text-sky-300" @click="openConnect('usb')">{{ devices.devices.length === 0 ? '添加第一台设备' : '没有符合筛选的设备' }}</button>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="device in filteredDevices"
          :key="device.deviceId"
          class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <!-- Card header: name + status -->
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <RouterLink class="font-medium text-sky-700 hover:underline dark:text-sky-300" :to="{ name: 'device-detail', params: { deviceId: device.deviceId } }">
                {{ device.remark || device.model || device.deviceId }}
              </RouterLink>
              <div class="mt-1 text-xs text-slate-500 truncate">{{ device.deviceId }}</div>
            </div>
            <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" :class="stateClass(device.displayState)">
              {{ t(`states.${device.displayState}`) }}
            </span>
          </div>

          <!-- Card details -->
          <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <span class="text-slate-500">分组</span>
              <div class="mt-0.5 font-medium">{{ device.group || '未分组' }}</div>
            </div>
            <div>
              <span class="text-slate-500">APK</span>
              <div class="mt-0.5 font-medium">{{ device.apkVersion || '-' }}</div>
            </div>
            <div class="col-span-2">
              <span class="text-slate-500">ADB</span>
              <div class="mt-0.5 font-medium truncate">{{ device.temporaryAdbSerial || '-' }}</div>
            </div>
          </div>

          <!-- Tags -->
          <div v-if="(device.tags ?? []).length > 0" class="mt-2 flex flex-wrap gap-1">
            <span v-for="tag in device.tags" :key="tag" class="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-200">{{ tag }}</span>
          </div>

          <!-- Card footer: time + actions -->
          <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <span class="text-xs text-slate-400">{{ new Date(device.updatedAt).toLocaleDateString() }}</span>
            <div class="flex gap-2">
              <button class="icon-button text-slate-600 dark:text-slate-300" title="编辑设备信息" @click="beginEditDevice(device)">
                <span class="icon-[solar--pen-new-square-bold-duotone] size-5" />
              </button>
              <button class="icon-button text-rose-600" title="删除设备" @click="deleteDevice(device)">
                <span class="icon-[solar--trash-bin-trash-bold-duotone] size-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop table layout -->
    <div class="hidden overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-100 text-slate-500 dark:bg-slate-800">
          <tr>
            <th class="px-4 py-3">设备</th>
            <th class="px-4 py-3">备注/分组</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3">APK</th>
            <th class="px-4 py-3">ADB</th>
            <th class="px-4 py-3">更新时间</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredDevices.length === 0" class="border-t border-slate-100 dark:border-slate-800">
            <td colspan="7" class="px-4 py-10 text-center text-slate-500">
              <button class="text-sky-600 hover:underline dark:text-sky-300" @click="openConnect('usb')">{{ devices.devices.length === 0 ? '添加第一台设备' : '没有符合筛选的设备' }}</button>
            </td>
          </tr>
          <tr v-for="device in filteredDevices" :key="device.deviceId" class="border-t border-slate-100 dark:border-slate-800">
            <td class="px-4 py-3">
              <RouterLink class="font-medium text-sky-700 hover:underline dark:text-sky-300" :to="{ name: 'device-detail', params: { deviceId: device.deviceId } }">
                {{ device.remark || device.model || device.deviceId }}
              </RouterLink>
              <div class="mt-1 text-xs text-slate-500">{{ device.deviceId }}</div>
            </td>
            <td class="px-4 py-3">
              <div>
                <div class="text-sm text-slate-700 dark:text-slate-200">{{ device.group || '未分组' }}</div>
                <div class="mt-1 flex max-w-[260px] flex-wrap gap-1">
                  <span v-for="tag in device.tags ?? []" :key="tag" class="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950 dark:text-sky-200">{{ tag }}</span>
                  <span v-if="!(device.tags ?? []).length && !device.remark" class="text-xs text-slate-400">未设置</span>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="stateClass(device.displayState)">
                {{ t(`states.${device.displayState}`) }}
              </span>
            </td>
            <td class="px-4 py-3">{{ device.apkVersion || '-' }}</td>
            <td class="px-4 py-3">{{ device.temporaryAdbSerial || '-' }}</td>
            <td class="px-4 py-3 text-slate-500">{{ new Date(device.updatedAt).toLocaleString() }}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex justify-end gap-2">
                <button class="icon-button text-slate-600 dark:text-slate-300" title="编辑设备信息" @click="beginEditDevice(device)">
                  <span class="icon-[solar--pen-new-square-bold-duotone] size-5" />
                </button>
                <button class="icon-button text-rose-600" title="删除设备" @click="deleteDevice(device)">
                  <span class="icon-[solar--trash-bin-trash-bold-duotone] size-5" />
                </button>
              </div>
             </td>
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

        <div class="border-b border-sky-200 bg-sky-50/80 px-5 py-3 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/70 dark:text-sky-100">
          伴侣APK：
          <span class="font-medium">伴侣APK会自动安装在连接ADB的设备上。</span>
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
                      v-for="device in usbScanList"
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
                      <button
                        v-if="device.state === 'device'"
                        class="h-8 rounded-md bg-sky-500 px-3 text-xs font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60 sm:col-span-2 sm:w-fit"
                        :disabled="commandRunning || !environment?.apk.exists"
                        @click="installBundledApk(`adb:${device.serial}`)"
                      >
                        安装伴侣APK
                      </button>
                    </div>

                    <div v-if="usbScanList.length === 0" class="rounded-md bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-800">
                      暂未发现新的 USB ADB 设备。
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
                <div class="grid gap-3 md:grid-cols-[1fr_120px_120px_120px]">
                  <input v-model="pairHost" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="IP 地址" />
                  <input v-model="pairPort" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="配对端口" />
                  <input v-model="pairCode" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="配对码" />
                  <input v-model="pairConnectPort" class="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="连接端口" />
                </div>
                <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  配对端口来自“使用配对码配对”弹窗；连接端口来自“无线调试”主页面，两个端口通常不同。只有连接完成后，设备才会出现在列表中。
                </p>
                <div class="mt-4 flex flex-wrap gap-3">
                  <button class="inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-300 hover:bg-sky-600 disabled:opacity-60" :disabled="commandRunning || !environment?.adb.exists" @click="runPair">
                    <span class="icon-[solar--wi-fi-router-outline] size-5" />
                    <span>{{ pairConnectPort ? '配对并连接' : '开始配对' }}</span>
                  </button>
                  <button class="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-all duration-300 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-800 dark:hover:bg-sky-950" :disabled="commandRunning || !environment?.adb.exists || !pairHost || !pairConnectPort" @click="runPairConnectOnly">
                    <span class="icon-[solar--link-circle-outline] size-5" />
                    <span>仅连接</span>
                  </button>
                </div>
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

    <div v-if="editingDevice" class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div class="glass-panel w-full max-w-xl p-5">
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="font-semibold">编辑设备信息</h2>
          <button class="icon-button" @click="cancelEditDevice">
            <span class="icon-[solar--close-circle-bold-duotone] size-5" />
          </button>
        </div>
        <div class="grid gap-3">
          <label class="grid gap-2 text-sm">
            <span class="font-medium">备注</span>
            <input v-model="metadataForm.remark" class="glass-input" placeholder="例如：测试机 A / 小米 14" />
          </label>
          <label class="grid gap-2 text-sm">
            <span class="font-medium">分组</span>
            <input v-model="metadataForm.group" class="glass-input" placeholder="例如：测试组 / 运营组" />
          </label>
          <label class="grid gap-2 text-sm">
            <span class="font-medium">标签</span>
            <input v-model="metadataForm.tags" class="glass-input" placeholder="多个标签用逗号分隔" />
          </label>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="glass-button" @click="cancelEditDevice">取消</button>
          <button class="glass-button glass-button-primary" :disabled="metadataSaving" @click="saveDeviceMetadata(editingDevice.deviceId)">保存</button>
        </div>
      </div>
    </div>
    </div><!-- end scrollable content -->
  </section>
</template>
