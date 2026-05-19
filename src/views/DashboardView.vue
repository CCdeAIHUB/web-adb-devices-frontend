<script setup lang="ts">
import { onMounted } from 'vue'
import { useDeviceStore } from '@/stores/devices'

const devices = useDeviceStore()
onMounted(() => devices.load())
</script>

<template>
  <section class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold">总览</h1>
      <span class="rounded-md bg-sky-100 px-3 py-1 text-sm text-sky-700 dark:bg-sky-950 dark:text-sky-300">
        {{ devices.devices.length }} devices
      </span>
    </div>
    <div class="grid gap-3 md:grid-cols-3">
      <div v-for="device in devices.devices" :key="device.deviceId" class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="mb-3 flex items-center gap-3">
          <span class="icon-[solar--smartphone-2-outline] size-6 text-sky-500" />
          <strong class="truncate">{{ device.model || device.temporaryAdbSerial || device.deviceId }}</strong>
        </div>
        <div class="text-sm text-slate-500">{{ device.displayState }}</div>
      </div>
    </div>
  </section>
</template>
