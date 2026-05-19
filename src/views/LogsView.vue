<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'

const logs = ref<Array<{ id: number; level: string; module: string; message: string; createdAt: string }>>([])

onMounted(async () => {
  logs.value = await api('/api/system/logs')
})
</script>

<template>
  <section class="p-6">
    <h1 class="mb-6 text-xl font-semibold">日志</h1>
    <div class="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div v-for="log in logs" :key="log.id" class="grid grid-cols-[160px_90px_110px_1fr] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 dark:border-slate-800">
        <span class="text-slate-500">{{ log.createdAt }}</span>
        <span>{{ log.level }}</span>
        <span>{{ log.module }}</span>
        <span>{{ log.message }}</span>
      </div>
    </div>
  </section>
</template>
