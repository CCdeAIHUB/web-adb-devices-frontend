<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ApiError, api } from '@/api/client'
import { useDeviceStore } from '@/stores/devices'
import LiquidSelect from '@/components/LiquidSelect.vue'
import PageHeader from '@/components/PageHeader.vue'

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

interface SaveFilePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<{ createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }> }>
}

const route = useRoute()
const devices = useDeviceStore()
const deviceId = computed(() => String(route.params.deviceId ?? ''))
const device = computed(() => devices.devices.find((item) => item.deviceId === deviceId.value))
const canUseAdb = computed(() => Boolean(device.value?.temporaryAdbSerial || deviceId.value.startsWith('adb:')))
const canUseApk = computed(() => device.value?.internalState === 'Online' || device.value?.internalState === 'PermissionRequired')
const permissionRows = computed(() => [
  { key: 'accessibility', label: '无障碍服务', enabled: Boolean(device.value?.permissions?.accessibility) },
  { key: 'inputMethod', label: '输入法', enabled: Boolean(device.value?.permissions?.inputMethod) },
  { key: 'notifications', label: '通知权限', enabled: Boolean(device.value?.permissions?.notifications) },
  { key: 'batteryUnrestricted', label: '后台运行', enabled: Boolean(device.value?.permissions?.batteryUnrestricted) },
])
const missingPermissionNames = computed(() => permissionRows.value.filter((item) => !item.enabled).map((item) => item.label))

// Dynamic placeholder text for screen area
const screenPlaceholderText = computed(() => {
  if (canUseApk.value && !canUseAdb.value) return '等待 ADB 连接以启用完整控制。'
  if (!canUseAdb.value && !canUseApk.value) return '等待设备连接或安装 APK。'
  if (device.value?.apkVersion && device.value.internalState === 'PermissionRequired') return '请在手机上完成权限配置。'
  if (!device.value?.apkVersion) return '请先安装 APK 以获取实时控制能力。'
  return '正在获取屏幕画面...'
})

// Fullscreen state for screen control
const isFullscreen = ref(false)
const screenContainerRef = ref<HTMLElement | null>(null)
const transportMode = ref<'tcp' | 'udp'>('tcp')
const streamInterval = ref('1200') // ms between screenshot refreshes
const streamQuality = ref<'png' | 'jpeg'>('png')

const streamIntervalOptions = [
  { label: '低频 (2s)', value: '2000' },
  { label: '标准 (1.2s)', value: '1200' },
  { label: '流畅 (0.6s)', value: '600' },
  { label: '极速 (0.3s)', value: '300' },
]

function toggleFullscreen() {
  const el = screenContainerRef.value
  if (!el) return
  if (!document.fullscreenElement) {
    el.requestFullscreen().then(() => { isFullscreen.value = true }).catch(() => {})
  } else {
    document.exitFullscreen().then(() => { isFullscreen.value = false }).catch(() => {})
  }
}

function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', handleFullscreenChange)
}

const activeTab = ref<'control' | 'terminal' | 'apps' | 'files' | 'hardware' | 'system' | 'power'>('control')
const screenshotUrl = ref('')
const streaming = ref(false)
const controlEnabled = ref(false)
const bundledApkInstalled = ref(false)
const busy = ref(false)
const message = ref('')
const installingApk = ref(false)
const installingApkName = ref('')
const showPermissionBanner = ref(false)
const inputText = ref('')
const pointerDown = ref<{ x: number; y: number; time: number } | null>(null)
const liveScreen = ref({ width: 1080, height: 2400 })
let refreshTimer: ReturnType<typeof window.setInterval> | undefined

const terminalCommand = ref('shell getprop ro.product.model')
const terminalOutput = ref('')
const packages = ref<PackageItem[]>([])
const packageScope = ref<'all' | 'user' | 'system'>('all')
const packageScopeOptions = [
  { label: '全部软件', value: 'all' },
  { label: '用户软件', value: 'user' },
  { label: '系统软件', value: 'system' },
]
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
  // Use device record's resolution first (updated via heartbeat), fallback to live screenshot dimensions
  const w = device.value?.screenWidth || liveScreen.value.width || 1080
  const h = device.value?.screenHeight || liveScreen.value.height || 2400
  return { width: w, height: h }
})
const isLandscape = computed(() => screenSize.value.width > screenSize.value.height)
const filteredPackages = computed(() => {
  const keyword = packageFilter.value.trim().toLowerCase()
  return keyword ? packages.value.filter((item) => item.packageName.toLowerCase().includes(keyword)) : packages.value
})

const tabs = [
  ['control', '手机控制', 'icon-[solar--smartphone-2-outline]'],
  ['terminal', 'ADB 终端', 'icon-[solar--code-square-outline]'],
  ['apps', '软件管理', 'icon-[solar--widget-outline]'],
  ['files', '文件管理', 'icon-[solar--folder-with-files-outline]'],
  ['hardware', '硬件信息', 'icon-[solar--cpu-outline]'],
  ['system', '系统界面', 'icon-[solar--tuning-2-outline]'],
  ['power', '快速重启', 'icon-[solar--restart-outline]'],
] as const

function tabDisabled(key: string) {
  if (key === 'control' || key === 'terminal' || key === 'apps' || key === 'files' || key === 'hardware' || key === 'system' || key === 'power') {
    return !canUseAdb.value
  }
  return false
}

const quickKeys = [
  ['电源', 26, 'icon-[solar--power-bold-duotone]'],
  ['音量+', 24, 'icon-[solar--volume-loud-bold-duotone]'],
  ['音量-', 25, 'icon-[solar--volume-small-bold-duotone]'],
  ['截图', 'screenshot', 'icon-[solar--camera-bold-duotone]'],
  ['返回', 4, 'icon-[solar--undo-left-round-bold-duotone]'],
  ['主页', 3, 'icon-[solar--home-2-bold-duotone]'],
  ['任务', 187, 'icon-[solar--widget-5-bold-duotone]'],
] as const

const settingGroups = [
  {
    title: '连接',
    items: [
      ['无线网络', 'wifi', 'icon-[solar--wi-fi-router-bold-duotone]'],
      ['蓝牙', 'bluetooth', 'icon-[solar--bluetooth-bold-duotone]'],
      ['飞行模式', 'airplane', 'icon-[solar--airbuds-case-open-bold-duotone]'],
    ],
  },
  {
    title: '显示与输入',
    items: [
      ['显示', 'display', 'icon-[solar--monitor-bold-duotone]'],
      ['无障碍', 'accessibility', 'icon-[solar--accessibility-bold-duotone]'],
      ['输入法', 'input', 'icon-[solar--keyboard-bold-duotone]'],
      ['语言', 'locale', 'icon-[solar--translation-bold-duotone]'],
    ],
  },
  {
    title: '系统',
    items: [
      ['系统设置', 'settings', 'icon-[solar--settings-bold-duotone]'],
      ['开发者选项', 'developer', 'icon-[solar--code-square-bold-duotone]'],
      ['应用管理', 'apps', 'icon-[solar--widget-bold-duotone]'],
      ['省电', 'battery', 'icon-[solar--battery-charge-bold-duotone]'],
      ['通知', 'notification', 'icon-[solar--bell-bold-duotone]'],
      ['安全', 'security', 'icon-[solar--shield-check-bold-duotone]'],
    ],
  },
] as const

const statusIconOptions = [
  ['time', '时间'], ['location', '定位'], ['headset', '耳机'], ['cast', '投射'],
  ['alarm', '闹钟'], ['sound', '声音'], ['signal', '信号'], ['airplane', '飞行'],
  ['bluetooth', '蓝牙'], ['battery', '电池'], ['wifi', '无线'], ['seconds', '显秒'],
  ['nfc', 'NFC'], ['rotateSuggestion', '左下角旋转提示'],
] as const

const powerActions = [
  ['reboot', '重启', 'icon-[solar--restart-bold-duotone]'],
  ['fastboot', 'Fastboot', 'icon-[solar--usb-bold-duotone]'],
  ['edl', 'EDL', 'icon-[solar--danger-triangle-bold-duotone]'],
  ['shutdown', '关机', 'icon-[solar--power-bold-duotone]'],
  ['fastbootd', 'fastbootd', 'icon-[solar--smartphone-update-bold-duotone]'],
  ['recovery', 'Recovery', 'icon-[solar--shield-warning-bold-duotone]'],
] as const

function controlUrl(path: string) {
  return `/api/devices/${encodeURIComponent(deviceId.value)}/${path}`
}

function reportError(error: unknown, fallback: string) {
  message.value = error instanceof ApiError ? error.message : fallback
}

function notify(message: string, type: 'success' | 'error' | 'info' = 'info', target?: string) {
  window.dispatchEvent(new CustomEvent('wad:notify', { detail: { message, type, target } }))
}

function refreshScreenshot() {
  if (!canUseAdb.value) {
    message.value = '该设备还没有可用的 ADB serial，无法获取屏幕。'
    return
  }
  const format = streamQuality.value === 'jpeg' ? '&format=jpeg' : ''
  screenshotUrl.value = `${controlUrl('control/screenshot')}?t=${Date.now()}${format}`
}

async function saveScreenshot() {
  if (!canUseAdb.value) return
  try {
    const response = await fetch(controlUrl('control/screenshot'), { credentials: 'include' })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.message || '截图请求失败')
    }
    const blob = await response.blob()
    if (blob.size < 8 || !blob.type.includes('png')) throw new Error('设备没有返回有效截图，请确认屏幕已解锁且 ADB 在线。')
    const fileName = `${device.value?.model || deviceId.value}-screenshot-${Date.now()}.png`
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker
    if (picker) {
      const handle = await picker({ suggestedName: fileName, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
    } else {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url)
    }
    notify('截图已保存。', 'success')
  } catch (error) {
    notify(error instanceof Error ? error.message : '截图保存失败，请确认设备 ADB 已连接。', 'error', '/help#adb-auth')
  }
}

function onScreenLoaded(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    liveScreen.value = { width: image.naturalWidth, height: image.naturalHeight }
  }
}

const isInitialLoad = ref(true)

function onScreenError() {
  screenshotUrl.value = ''
  if (streaming.value) {
    message.value = '实时画面传输失败：设备没有返回有效画面，请确认屏幕已解锁且 ADB 在线。'
  } else {
    message.value = '截图加载失败：设备没有返回有效画面，请确认屏幕已解锁且 ADB 在线。'
  }
  // Only notify on user-triggered refresh, not on initial page load
  if (!isInitialLoad.value) {
    notify(message.value, 'error', '/help#adb-auth')
  }
}

function startStream() {
  streaming.value = true
  refreshScreenshot()
  stopTimer()
  refreshTimer = window.setInterval(refreshScreenshot, parseInt(streamInterval.value))
}

// Restart stream timer when interval changes during streaming
watch(streamInterval, (newVal) => {
  if (streaming.value) {
    stopTimer()
    refreshTimer = window.setInterval(refreshScreenshot, parseInt(newVal))
  }
})

function stopStream() {
  streaming.value = false
  stopTimer()
}

function stopTimer() {
  if (refreshTimer !== undefined) { clearInterval(refreshTimer); refreshTimer = undefined }
}

function pointFromEvent(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  return {
    x: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * screenSize.value.width),
    y: Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * screenSize.value.height),
  }
}

function onPointerDown(event: PointerEvent) {
  if (!controlEnabled.value || !canUseAdb.value) return
  pointerDown.value = { ...pointFromEvent(event), time: Date.now() }
}

async function onPointerUp(event: PointerEvent) {
  if (!controlEnabled.value || !canUseAdb.value || !pointerDown.value) return
  const start = pointerDown.value; pointerDown.value = null
  const end = pointFromEvent(event)
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  if (distance < 18) { await sendControl('tap', { x: end.x, y: end.y }, '点击已发送。'); return }
  await sendControl('swipe', { fromX: start.x, fromY: start.y, toX: end.x, toY: end.y, durationMs: Math.max(120, Date.now() - start.time) }, '滑动已发送。')
}

async function sendControl(action: string, body: object, successText: string) {
  busy.value = true; message.value = ''
  try {
    const result = await api<AdbCommandResult>(controlUrl(`control/${action}`), { method: 'POST', body: JSON.stringify(body) })
    message.value = result.success ? successText : `控制失败：${result.stderr || result.stdout || 'ADB 命令执行失败。'}`
    if (streaming.value) refreshScreenshot()
  } catch (error) { reportError(error, '控制请求发送失败。') }
  finally { busy.value = false }
}

async function sendKey(keyCode: number | string) {
  if (keyCode === 'screenshot') { saveScreenshot(); return }
  await sendControl('keyevent', { keyCode: keyCode as number }, '按键已发送。')
}

async function sendText() {
  if (!inputText.value.trim()) { message.value = '请输入要发送到手机的文本。'; return }
  if (canUseApk.value && !device.value?.permissions?.inputMethod) {
    message.value = '请先在手机上开启并启用伴侣APK输入法，然后重试。'
    notify(message.value, 'error')
    return
  }
  await sendControl('text', { text: inputText.value }, '文本已发送。')
}

async function openSetting(target: string) { await sendControl('open-setting', { target }, '设置页已打开。') }

async function runTerminal() {
  busy.value = true
  try {
    const result = await api<AdbCommandResult>(controlUrl('terminal'), { method: 'POST', body: JSON.stringify({ command: terminalCommand.value }) })
    terminalOutput.value = [result.stdout, result.stderr].filter(Boolean).join('\n') || (result.success ? '命令已执行，无输出。' : '命令执行失败。')
  } catch (error) { terminalOutput.value = error instanceof ApiError ? error.message : '终端命令发送失败。' }
  finally { busy.value = false }
}

async function loadPackages() {
  busy.value = true
  try { packages.value = (await api<{ packages: PackageItem[] }>(controlUrl(`apps?scope=${packageScope.value}`))).packages }
  catch (error) { reportError(error, '软件包列表读取失败。') }
  finally { busy.value = false }
}

async function appAction(action: string, packageName = selectedPackage.value) {
  if (!packageName) { message.value = '请先选择软件包。'; return }
  busy.value = true
  try {
    const result = await api<AdbCommandResult>(controlUrl('apps/action'), { method: 'POST', body: JSON.stringify({ packageName, action }) })
    if (action === 'info') appInfo.value = result.stdout || result.stderr || '没有返回软件信息。'
    else { message.value = result.success ? '软件操作已执行。' : `软件操作失败：${result.stderr || result.stdout}`; await loadPackages() }
  } catch (error) { reportError(error, '软件操作请求失败。') }
  finally { busy.value = false }
}

function extractApk(packageName = selectedPackage.value) {
  if (!packageName) { message.value = '请先选择软件包。'; return }
  window.open(controlUrl(`apps/${encodeURIComponent(packageName)}/apk`), '_blank')
}

async function installApk(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  installingApk.value = true; installingApkName.value = file.name; busy.value = true
  const form = new FormData(); form.append('file', file)
  try {
    const response = await fetch(controlUrl('apps/install'), { method: 'POST', credentials: 'include', body: form })
    const body = await response.json()
    message.value = body.success ? 'APK 已安装。' : body.message || body.stderr || 'APK 安装失败。'
    notify(message.value, body.success ? 'success' : 'error'); await loadPackages()
  } finally { busy.value = false; installingApk.value = false; installingApkName.value = ''; input.value = '' }
}

async function installBundledApk() {
  installingApk.value = true; installingApkName.value = '内置 APK'; busy.value = true
  try {
    const result = await api<AdbCommandResult>(controlUrl('apps/install-bundled'), { method: 'POST', body: JSON.stringify({}) })
    bundledApkInstalled.value = result.success
    message.value = result.success ? (result.stdout?.includes('旧版 APK') ? '检测到旧版 APK，已自动替换并打开手机端引导页。请在手机上确认权限。' : '内置 APK 已安装，并已打开手机端引导页。请在手机上开启所需权限。') : result.stderr || result.stdout || '内置 APK 安装失败。'
    notify(message.value, result.success ? 'success' : 'error', result.success ? undefined : '/help#apk-cert'); await loadPackages()
  } catch (error) { reportError(error, '内置 APK 安装请求失败。'); notify(message.value, 'error', '/help#install-apk') }
  finally { busy.value = false; installingApk.value = false; installingApkName.value = '' }
}

async function loadFiles(path = currentPath.value) {
  busy.value = true
  try { const r = await api<{ path: string; entries: FileEntry[] }>(controlUrl(`files?path=${encodeURIComponent(path)}`)); currentPath.value = r.path; fileEntries.value = r.entries }
  catch (error) { reportError(error, '文件列表读取失败。') }
  finally { busy.value = false }
}
function enterFile(entry: FileEntry) { if (entry.type !== 'directory') return; loadFiles(`${currentPath.value.endsWith('/') ? currentPath.value.slice(0, -1) : currentPath.value}/${entry.name}`) }
function parentPath() { if (currentPath.value === '/sdcard') return; const n = currentPath.value.replace(/\/$/, '').split('/').slice(0, -1).join('/') || '/sdcard'; loadFiles(n.startsWith('/sdcard') ? n : '/sdcard') }
function downloadFile(entry: FileEntry) { const b = currentPath.value.endsWith('/') ? currentPath.value : `${currentPath.value}/`; window.open(controlUrl(`files/download?path=${encodeURIComponent(`${b}/${entry.name}`)}`), '_blank') }

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement; const f = input.files?.[0]; if (!f) return
  const form = new FormData(); form.append('path', currentPath.value.endsWith('/') ? currentPath.value : `${currentPath.value}/`); form.append('file', f); busy.value = true
  try { const r = await fetch(controlUrl('files/upload'), { method: 'POST', credentials: 'include', body: form }); const b = await r.json(); message.value = b.success ? '文件已发送。' : b.message || b.stderr || '文件发送失败。'; await loadFiles() }
  finally { busy.value = false; input.value = '' }
}

async function loadHardware() { busy.value = true; try { hardware.value = await api<HardwareInfo>(controlUrl('hardware')) } catch (error) { reportError(error, '硬件信息读取失败。') } finally { busy.value = false } }
async function saveStatusIcons() { await postSimple('system-ui/status-icons', { hiddenIcons: hiddenIcons.value }, '状态栏图标设置已发送。') }
async function saveQuickSettings() { await postSimple('system-ui/quick-settings', { collapsedTileCount: collapsedTileCount.value, iconTopPadding: iconTopPadding.value }, '快捷设置布局命令已发送。') }
async function powerAction(action: string) { await postSimple('power', { action }, '电源命令已发送。') }

async function postSimple(path: string, body: object, successText: string) {
  busy.value = true
  try { const r = await api<AdbCommandResult>(controlUrl(path), { method: 'POST', body: JSON.stringify(body) }); message.value = r.success ? successText : `命令失败：${r.stderr || r.stdout}` }
  catch (error) { reportError(error, '命令发送失败。') }
  finally { busy.value = false }
}

onMounted(async () => {
  await devices.load()
  startPermissionPolling()
  startDeviceStatePolling()
  if (canUseAdb.value) {
    // Only auto-start streaming when both ADB and APK are connected
    if (canUseAdb.value && canUseApk.value) {
      startStream()
    }
    // Auto-detect and install APK if needed
    await autoDetectAndInstallApk()
    // Mark initial load complete after a short delay to allow screenshot to load
    setTimeout(() => { isInitialLoad.value = false }, 2000)
  } else {
    isInitialLoad.value = false
  }
})

async function autoDetectAndInstallApk() {
  // If device already has APK online or no ADB, skip
  if (device.value?.apkVersion || !canUseAdb.value) return
  
  try {
    // Check if APK is installed on device via ADB
    const result = await api<AdbCommandResult>(controlUrl('apps/check-apk'), { method: 'POST', body: JSON.stringify({}) })
    if (result.success && result.stdout) {
      // APK exists on device - version info in stdout, update will be handled by heartbeat
      return
    }
    // APK not found - auto install silently
    await installBundledApk()
  } catch {
    // Silently fail - user can manually install via banner
  }
}

onUnmounted(() => { stopTimer(); stopPermissionTimer(); stopDeviceStatePolling(); document.removeEventListener('fullscreenchange', handleFullscreenChange) })

let deviceStateTimer: ReturnType<typeof window.setInterval> | undefined
function startDeviceStatePolling() {
  if (deviceStateTimer) return
  // Poll device state every 10 seconds to detect ADB disconnections
  deviceStateTimer = window.setInterval(async () => {
    try {
      // Re-scan ADB to detect disconnections, then reload
      await devices.scanAdb()
    } catch { /* silent */ }
  }, 10000)
}
function stopDeviceStatePolling() {
  if (deviceStateTimer !== undefined) { clearInterval(deviceStateTimer); deviceStateTimer = undefined }
}

// Watch for device state changes - stop streaming if ADB disconnects
watch(() => device.value?.displayState, (newState) => {
  if (newState === 'Offline' && streaming.value) {
    stopStream()
  }
})

let permissionTimer: ReturnType<typeof window.setInterval> | undefined
function startPermissionPolling() {
  if (permissionTimer) return
  // Periodically refresh device state to pick up permission changes from APK heartbeat
  // Also check input method via ADB since APK only sends permission state on initial connect
  permissionTimer = window.setInterval(async () => {
    if (!device.value?.apkVersion) return
    try {
      // Refresh the device list to get updated permission state from APK
      await devices.load()
      // Also check input method via ADB command for more reliable detection
      if (canUseAdb.value) {
        const result = await api<AdbCommandResult>(controlUrl('terminal'), {
          method: 'POST',
          body: JSON.stringify({ command: 'shell settings get secure enabled_input_methods' }),
        })
        if (result.success && result.stdout) {
          const apkPackage = 'com.webadb.devices'
          const hasIme = result.stdout.toLowerCase().includes(apkPackage)
          // Update local device permission state if different
          if (device.value && device.value.permissions && device.value.permissions.inputMethod !== hasIme) {
            device.value.permissions.inputMethod = hasIme
          }
        }
      }
      const allGranted = permissionRows.value.every(item => item.enabled)
      if (allGranted && showPermissionBanner.value) { showPermissionBanner.value = false; notify('所有权限已配置完成！', 'success'); stopPermissionTimer() }
      else if (!allGranted && device.value?.internalState === 'Online' && !showPermissionBanner.value) {
        setTimeout(() => { if (!permissionRows.value.every(item => item.enabled)) showPermissionBanner.value = true }, 3000)
      }
    } catch { /* silent */ }
  }, 5000)
}
function stopPermissionTimer() { if (permissionTimer !== undefined) { clearInterval(permissionTimer); permissionTimer = undefined } }
</script>

<template>
  <section class="flex min-h-[calc(100vh-8rem)] flex-col text-slate-950 dark:text-slate-100">
    <!-- Fixed header area -->
    <div class="shrink-0">
      <PageHeader>
        <RouterLink class="mb-1 inline-flex items-center gap-2 text-sm text-sky-700 hover:underline dark:text-sky-300" to="/devices">
          <span class="icon-[solar--alt-arrow-left-outline] size-4" />
          <span>返回设备列表</span>
        </RouterLink>
        <h1 class="text-xl font-semibold">{{ device?.model || deviceId }}</h1>
        <p class="mt-1 text-sm text-slate-500">
          {{ device?.temporaryAdbSerial || '暂无 ADB serial' }} · {{ device?.displayState || '未知状态' }} · {{ screenSize.width }} x {{ screenSize.height }}
        </p>
        <template #actions>
          <button class="glass-button hover:border-sky-300 hover:text-sky-700 dark:hover:border-sky-600 dark:hover:text-sky-300 transition-all duration-200" :disabled="!canUseAdb" @click="refreshScreenshot">
            <span class="icon-[solar--refresh-bold-duotone] size-5" />
            <span>刷新屏幕</span>
          </button>
          <button class="glass-button glass-button-primary" :disabled="!canUseAdb" @click="streaming ? stopStream() : startStream()">
            <span :class="[streaming ? 'icon-[solar--pause-circle-bold-duotone]' : 'icon-[solar--play-circle-bold-duotone]', 'size-5']" />
            <span>{{ streaming ? '停止投屏' : '开启投屏' }}</span>
          </button>
        </template>
      </PageHeader>

      <!-- Tab bar -->
      <div class="mb-4 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-800">
        <button
          v-for="[key, label, icon] in tabs"
          :key="key"
          class="tab-btn inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-all duration-200"
          :class="[
            activeTab === key ? 'tab-btn-active' : 'tab-btn-inactive',
            tabDisabled(key) ? '!cursor-not-allowed !opacity-40' : ''
          ]"
          :disabled="tabDisabled(key)"
          @click="!tabDisabled(key) && (activeTab = key)"
        >
          <span :class="[icon, 'size-5 transition-colors duration-200']" />
          <span>{{ label }}</span>
        </button>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto">

    <!-- Control feedback message - fixed position to avoid layout shift -->
    <Transition name="slide-down">
      <div v-if="message" class="fixed top-16 left-1/2 z-40 -translate-x-1/2 rounded-xl px-5 py-2.5 text-sm shadow-lg backdrop-blur-md border border-slate-200/60 bg-white/95 dark:border-slate-700/50 dark:bg-slate-900/95 dark:text-slate-200">{{ message }}</div>
    </Transition>

    <!-- Install progress banner -->
    <Transition name="slide-down">
      <div v-if="installingApk" class="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
        <span class="inline-flex items-center gap-2"><svg class="size-5 animate-spin text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>正在安装 {{ installingApkName }}...</span><span class="text-xs text-sky-600 dark:text-sky-400">安装过程中请勿断开设备连接</span>
      </div>
    </Transition>

    <!-- Permission banner -->
    <Transition name="slide-down">
      <div v-if="showPermissionBanner && device?.apkVersion" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <div class="flex items-center gap-2">
          <span class="icon-[solar--shield-check-bold-duotone] size-5 text-emerald-500" />
          <span>APK 安装完成！请在手机上配置权限以启用完整功能。</span>
          <RouterLink class="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-300" to="/help#apk-permissions">查看权限指南<span class="icon-[solar--alt-arrow-right-outline] size-3" /></RouterLink>
        </div>
        <button class="rounded-md bg-white/60 px-3 py-1 text-xs font-medium text-slate-600 transition-all hover:bg-white dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20" @click="showPermissionBanner = false">稍后</button>
      </div>
    </Transition>

    <!-- Status banners -->
    <div v-if="!canUseAdb && !canUseApk" class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">该设备当前未连接 ADB，也没有 APK 在线通道。请先连接 ADB 或安装并启动 APK 后再操作。</div>
    <div v-else-if="!canUseAdb && canUseApk" class="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">APK 已在线，但当前页面大部分控制功能依赖 ADB，相关按钮已禁用。</div>
    <div v-else-if="canUseAdb && device?.internalState === 'PermissionRequired'" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <div class="min-w-0"><p class="font-medium">APK 已连接，但还需要开启权限：{{ missingPermissionNames.join('、') || '等待手机端上报' }}</p><div class="mt-2 flex flex-wrap gap-2"><span v-for="item in permissionRows" :key="item.key" class="rounded-full px-2.5 py-1 text-xs font-medium" :class="item.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'">{{ item.label }}：{{ item.enabled ? '已开启' : '未开启' }}</span></div></div>
      <RouterLink class="glass-button" to="/help#apk-permissions"><span class="icon-[solar--question-circle-bold-duotone] size-5" /><span>权限帮助</span></RouterLink>
    </div>
    <div v-else-if="canUseAdb && !device?.apkVersion" class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span>{{ bundledApkInstalled ? 'APK 已安装，下一步请在手机上开启无障碍服务、输入法、通知和后台运行权限。' : 'APK 通道尚未在线：如果尚未安装，请安装伴侣APK；如果已经安装，请在手机上授予所需权限。' }}</span>
      <div class="flex flex-wrap gap-2"><button class="glass-button glass-button-primary" :disabled="busy" @click="installBundledApk">重新安装伴侣APK</button><RouterLink class="glass-button" to="/help#apk-permissions"><span class="icon-[solar--question-circle-bold-duotone] size-5" /><span>权限帮助</span></RouterLink></div>
    </div>

    <!-- Control Tab -->
    <div v-if="activeTab === 'control'" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div ref="screenContainerRef" class="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-800" :class="[isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0' : '']">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-white">
          <div class="flex items-center gap-2 text-sm">
            <span class="icon-[solar--smartphone-2-bold-duotone] size-5 text-sky-300" />
            <span>{{ streaming ? '实时观看中' : '手机控制' }}</span>
            <span v-if="canUseApk && device?.internalState === 'Online'" class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">APK 控制</span>
            <span v-else-if="canUseApk" class="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">APK 待授权</span>
            <span v-else class="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-200">ADB 控制</span>
          </div>
          <div class="flex items-center gap-3">
            <!-- Transport mode selector -->
            <div class="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
              <button class="rounded-md px-2.5 py-1 transition-all" :class="transportMode === 'tcp' ? 'bg-sky-500/25 text-sky-300' : 'text-slate-400 hover:text-slate-200'" @click="transportMode = 'tcp'">TCP</button>
              <button class="rounded-md px-2.5 py-1 transition-all" :class="transportMode === 'udp' ? 'bg-sky-500/25 text-sky-300' : 'text-slate-400 hover:text-slate-200'" @click="transportMode = 'udp'">UDP</button>
            </div>
            <!-- Stream config -->
            <LiquidSelect v-model="streamInterval" class="min-w-28 !text-xs !py-1 !border-white/10 !bg-white/5" :options="streamIntervalOptions" />
            <div class="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
              <button class="rounded-md px-2.5 py-1 transition-all" :class="streamQuality === 'png' ? 'bg-sky-500/25 text-sky-300' : 'text-slate-400 hover:text-slate-200'" @click="streamQuality = 'png'">PNG</button>
              <button class="rounded-md px-2.5 py-1 transition-all" :class="streamQuality === 'jpeg' ? 'bg-sky-500/25 text-sky-300' : 'text-slate-400 hover:text-slate-200'" @click="streamQuality = 'jpeg'">JPEG</button>
            </div>
            <label class="glass-toggle inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm backdrop-blur-sm transition-all hover:bg-white/10" :class="controlEnabled ? 'border-sky-400/60 bg-sky-500/15' : ''">
              <input v-model="controlEnabled" class="glass-checkbox size-4" type="checkbox" :disabled="!canUseAdb" />
              <span :class="controlEnabled ? 'text-sky-300' : 'text-slate-300'">控制设备</span>
            </label>
            <button class="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-sky-300 transition-colors" title="全屏" @click="toggleFullscreen">
              <span :class="[isFullscreen ? 'icon-[solar--quit-full-screen-bold]' : 'icon-[solar--full-screen-bold]', 'size-4']" />
            </button>
          </div>
        </div>
        <div class="flex min-h-[560px] items-center justify-center bg-slate-950 p-4" :class="[isFullscreen ? 'h-[calc(100vh-56px)]' : '']">
          <div
            class="relative overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-2xl"
            :class="[isLandscape ? 'max-h-[70vh] w-full max-w-[900px]' : 'max-h-[76vh] w-full max-w-[420px]', isFullscreen ? 'max-h-[calc(100vh-80px)] max-w-[520px]' : '']"
            :style="{ aspectRatio: `${screenSize.width} / ${screenSize.height}` }"
            @pointerdown="onPointerDown" @pointerup="onPointerUp"
          >
            <img v-if="screenshotUrl" :src="screenshotUrl" class="h-full w-full select-none object-fill rounded-[2rem]" draggable="false" alt="设备屏幕" @load="onScreenLoaded" @error="onScreenError" />
            <div v-else class="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400 rounded-[2rem]">{{ screenPlaceholderText }}</div>
            <!-- Control overlay with matching border radius -->
            <div v-if="controlEnabled" class="pointer-events-none absolute inset-0 rounded-[2rem] border-2 border-sky-400/80" />
          </div>
          <div class="ml-3 grid content-center gap-2">
            <template v-for="[label, keyCode, icon] in quickKeys.slice(0, 4)" :key="label">
              <button class="icon-button group relative bg-white/10 text-white hover:bg-white/20 hover:scale-110 active:scale-95 transition-all duration-150" :disabled="busy || !canUseAdb" :title="label" @click="sendKey(keyCode)">
                <span :class="[icon, 'size-5']" />
                <span class="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">{{ label }}</span>
              </button>
            </template>
            <div class="h-px bg-white/10 my-1" />
            <template v-for="[label, keyCode, icon] in quickKeys.slice(4)" :key="label">
              <button class="icon-button group relative bg-white/10 text-white hover:bg-white/20 hover:scale-110 active:scale-95 transition-all duration-150" :disabled="busy || !canUseAdb" :title="label" @click="sendKey(keyCode)">
                <span :class="[icon, 'size-5']" />
                <span class="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">{{ label }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>

      <aside class="space-y-4">
        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 text-sm font-semibold">快捷控制</h2>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="[label, keyCode, icon] in quickKeys" :key="label" class="quick-key-btn" :disabled="busy || !canUseAdb" :title="label" @click="sendKey(keyCode)">
              <span :class="[icon, 'size-5']" /><span>{{ label }}</span>
            </button>
          </div>
          <textarea v-model="inputText" class="mt-3 min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-all focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950" placeholder="输入要发送到手机的文本" />
          <button class="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-60 transition-colors" :disabled="busy || !canUseAdb" @click="sendText">
            <span class="icon-[solar--plain-2-bold-duotone] size-5" /><span>发送文本</span>
          </button>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 class="mb-3 text-sm font-semibold">手机设置快捷入口</h2>
          <details v-for="group in settingGroups" :key="group.title" class="mb-2 rounded-md border border-slate-200 p-2 dark:border-slate-700" open>
            <summary class="cursor-pointer text-sm font-medium">{{ group.title }}</summary>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <button v-for="[label, target, icon] in group.items" :key="target" class="setting-entry-btn" :disabled="busy || !canUseAdb" :title="label" @click="openSetting(target)">
                <span :class="[icon, 'size-5 shrink-0']" /><span class="truncate">{{ label }}</span>
              </button>
            </div>
          </details>
        </div>
      </aside>
    </div>

    <!-- Terminal Tab with hover style on execute button -->
    <div v-else-if="activeTab === 'terminal'" class="grid gap-3">
      <textarea v-model="terminalCommand" class="min-h-24 rounded-md border border-slate-300 bg-white p-3 font-mono text-sm transition-all focus:border-sky-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950" placeholder="例如：shell dumpsys battery" />
      <button class="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-sky-500 px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-sky-600 hover:shadow-md disabled:opacity-60" :disabled="busy || !canUseAdb" @click="runTerminal">
        <span class="icon-[solar--play-bold-duotone] size-5" /><span>执行</span>
      </button>
      <pre class="min-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-100">{{ terminalOutput || '终端输出会显示在这里。' }}</pre>
    </div>

    <!-- Apps Tab -->
    <div v-else-if="activeTab === 'apps'" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-3 flex flex-wrap gap-2">
          <LiquidSelect v-model="packageScope" class="min-w-40" :options="packageScopeOptions" />
          <input v-model="packageFilter" class="h-10 min-w-64 rounded-md border border-slate-300 bg-white px-3 text-sm transition-all focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950" placeholder="搜索包名" />
          <button class="h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-200 disabled:opacity-60" :disabled="busy || !canUseAdb" @click="loadPackages">列出软件包</button>
          <label class="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm transition-all hover:border-sky-300 dark:border-slate-700">安装 APK<input class="hidden" type="file" accept=".apk,application/vnd.android.package-archive" @change="installApk" /></label>
          <button class="h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-200 disabled:opacity-60" :disabled="busy || !canUseAdb" @click="installBundledApk">重新安装伴侣APK</button>
        </div>
        <div class="max-h-[620px] overflow-auto">
          <button v-for="item in filteredPackages" :key="item.packageName" class="grid w-full gap-1 border-t border-slate-100 px-2 py-3 text-left text-sm transition-all hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800" :class="selectedPackage === item.packageName ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : ''" @click="selectedPackage = item.packageName">
            <span class="font-medium">{{ item.packageName }}</span><span class="truncate text-xs text-slate-500">{{ item.apkPath }}</span>
          </button>
        </div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 text-sm font-semibold">软件操作</h2>
        <p class="mb-3 break-all text-sm text-slate-500">{{ selectedPackage || '请选择一个软件包。' }}</p>
        <div class="grid grid-cols-2 gap-2">
          <button class="app-action-btn" :disabled="!selectedPackage" @click="appAction('launch')">运行</button>
          <button class="app-action-btn" :disabled="!selectedPackage" @click="appAction('forceStop')">强制停止</button>
          <button class="app-action-btn" :disabled="!selectedPackage" @click="appAction('disable')">禁用</button>
          <button class="app-action-btn" :disabled="!selectedPackage" @click="appAction('enable')">启用</button>
          <button class="app-action-btn" :disabled="!selectedPackage" @click="extractApk()">提取 APK</button>
          <button class="app-action-btn" :disabled="!selectedPackage" @click="appAction('info')">软件信息</button>
          <button class="app-action-btn-danger" :disabled="!selectedPackage" @click="appAction('clear')">清除数据</button>
          <button class="app-action-btn-danger" :disabled="!selectedPackage" @click="appAction('uninstall')">卸载</button>
          <button class="col-span-2 app-action-btn-warning" :disabled="!selectedPackage" @click="appAction('uninstallKeepData')">保留数据卸载</button>
        </div>
        <pre class="mt-3 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{{ appInfo || '软件信息会显示在这里。' }}</pre>
      </div>
    </div>

    <!-- Files Tab -->
    <div v-else-if="activeTab === 'files'" class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div class="mb-3 flex flex-wrap gap-2">
        <input v-model="currentPath" class="h-10 min-w-80 rounded-md border border-slate-300 bg-white px-3 text-sm transition-all focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950" />
        <button class="h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-200" :disabled="busy || !canUseAdb" @click="loadFiles()">查看</button>
        <button class="h-10 rounded-md border border-slate-300 px-4 text-sm transition-all hover:border-sky-300 dark:border-slate-700" @click="parentPath">上级</button>
        <label class="inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm transition-all hover:border-sky-300 dark:border-slate-700">发送文件<input class="hidden" type="file" @change="uploadFile" /></label>
      </div>
      <div class="overflow-auto"><table class="w-full text-left text-sm"><thead class="text-slate-500"><tr><th class="py-2">名称</th><th class="py-2">类型</th><th class="py-2">大小</th><th class="py-2">权限</th><th></th></tr></thead><tbody><tr v-for="entry in fileEntries" :key="entry.name" class="border-t border-slate-100 dark:border-slate-800"><td class="py-2"><button class="text-sky-700 hover:underline dark:text-sky-300" @click="enterFile(entry)">{{ entry.name }}</button></td><td>{{ entry.type }}</td><td>{{ entry.size }}</td><td>{{ entry.permissions }}</td><td><button v-if="entry.type !== 'directory'" class="text-sky-700 hover:underline dark:text-sky-300" @click="downloadFile(entry)">提取</button></td></tr></tbody></table></div>
    </div>

    <!-- Hardware Tab -->
    <div v-else-if="activeTab === 'hardware'" class="grid gap-3">
      <button class="hw-refresh-btn" :disabled="busy || !canUseAdb" @click="loadHardware"><span class="icon-[solar--refresh-bold-duotone] size-5" /><span>检测硬件信息</span></button>
      <div class="grid gap-3 lg:grid-cols-2">
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">CPU\n{{ hardware?.cpu || '等待检测。' }}</pre>
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">内存\n{{ hardware?.memory || '等待检测。' }}</pre>
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">电池\n{{ hardware?.battery || '等待检测。' }}</pre>
        <pre class="min-h-56 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">显示/属性\n{{ [hardware?.display, hardware?.properties].filter(Boolean).join('\n') || '等待检测。' }}</pre>
      </div>
    </div>

    <!-- System Tab -->
    <div v-else-if="activeTab === 'system'" class="grid gap-4 xl:grid-cols-2">
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 text-sm font-semibold">状态栏图标隐藏</h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3"><label v-for="[key, label] in statusIconOptions" :key="key" class="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><input v-model="hiddenIcons" type="checkbox" :value="key" class="size-4 accent-sky-500" /><span>{{ label }}</span></label></div>
        <button class="mt-3 h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-200" :disabled="busy || !canUseAdb" @click="saveStatusIcons">应用图标隐藏</button>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 class="mb-3 text-sm font-semibold">下拉快捷图标</h2>
        <label class="mb-3 block text-sm">下拉首行图标个数：{{ collapsedTileCount }}</label>
        <input v-model.number="collapsedTileCount" class="w-full accent-sky-500" type="range" min="1" max="12" />
        <label class="mb-3 mt-4 block text-sm">图标置顶间距：{{ iconTopPadding }}</label>
        <input v-model.number="iconTopPadding" class="w-full accent-sky-500" type="range" min="0" max="80" />
        <button class="mt-4 h-10 rounded-md bg-sky-500 px-4 text-sm text-white transition-all duration-200" :disabled="busy || !canUseAdb" @click="saveQuickSettings">应用快捷设置</button>
        <p class="mt-3 text-xs text-slate-500">不同 Android 版本或 ROM 对这些 SystemUI 键的支持不同；不支持时命令可能执行但界面不变化。</p>
      </div>
    </div>

    <!-- Power Tab -->
    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button v-for="[action, label, icon] in powerActions" :key="action" class="power-action-btn" :disabled="busy || !canUseAdb" @click="powerAction(action)">
        <span :class="[icon, 'size-5']" /><span>{{ label }}</span>
      </button>
    </div>
    </div><!-- end scrollable content -->
  </section>
</template>

<style scoped>
/* Tab button styles */
.tab-btn-active { background: linear-gradient(135deg, rgba(14,165,233,.12), rgba(56,189,248,.06)); color: #0369a1; box-shadow: 0 1px 6px rgba(14,165,233,.12); }
.dark .tab-btn-active { background: linear-gradient(135deg, rgba(14,165,233,.18), rgba(56,189,248,.08)); color: #38bdf8; }
.tab-btn-inactive { color: #64748b; }
.tab-btn-inactive:not(:disabled):hover { background-color: #f1f5f9; color: #334155; }
.dark .tab-btn-inactive { color: #94a3b8; }
.dark .tab-btn-inactive:not(:disabled):hover { background-color: rgba(30,41,59,.55); color: #e2e8f0; }

/* Quick key button in sidebar */
.quick-key-btn { display: inline-flex; height: 2.75rem; align-items: center; justify-content: center; gap: 0.375rem; border-radius: 0.5rem; border: 1px solid rgba(226,232,240,.8); background: white; font-size: 0.8125rem; color: #334155; transition: all 160ms ease; }
.quick-key-btn:hover:not(:disabled) { border-color: rgba(125,211,252,.7); background: #f0f9ff; color: #0369a1; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(14,165,233,.12); }
.quick-key-btn:disabled { opacity: .45; }
.dark .quick-key-btn { border-color: rgba(51,65,85,.5); background: #1e293b; color: #cbd5e1; }
.dark .quick-key-btn:hover:not(:disabled) { border-color: rgba(56,189,248,.45); background: #0c1929; color: #38bdf8; }

/* Setting entry buttons */
.setting-entry-btn { display: inline-flex; height: 2.5rem; align-items: center; justify-content: flex-start; gap: 0.5rem; border-radius: 0.5rem; border: 1px solid rgba(226,232,240,.8); padding: 0 0.75rem; font-size: 0.875rem; color: #334155; transition: all 160ms ease; }
.setting-entry-btn:hover:not(:disabled) { border-color: rgba(125,211,252,.65); color: #0369a1; background: #f0f9ff; }
.setting-entry-btn:disabled { opacity: .5; }
.dark .setting-entry-btn { border-color: rgba(51,65,85,.5); background: #1e293b; color: #cbd5e1; }
.dark .setting-entry-btn:hover:not(:disabled) { border-color: rgba(56,189,248,.35); color: #38bdf8; background: #0f172a; }

/* App action buttons */
.app-action-btn { height: 2.5rem; border-radius: 0.5rem; border: 1px solid rgba(226,232,240,.8); font-size: 0.875rem; transition: all 160ms ease; }
.app-action-btn:hover:not(:disabled) { border-color: rgba(125,211,252,.65); color: #0369a1; background: #f0f9ff; }
.app-action-btn:disabled { opacity: .5; }
.dark .app-action-btn { border-color: rgba(51,65,85,.5); color: #cbd5e1; }
.dark .app-action-btn:hover:not(:disabled) { border-color: rgba(56,189,248,.35); color: #38bdf8; background: #0f172a; }
.app-action-btn-danger { height: 2.5rem; border-radius: 0.5rem; border: 1px solid rgba(226,232,240,.8); font-size: 0.875rem; transition: all 160ms ease; color: #be123c; border-color: rgba(254,202,202,.7); }
.app-action-btn-danger:hover:not(:disabled) { border-color: rgba(251,113,133,.6); background: #fff1f2; }
.dark .app-action-btn-danger { border-color: rgba(127,29,29,.45); color: #fda4af; }
.dark .app-action-btn-danger:hover:not(:disabled) { border-color: rgba(225,29,72,.4); background: #450a0a; }
.app-action-btn-warning { height: 2.5rem; border-radius: 0.5rem; border: 1px solid rgba(226,232,240,.8); font-size: 0.875rem; transition: all 160ms ease; color: #b45309; border-color: rgba(254,243,199,.7); }
.app-action-btn-warning:hover:not(:disabled) { border-color: rgba(245,158,11,.5); background: #fefce8; }
.dark .app-action-btn-warning { border-color: rgba(113,63,18,.45); color: #fcd34d; }
.dark .app-action-btn-warning:hover:not(:disabled) { border-color: rgba(180,83,9,.4); background: #422006; }

/* Hardware & Power buttons */
.hw-refresh-btn { display: inline-flex; height: 2.5rem; align-items: center; justify-content: center; gap: 0.5rem; border-radius: 0.5rem; background: #0ea5e9; padding: 0 1rem; font-size: 0.875rem; font-weight: 500; color: white; transition: all 160ms ease; }
.hw-refresh-btn:hover:not(:disabled) { background: #0284c7; box-shadow: 0 3px 10px rgba(14,165,233,.28); }
.power-action-btn { display: inline-flex; height: 4rem; align-items: center; justify-content: center; gap: 0.5rem; border-radius: 0.75rem; border: 1px solid rgba(226,232,240,.8); background: white; font-size: 0.875rem; font-weight: 500; transition: all 160ms ease; }
.power-action-btn:hover:not(:disabled) { border-color: rgba(125,211,252,.65); color: #0369a1; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.06); }
.power-action-btn:disabled { opacity: .5; }
.dark .power-action-btn { border-color: rgba(51,65,85,.5); background: #1e293b; color: #cbd5e1; }
.dark .power-action-btn:hover:not(:disabled) { border-color: rgba(56,189,248,.35); color: #38bdf8; }

.slide-down-enter-active, .slide-down-leave-active { transition: all 300ms ease; }
.slide-down-enter-from { opacity: 0; transform: translateY(-1rem); max-height: 0; margin-bottom: 0; }
.slide-down-leave-to { opacity: 0; transform: translateY(-1rem); max-height: 0; margin-bottom: 0; }
</style>
