<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, ref } from 'vue'
import logoUrl from '@/assets/logo.svg'

const route = useRoute()
const { t } = useI18n()
const toasts = ref<Array<{ id: number; message: string; type: 'success' | 'error' | 'info' }>>([])

const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]'],
  ['agent', '/agent', 'icon-[solar--magic-stick-3-outline]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]'],
  ['logs', '/logs', 'icon-[solar--document-text-outline]'],
] as const

function pushToast(event: Event) {
  const detail = (event as CustomEvent).detail ?? {}
  const toast = { id: Date.now() + Math.random(), message: detail.message || '操作已完成', type: detail.type || 'info' }
  toasts.value.push(toast)
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== toast.id)
  }, 3200)
}

onMounted(() => window.addEventListener('wad:notify', pushToast))
onUnmounted(() => window.removeEventListener('wad:notify', pushToast))
</script>

<template>
  <div class="min-h-screen text-slate-950 dark:text-slate-100">
    <aside
      v-if="route.name !== 'login'"
      class="fixed inset-y-0 left-0 hidden w-64 border-r border-white/45 bg-white/50 p-4 shadow-[12px_0_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/45 lg:block"
    >
      <div class="mb-8 flex items-center gap-3">
        <img :src="logoUrl" alt="Web ADB Devices" class="size-10 rounded-2xl shadow-lg shadow-sky-500/20" />
        <strong>Web ADB Devices</strong>
      </div>
      <nav class="space-y-1">
        <RouterLink
          v-for="[key, href, icon] in nav"
          :key="key"
          :to="href"
          class="flex h-10 items-center gap-3 rounded-2xl px-3 text-sm text-slate-600 transition-all duration-300 hover:bg-white/50 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-white/10"
          active-class="bg-white/70 text-sky-700 shadow-sm ring-1 ring-white/70 dark:bg-white/15 dark:text-sky-300 dark:ring-white/10"
        >
          <span :class="[icon, 'size-5']" />
          <span>{{ t(`nav.${key}`) }}</span>
        </RouterLink>
      </nav>
    </aside>
    <main :class="route.name === 'login' ? '' : 'lg:pl-64'">
      <RouterView />
    </main>
    <div class="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="glass-panel px-4 py-3 text-sm shadow-xl"
        :class="toast.type === 'error' ? 'text-rose-700 dark:text-rose-200' : toast.type === 'success' ? 'text-emerald-700 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-100'"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>
