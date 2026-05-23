<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'

const logs = ref<Array<{ id: number; level: string; module: string; message: string; createdAt: string }>>([])

onMounted(async () => {
  logs.value = await api('/api/system/logs')
})
</script>

<template>
  <section class="min-h-[calc(100vh-8rem)] text-slate-950 dark:text-slate-100">
    <h1 class="mb-6 text-xl font-semibold">运行日志</h1>
    <div class="glass-panel overflow-auto">
      <div class="grid min-w-[720px] grid-cols-[190px_80px_100px_minmax(0,1fr)] gap-3 border-b border-white/35 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-white/10">
        <span>时间</span><span>级别</span><span>模块</span><span>消息</span>
      </div>
      <div v-for="log in logs" :key="log.id" class="grid min-w-[720px] grid-cols-[190px_80px_100px_minmax(0,1fr)] gap-3 border-b border-white/25 px-4 py-3 text-sm last:border-b-0 dark:border-white/10">
        <span class="whitespace-nowrap text-xs leading-5 text-slate-500">{{ new Date(log.createdAt).toLocaleString() }}</span>
        <span class="font-medium">{{ log.level }}</span>
        <span>{{ log.module }}</span>
        <span class="min-w-0 break-words">{{ log.message }}</span>
      </div>
    </div>
  </section>
</template>
