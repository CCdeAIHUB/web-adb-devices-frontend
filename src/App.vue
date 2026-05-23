<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import logoUrl from '@/assets/logo.svg'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toasts = ref<Array<{ id: number; message: string; type: 'success' | 'error' | 'info'; target?: string }>>([])
const aiPanelOpen = ref(false)
const mobileMenuOpen = ref(false)

const isMobile = computed(() => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 1024
})

// Desktop nav - no agent (agent moves to right panel), no logs/help (moved to settings)
const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]', 'icon-[solar--home-2-bold-duotone]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]', 'icon-[solar--devices-bold-duotone]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]', 'icon-[solar--programming-bold-duotone]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]', 'icon-[solar--settings-bold-duotone]'],
] as const

// Mobile bottom nav includes agent as separate page
const mobileNav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]', 'icon-[solar--home-2-bold-duotone]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]', 'icon-[solar--devices-bold-duotone]'],
  ['agent', '/agent', 'icon-[solar--magic-stick-3-outline]', 'icon-[solar--magic-stick-3-bold-duotone]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]', 'icon-[solar--programming-bold-duotone]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]', 'icon-[solar--settings-bold-duotone]'],
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

function toggleAiPanel() {
  aiPanelOpen.value = !aiPanelOpen.value
}

onMounted(() => {
  window.addEventListener('wad:notify', pushToast)
  // Auto-open AI panel on agent route in desktop
  if (!isMobile.value && route.name === 'agent') {
    aiPanelOpen.value = true
  }
})
onUnmounted(() => window.removeEventListener('wad:notify', pushToast))
</script>

<template>
  <div class="min-h-screen text-slate-950 dark:text-slate-100">
    <!-- Desktop Sidebar (fixed, content area uses margin-left to avoid overlap) -->
    <aside
      v-if="route.name !== 'login'"
      class="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-slate-200/60 bg-white/80 p-4 backdrop-blur-xl dark:border-slate-700/40 dark:bg-slate-900/85 lg:block"
    >
      <div class="mb-8 flex items-center gap-3">
        <img :src="logoUrl" alt="Web ADB Devices" class="size-9 rounded-xl shadow-md shadow-sky-500/20" />
        <strong class="text-base font-semibold text-slate-800 dark:text-slate-100">Web ADB Devices</strong>
      </div>
      <nav class="space-y-1">
        <RouterLink
          v-for="[key, href, icon, iconActive] in nav"
          :key="key"
          :to="href"
          class="nav-item group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200"
          :class="$route.name === key ? 'nav-active' : 'nav-inactive'"
        >
          <span :class="[$route.name === key ? iconActive : icon, 'size-5 transition-all duration-200']" />
          <span>{{ t(`nav.${key}`) }}</span>
        </RouterLink>
      </nav>

      <!-- AI Panel Toggle Button -->
      <button
        class="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/90 px-3 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:shadow-sm dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
        @click="toggleAiPanel"
      >
        <span :class="[aiPanelOpen ? 'icon-[solar--chat-round-close-bold-duotone]' : 'icon-[solar--chat-round-dots-bold-duotone]', 'size-5']" />
        <span>{{ aiPanelOpen ? '关闭AI' : 'AI 助手' }}</span>
      </button>
    </aside>

    <!-- Main Content Area - offset left by sidebar width to prevent overlap -->
    <main :class="[
      route.name === 'login' ? '' : 'pb-20 lg:pb-0',
      route.name !== 'login' ? 'lg:ml-[260px]' : '',
      aiPanelOpen && route.name !== 'login' && !isMobile ? 'lg:pr-[380px]' : ''
    ]">
      <!-- Mobile Header with menu toggle -->
      <header v-if="route.name !== 'login'" class="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/60 bg-white/75 px-4 py-3 backdrop-blur-xl dark:border-slate-700/40 dark:bg-slate-900/80 lg:hidden">
        <button class="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" @click="mobileMenuOpen = !mobileMenuOpen">
          <span class="icon-[solar--hamburger-menu-linear size-6 text-slate-600 dark:text-slate-300]" />
        </button>
        <span class="font-semibold text-slate-800 dark:text-slate-100">{{ $t(`nav.${String(route.name) || 'dashboard'}`) }}</span>
        <div class="w-10" />
      </header>

      <div :class="route.name !== 'login' ? 'p-4 sm:p-6 lg:p-8' : ''">
        <RouterView />
      </div>
    </main>

    <!-- Right Side AI Panel (Desktop) -->
    <Transition name="panel-slide">
      <aside
        v-if="aiPanelOpen && route.name !== 'login' && !isMobile"
        class="fixed right-0 top-0 z-30 hidden h-screen w-[370px] border-l border-slate-200/60 bg-white/85 p-4 backdrop-blur-xl shadow-xl dark:border-slate-700/40 dark:bg-slate-900/95"
      >
        <div class="flex h-full flex-col">
          <div class="mb-4 flex items-center justify-between border-b border-slate-200/50 pb-3 dark:border-slate-700/30">
            <div class="flex items-center gap-2">
              <span class="icon-[solar--magic-stick-3-bold-duotone] size-5 text-sky-500" />
              <h2 class="font-semibold text-sm text-slate-800 dark:text-slate-100">AI 助手</h2>
            </div>
            <button class="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" @click="aiPanelOpen = false">
              <span class="icon-[solar--close-circle-bold-duotone] size-5 text-slate-400" />
            </button>
          </div>
          <div class="flex-1 overflow-auto rounded-xl bg-slate-50/70 p-4 dark:bg-slate-800/30">
            <p class="text-sm leading-relaxed text-slate-500 dark:text-slate-400">选择模型后直接描述目标。我会基于完整的 ADB/APK 能力帮你完成操作。</p>
            <div class="mt-4 space-y-2">
              <div class="rounded-lg bg-sky-50/90 px-3 py-2.5 text-xs text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">设备控制、应用管理、文件操作</div>
              <div class="rounded-lg bg-emerald-50/90 px-3 py-2.5 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">可多选设备批量操作</div>
              <div class="rounded-lg bg-violet-50/90 px-3 py-2.5 text-xs text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">可开启联网搜索获取最新信息</div>
            </div>
          </div>
          <div class="mt-4 rounded-xl border border-slate-200/60 bg-white/70 p-3 dark:border-slate-700/40 dark:bg-slate-800/50">
            <textarea
              placeholder="描述你的需求..."
              class="w-full resize-none rounded-lg border-0 bg-transparent p-2 text-sm outline-none placeholder:text-slate-400 dark:text-slate-200"
              rows="2"
            />
            <div class="mt-2 flex items-center justify-between">
              <select class="rounded-lg border border-slate-200/70 bg-white/90 px-2 py-1.5 text-xs dark:border-slate-600/50 dark:bg-slate-700/70 dark:text-slate-200">
                <option>选择模型</option>
              </select>
              <button class="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors">
                <span class="icon-[solar--plain-2-bold size-3.5" />
                发送
              </button>
            </div>
          </div>
        </div>
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

    <!-- Toast Notifications -->
    <TransitionGroup name="toast" tag="div" class="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="cursor-pointer rounded-xl border border-white/65 bg-white/88 px-4 py-3 text-sm shadow-xl backdrop-blur-xl"
        :class="toast.type === 'error' ? 'border-rose-200 text-rose-700 dark:border-rose-900 dark:text-rose-200' : toast.type === 'success' ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-100'"
        @click="openToastTarget(toast.target)"
      >
        {{ toast.message }}
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

/* Panel Slide Animation */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: transform 300ms ease, opacity 300ms ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
