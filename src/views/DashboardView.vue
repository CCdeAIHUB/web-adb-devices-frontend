<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '@/api/client'
import { useDeviceStore, type DeviceRecord } from '@/stores/devices'
import LiquidSelect from '@/components/LiquidSelect.vue'
import PageHeader from '@/components/PageHeader.vue'

interface SettingsResponse {
  values: Record<string, string | null>
}

const { t } = useI18n()
const devices = useDeviceStore()
const statusFilter = ref('all')
const previewEnabled = ref(false)
const previewSeconds = ref(8)
const previewTick = ref(Date.now())
let previewTimer: ReturnType<typeof window.setInterval> | undefined

const stateOptions = ['Offline', 'Unauthorized', 'Matched', 'Online', 'Authorized', 'Protected']
const filteredDevices = computed(() => statusFilter.value === 'all' ? devices.devices : devices.devices.filter((device) => device.displayState === statusFilter.value))
const counts = computed(() => Object.fromEntries(stateOptions.map((state) => [state, devices.devices.filter((device) => device.displayState === state).length])))
const statusOptions = computed(() => [
  { label: `全部设备（${devices.devices.length}）`, value: 'all' },
  ...stateOptions.map((state) => ({ label: `${t(`states.${state}`)}（${counts.value[state] ?? 0}）`, value: state })),
])
const stats = computed(() => [
  ['设备总数', devices.devices.length, 'icon-[solar--devices-bold-duotone]'],
  ['已连接', devices.devices.filter((device) => device.displayState === 'Online' || device.displayState === 'Authorized').length, 'icon-[solar--link-circle-bold-duotone]'],
  ['ADB 已连接', devices.devices.filter((device) => device.displayState === 'Matched' || device.displayState === 'Online' || device.displayState === 'Authorized').length, 'icon-[solar--usb-bold-duotone]'],
  ['AI 模型', '已接入', 'icon-[solar--magic-stick-3-bold-duotone]'],
  ['今日任务成功', '0', 'icon-[solar--check-circle-bold-duotone]'],
])

function canPreview(device: DeviceRecord) {
  return previewEnabled.value && device.displayState !== 'Offline' && (
    Boolean(device.temporaryAdbSerial || device.deviceId.startsWith('adb:')) ||
    Boolean(device.apkVersion)
  )
}

function previewUrl(device: DeviceRecord) {
  return `/api/devices/${encodeURIComponent(device.deviceId)}/control/screenshot?preview=1&t=${previewTick.value}`
}

function connectionLabel(device: DeviceRecord) {
  if (device.displayState === 'Offline') return '未连接'
  if (!device.apkVersion) return '未安装 APK'
  if (device.displayState === 'Authorized') return '已授权'
  if (!device.temporaryAdbSerial) return 'APK 在线'
  return device.displayState
}

function deviceAspectRatio(device: DeviceRecord) {
  const width = device.screenWidth > 0 ? device.screenWidth : 9
  const height = device.screenHeight > 0 ? device.screenHeight : 19.5
  return `${width} / ${height}`
}

function stateClass(state: string) {
  if (state === 'Online') return 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
  if (state === 'Authorized') return 'bg-cyan-100/80 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300'
  if (state === 'Unauthorized') return 'bg-amber-100/80 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  if (state === 'Protected') return 'bg-rose-100/80 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  if (state === 'Updating') return 'bg-sky-100/80 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
  return 'bg-white/60 text-slate-700 dark:bg-white/10 dark:text-slate-300'
}

async function loadSettings() {
  const response = await api<SettingsResponse>('/api/settings')
  previewEnabled.value = response.values['media.previewStreamEnabled'] === 'true'
  previewSeconds.value = Math.max(4, Number(response.values['media.previewRefreshSeconds'] ?? 8) || 8)
  resetPreviewTimer()
}

async function togglePreview() {
  previewEnabled.value = !previewEnabled.value
  await api<SettingsResponse>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ values: { 'media.previewStreamEnabled': String(previewEnabled.value) } }),
  })
  resetPreviewTimer()
}

function resetPreviewTimer() {
  if (previewTimer !== undefined) {
    window.clearInterval(previewTimer)
    previewTimer = undefined
  }

  if (previewEnabled.value) {
    previewTimer = window.setInterval(() => {
      previewTick.value = Date.now()
    }, previewSeconds.value * 1000)
  }
}

onMounted(async () => {
  await Promise.all([devices.load(), loadSettings()])
})
onUnmounted(() => {
  if (previewTimer !== undefined) window.clearInterval(previewTimer)
})
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden text-slate-950 dark:text-slate-100">
    <PageHeader>
      <h1 class="text-xl font-semibold">总览</h1>
      <p class="mt-1 text-sm text-slate-500">设备状态、筛选和低频预览集中查看。</p>
      <template #actions>
        <button class="glass-button" @click="devices.load">
          <span class="icon-[solar--refresh-bold-duotone] size-5" />
          <span>刷新</span>
        </button>
        <RouterLink class="glass-button" to="/help">
          <span class="icon-[solar--question-circle-bold-duotone] size-5" />
          <span>连接帮助</span>
        </RouterLink>
        <button class="glass-button" :class="previewEnabled ? 'glass-button-primary' : ''" @click="togglePreview">
          <span :class="[previewEnabled ? 'icon-[solar--pause-circle-bold-duotone]' : 'icon-[solar--video-frame-play-horizontal-bold-duotone]', 'size-5']" />
          <span>{{ previewEnabled ? '关闭预览' : '开启预览' }}</span>
        </button>
      </template>
    </PageHeader>

    <!-- Scrollable content -->
    <div class="min-h-0 flex-1 overflow-y-auto pr-1">

    <div class="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div v-for="[label, value, icon] in stats" :key="label" class="glass-panel flex items-center justify-between gap-3 p-4">
        <div>
          <div class="text-xs text-slate-500">{{ label }}</div>
          <strong class="mt-1 block text-2xl">{{ value }}</strong>
        </div>
        <span :class="[icon, 'size-7 text-sky-500']" />
      </div>
    </div>

    <div class="glass-panel mb-4 flex min-w-0 items-center gap-3 p-3">
      <span class="icon-[solar--filter-outline] size-5 shrink-0 text-sky-500" />
      <span class="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">筛选</span>
      <LiquidSelect v-model="statusFilter" class="min-w-0 flex-1" :options="statusOptions" />
    </div>

    <div v-if="filteredDevices.length === 0" class="glass-panel grid min-h-[420px] place-items-center p-8 text-center">
      <div>
        <span class="icon-[solar--smartphone-vibration-outline] mx-auto block size-16 text-slate-400" />
        <h2 class="mt-4 text-lg font-semibold">没有设备</h2>
        <p class="mt-2 text-sm text-slate-500">{{ devices.devices.length === 0 ? '添加设备后，这里会显示状态和预览。' : '当前筛选条件下没有设备。' }}</p>
        <RouterLink class="glass-button glass-button-primary mt-5" to="/devices">
          <span class="icon-[solar--add-circle-outline] size-5" />
          <span>添加设备</span>
        </RouterLink>
      </div>
    </div>

    <div v-else class="grid items-start justify-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,260px))]">
      <RouterLink
        v-for="device in filteredDevices"
        :key="device.deviceId"
        class="glass-panel group w-full self-start overflow-hidden text-left transition-all duration-300 hover:-translate-y-0.5"
        :to="{ name: 'device-detail', params: { deviceId: device.deviceId } }"
      >
        <div class="relative w-full overflow-hidden bg-slate-950/90" :style="{ aspectRatio: deviceAspectRatio(device) }">
          <img v-if="canPreview(device)" :src="previewUrl(device)" class="h-full w-full object-contain opacity-95 transition-opacity duration-300" alt="设备当前界面" />
          <div v-else class="grid h-full place-items-center text-center text-slate-300">
            <div>
              <span class="icon-[solar--smartphone-2-outline] mx-auto block size-14 opacity-70" />
              <div class="mt-3 text-sm">{{ connectionLabel(device) }}</div>
            </div>
          </div>
          <span class="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur-xl" :class="stateClass(device.displayState)">
            {{ t(`states.${device.displayState}`) }}
          </span>
        </div>
        <div class="p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <strong class="block truncate">{{ device.model || device.temporaryAdbSerial || device.deviceId }}</strong>
              <div class="mt-1 truncate text-xs text-slate-500">{{ device.deviceId }}</div>
            </div>
            <span class="icon-[solar--alt-arrow-right-outline] size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1" />
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
            <div class="rounded-xl bg-white/35 p-2 dark:bg-white/5">APK：{{ device.apkVersion || '未安装' }}</div>
            <div class="rounded-xl bg-white/35 p-2 dark:bg-white/5">ADB：{{ device.temporaryAdbSerial ? '可用' : '不可用' }}</div>
          </div>
        </div>
      </RouterLink>
    </div>
    </div><!-- end scrollable content -->
  </section>
</template>
