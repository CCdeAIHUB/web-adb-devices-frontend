<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDeviceStore } from '@/stores/devices'

const { t } = useI18n()
const devices = useDeviceStore()
onMounted(() => devices.load())
</script>

<template>
  <section class="p-6">
    <h1 class="mb-6 text-xl font-semibold">设备</h1>
    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-100 text-slate-500 dark:bg-slate-800">
          <tr>
            <th class="px-4 py-3">设备</th>
            <th class="px-4 py-3">状态</th>
            <th class="px-4 py-3">APK</th>
            <th class="px-4 py-3">ADB</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="device in devices.devices" :key="device.deviceId" class="border-t border-slate-100 dark:border-slate-800">
            <td class="px-4 py-3">{{ device.model || device.deviceId }}</td>
            <td class="px-4 py-3">{{ t(`states.${device.displayState}`) }}</td>
            <td class="px-4 py-3">{{ device.apkVersion || '-' }}</td>
            <td class="px-4 py-3">{{ device.temporaryAdbSerial || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
