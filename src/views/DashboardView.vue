<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '@/api/client'
import { useDeviceStore, type DeviceRecord } from '@/stores/devices'

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

const stateOptions = ['Offline', 'Unauthorized', 'Matched', 'Online', 'Protected', 'Updating']
const filteredDevices = computed(() => statusFilter.value === 'all' ? devices.devices : devices.devices.filter((device) => device.displayState === statusFilter.value))
const counts = computed(() => Object.fromEntries(stateOptions.map((state) => [state, devices.devices.filter((device) => device.displayState === state).length])))

function canPreview(device: DeviceRecord) {
  return previewEnabled.value && Boolean(device.temporaryAdbSerial || device.deviceId.startsWith('adb:')) && device.displayState !== 'Offline'
}

function previewUrl(device: DeviceRecord) {
  return `/api/devices/${encodeURIComponent(device.deviceId)}/control/screenshot?preview=1&t=${previewTick.value}`
}

function connectionLabel(device: DeviceRecord) {
  if (device.displayState === 'Offline') return '未连接'
  if (!device.apkVersion) return '未安装 APK'
  if (!device.temporaryAdbSerial) return 'APK 在线'
  return device.displayState
}

function stateClass(state: string) {
  if (state === 'Online') return 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
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
  <section class="liquid-shell min-h-screen p-4 text-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">总览</h1>
        <p class="mt-1 text-sm text-slate-500">设备状态、筛选和低频预览集中查看。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="glass-button" @click="devices.load">
          <span class="icon-[solar--refresh-outline] size-5" />
          <span>刷新</span>
        </button>
        <button class="glass-button" :class="previewEnabled ? 'glass-button-primary' : ''" @click="togglePreview">
          <span class="icon-[solar--video-frame-play-horizontal-outline] size-5" />
          <span>{{ previewEnabled ? '关闭预览' : '开启预览' }}</span>
        </button>
      </div>
    </div>

    <div class="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <button class="glass-panel p-4 text-left transition-all duration-300" :class="statusFilter === 'all' ? 'ring-2 ring-sky-300' : ''" @click="statusFilter = 'all'">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">全部</span>
          <span class="icon-[solar--devices-outline] size-5 text-sky-500" />
        </div>
        <strong class="mt-2 block text-2xl">{{ devices.devices.length }}</strong>
      </button>
      <button v-for="state in stateOptions" :key="state" class="glass-panel p-4 text-left transition-all duration-300" :class="statusFilter === state ? 'ring-2 ring-sky-300' : ''" @click="statusFilter = state">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500">{{ t(`states.${state}`) }}</span>
          <span class="size-2 rounded-full" :class="stateClass(state)" />
        </div>
        <strong class="mt-2 block text-2xl">{{ counts[state] ?? 0 }}</strong>
      </button>
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

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="device in filteredDevices"
        :key="device.deviceId"
        class="glass-panel group overflow-hidden text-left transition-all duration-300 hover:-translate-y-0.5"
        :to="{ name: 'device-detail', params: { deviceId: device.deviceId } }"
      >
        <div class="relative aspect-[9/16] max-h-[360px] overflow-hidden bg-slate-950/90">
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
  </section>
</template>
