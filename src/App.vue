<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, ref } from 'vue'
import logoUrl from '@/assets/logo.svg'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toasts = ref<Array<{ id: number; message: string; type: 'success' | 'error' | 'info'; target?: string }>>([])

const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-bold-duotone]'],
  ['devices', '/devices', 'icon-[solar--devices-bold-duotone]'],
  ['agent', '/agent', 'icon-[solar--magic-stick-3-bold-duotone]'],
  ['tasks', '/tasks', 'icon-[solar--programming-bold-duotone]'],
  ['settings', '/settings', 'icon-[solar--settings-bold-duotone]'],
] as const

function pushToast(event: Event) {
  const detail = (event as CustomEvent).detail ?? {}
  const toast = { id: Date.now() + Math.random(), message: detail.message || '?????', type: detail.type || 'info', target: detail.target }
  toasts.value.push(toast)
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== toast.id)
  }, 3600)
}

function openToastTarget(target?: string) {
  if (target) router.push(target)
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
          class="flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm text-slate-600 transition-all duration-300 hover:bg-white/50 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-white/10"
          active-class="bg-white/70 text-sky-700 shadow-sm ring-1 ring-white/70 dark:bg-white/15 dark:text-sky-300 dark:ring-white/10"
        >
          <span :class="[icon, 'size-5']" />
          <span>{{ t(`nav.${key}`) }}</span>
        </RouterLink>
      </nav>
      <RouterLink to="/help" class="mt-4 flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm text-slate-600 transition-all duration-300 hover:bg-white/50 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-white/10">
        <span class="icon-[solar--question-circle-bold-duotone] size-5" />
        <span>??</span>
      </RouterLink>
    </aside>
    <main :class="route.name === 'login' ? '' : 'pb-24 lg:pb-0 lg:pl-64'">
      <RouterView />
    </main>
    <nav
      v-if="route.name !== 'login'"
      class="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[28px] border border-white/55 bg-white/62 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/62 lg:hidden"
    >
      <RouterLink
        v-for="[key, href, icon] in nav"
        :key="key"
        :to="href"
        class="grid h-14 place-items-center rounded-2xl text-xs text-slate-500 transition-all duration-300 hover:bg-white/55 dark:text-slate-300 dark:hover:bg-white/10"
        active-class="bg-white/80 text-sky-700 shadow-sm dark:bg-white/15 dark:text-sky-200"
      >
        <span :class="[icon, 'size-6']" />
        <span class="mt-0.5 text-[11px]">{{ t(`nav.${key}`) }}</span>
      </RouterLink>
    </nav>
    <TransitionGroup name="toast" tag="div" class="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="glass-panel cursor-pointer px-4 py-3 text-sm shadow-xl"
        :class="toast.type === 'error' ? 'text-rose-700 dark:text-rose-200' : toast.type === 'success' ? 'text-emerald-700 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-100'"
        @click="openToastTarget(toast.target)"
      >
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
