<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, ref, provide, defineAsyncComponent } from 'vue'
import logoUrl from '@/assets/logo.svg'

const AgentPanel = defineAsyncComponent(() => import('@/views/AgentView.vue'))

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toasts = ref<Array<{ id: number; message: string; type: 'success' | 'error' | 'info'; target?: string }>>([])
const aiPanelOpen = ref(false)

// Provide aiPanelOpen to child views so they can add the toggle button
provide('aiPanelOpen', aiPanelOpen)
provide('toggleAiPanel', () => { aiPanelOpen.value = !aiPanelOpen.value })

const isMobile = ref(false)

function updateIsMobile() {
  isMobile.value = typeof window !== 'undefined' ? window.innerWidth < 1024 : false
}

// Desktop nav - no agent (agent is right panel toggle), no logs/help (moved to settings)
// icon format: [outline for inactive, bold-duotone for hover, bold-filled for active/selected]
const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]', 'icon-[solar--home-2-bold-duotone]', 'icon-[solar--home-2-bold]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]', 'icon-[solar--devices-bold-duotone]', 'icon-[solar--devices-bold]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]', 'icon-[solar--programming-bold-duotone]', 'icon-[solar--programming-bold]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]', 'icon-[solar--settings-bold-duotone]', 'icon-[solar--settings-bold]'],
] as const

// Mobile bottom nav includes agent as separate page
const mobileNav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]', 'icon-[solar--home-2-bold]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]', 'icon-[solar--devices-bold]'],
  ['agent', '/agent', 'icon-[solar--magic-stick-3-outline]', 'icon-[solar--magic-stick-3-bold]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]', 'icon-[solar--programming-bold]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]', 'icon-[solar--settings-bold]'],
] as const

function pushToast(event: Event) {
  const detail = (event as CustomEvent).detail ?? {}
  const toast = { id: Date.now() + Math.random(), message: detail.message || '操作已完成', type: detail.type || 'info', target: detail.target }
  toasts.value.push(toast)
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== toast.id)
  }, 3600)
}

function openToastTarget(target?: string) {
  if (target) router.push(target)
}

onMounted(() => {
  window.addEventListener('wad:notify', pushToast)
  window.addEventListener('resize', updateIsMobile)
  updateIsMobile()
  // On desktop, if user navigates to /agent, open the right panel instead
  if (!isMobile.value && route.name === 'agent') {
    aiPanelOpen.value = true
  }
})
onUnmounted(() => {
  window.removeEventListener('wad:notify', pushToast)
  window.removeEventListener('resize', updateIsMobile)
})
</script>

<template>
  <div
    :class="[
      'h-dvh w-screen min-w-0 overflow-hidden text-slate-950 dark:text-slate-100',
      route.name !== 'login'
        ? aiPanelOpen
          ? 'lg:grid lg:grid-cols-[260px_minmax(0,1fr)_400px]'
          : 'lg:grid lg:grid-cols-[260px_minmax(0,1fr)]'
        : ''
    ]"
  >
    <!-- Desktop Sidebar -->
    <aside
      v-if="route.name !== 'login'"
      class="hidden h-dvh w-[260px] min-w-[260px] border-r border-slate-200/60 bg-white/80 p-4 backdrop-blur-xl dark:border-slate-700/40 dark:bg-slate-900/85 lg:block"
    >
      <div class="mb-8 flex items-center gap-3">
        <img :src="logoUrl" alt="Web ADB Devices" class="size-9 rounded-xl shadow-md shadow-sky-500/20" />
        <strong class="text-base font-semibold text-slate-800 dark:text-slate-100">Web ADB Devices</strong>
      </div>
      <nav class="space-y-1">
        <RouterLink
          v-for="[key, href, icon, iconHover, iconActive] in nav"
          :key="key"
          :to="href"
          class="nav-item group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200"
          :class="$route.name === key ? 'nav-active' : 'nav-inactive'"
        >
          <span class="relative inline-flex size-5 shrink-0">
            <span
              :class="[
                $route.name === key ? iconActive : icon,
                'size-5 transition-all duration-200',
                $route.name !== key ? 'group-hover:opacity-0' : ''
              ]"
            />
            <span
              v-if="$route.name !== key"
              :class="[iconHover, 'size-5 absolute inset-0 transition-all duration-200 opacity-0 group-hover:opacity-100']"
            />
          </span>
          <span>{{ t(`nav.${key}`) }}</span>
        </RouterLink>
      </nav>
    </aside>

    <!-- Main Content Area -->
    <main :class="route.name === 'login' ? 'min-h-dvh w-full min-w-0' : 'flex h-dvh w-full min-w-0 flex-col overflow-hidden'">
      <!-- Mobile Header -->
      <header v-if="route.name !== 'login'" class="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/75 px-4 backdrop-blur-xl dark:border-slate-700/40 dark:bg-slate-900/80 lg:hidden">
        <div class="size-10" aria-hidden="true" />
        <span class="font-semibold text-slate-800 dark:text-slate-100">{{ $t(`nav.${String(route.name) || 'dashboard'}`) }}</span>
        <div class="size-10" aria-hidden="true" />
      </header>

      <div :class="route.name !== 'login' ? 'min-h-0 w-full min-w-0 flex-1 overflow-hidden p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8' : 'w-full min-w-0'">
        <RouterView />
      </div>
    </main>

    <!-- Right Side AI Panel (Desktop) - Embedded AgentView -->
    <Transition name="panel-slide">
      <aside
        v-if="aiPanelOpen && route.name !== 'login'"
        class="hidden h-dvh w-[400px] min-w-[400px] flex-col border-l border-slate-200/60 bg-white/95 backdrop-blur-xl shadow-xl dark:border-slate-700/40 dark:bg-slate-900/95 lg:flex"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between border-b border-slate-200/50 px-4 py-3 dark:border-slate-700/30">
          <div class="flex items-center gap-2">
            <span class="icon-[solar--magic-stick-3-bold] size-5 text-sky-500" />
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">AI 助手</span>
          </div>
          <button class="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" @click="aiPanelOpen = false">
            <span class="icon-[solar--close-circle-bold] size-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
          </button>
        </div>
        <!-- Embedded AgentView in panel mode -->
        <AgentPanel :is-panel-mode="true" />
      </aside>
    </Transition>

    <!-- Mobile Bottom Navigation -->
    <nav
      v-if="route.name !== 'login'"
      class="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-2xl border border-slate-200/55 bg-white/80 p-2 shadow-lg backdrop-blur-xl dark:border-slate-700/35 dark:bg-slate-950/80 lg:hidden"
    >
      <RouterLink
        v-for="[key, href, icon, iconActive] in mobileNav"
        :key="key"
        :to="href"
        class="grid h-14 place-items-center rounded-xl text-xs transition-all duration-200"
        :class="$route.name === key ? 'bg-sky-500 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'"
      >
        <span :class="[$route.name === key ? iconActive : icon, 'size-6']" />
        <span class="mt-0.5 text-[11px]">{{ t(`nav.${key}`) }}</span>
      </RouterLink>
    </nav>

    <!-- Toast Notifications - slide from right, theme-aware colors -->
    <TransitionGroup name="toast-slide-right" tag="div" class="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="cursor-pointer overflow-hidden rounded-xl px-4 py-3 text-sm shadow-xl backdrop-blur-md transition-colors"
        :class="[
          toast.type === 'error'
            ? 'bg-rose-50/95 border border-rose-200/70 text-rose-700 dark:bg-rose-950/90 dark:border-rose-800/60 dark:text-rose-200'
            : toast.type === 'success'
              ? 'bg-emerald-50/95 border border-emerald-200/70 text-emerald-700 dark:bg-emerald-950/90 dark:border-emerald-800/60 dark:text-emerald-200'
              : 'bg-slate-50/95 border border-slate-200/70 text-slate-700 dark:bg-slate-800/95 dark:border-slate-700/60 dark:text-slate-200'
        ]"
        @click="openToastTarget(toast.target)"
      >
        <span class="block truncate">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Nav Item Styles */
.nav-active {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.10), rgba(56, 189, 248, 0.05));
  color: #0369a1;
}
.dark .nav-active {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(56, 189, 248, 0.08));
  color: #38bdf8;
}

.nav-inactive {
  color: #64748b;
}
.nav-inactive:hover {
  background-color: rgba(241, 245, 249, 0.7);
  color: #334155;
}
.dark .nav-inactive {
  color: #94a3b8;
}
.dark .nav-inactive:hover {
  background-color: rgba(30, 41, 59, 0.5);
  color: #cbd5e1;
}

/* Panel Slide Animation (from right) */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Toast Slide-from-Right Animation */
.toast-slide-right-enter-active {
  transition: all 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-slide-right-leave-active {
  transition: all 220ms ease;
}
.toast-slide-right-enter-from {
  opacity: 0;
  transform: translateX(60px) scale(0.96);
}
.toast-slide-right-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.98);
}
.toast-slide-right-move {
  transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
