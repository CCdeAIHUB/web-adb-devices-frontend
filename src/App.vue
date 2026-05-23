<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, ref, computed } from 'vue'
import logoUrl from '@/assets/logo.svg'
import LiquidSelect from '@/components/LiquidSelect.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toasts = ref<Array<{ id: number; message: string; type: 'success' | 'error' | 'info'; target?: string }>>([])
const aiPanelOpen = ref(false)
const mobileMenuOpen = ref(false)

// AI Panel state
const aiMessages = ref<Array<{ role: 'user' | 'agent'; text: string }>>([])
const aiPrompt = ref('')
const aiRunning = ref(false)
const aiProviders = ref<Array<{ id: string; displayName: string; model: string; enabled: boolean }>>([])
const aiSelectedProvider = ref('')
const aiLoaded = ref(false)

interface AiProvider {
  id: string
  providerType: string
  displayName: string
  model: string
  enabled: boolean
}
interface AgentRunResponse { runId: string; status: string; message: string }

const isMobile = computed(() => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 1024
})

const usableAiProviders = computed(() => aiProviders.value.filter((p) => p.enabled && p.model))
const aiProviderOptions = computed(() => usableAiProviders.value.map((p) => ({ label: `${p.displayName} / ${p.model}`, value: p.id })))

// Desktop nav - no agent (agent moves to right panel), no logs/help (moved to settings)
// icon format: [outline for inactive/hover, bold-filled for active/selected]
const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]', 'icon-[solar--home-2-bold]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]', 'icon-[solar--devices-bold]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]', 'icon-[solar--programming-bold]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]', 'icon-[solar--settings-bold]'],
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

function toggleAiPanel() {
  aiPanelOpen.value = !aiPanelOpen.value
  if (aiPanelOpen.value && !aiLoaded.value) loadAiPanel()
}

async function loadAiPanel() {
  try {
    const { api } = await import('@/api/client')
    aiProviders.value = await api<AiProvider[]>('/api/agent/providers')
    aiSelectedProvider.value = usableAiProviders.value[0]?.id ?? ''
    const raw = localStorage.getItem('wad_agent_conversations')
    const convos = raw ? JSON.parse(raw) : []
    if (convos.length > 0) {
      aiMessages.value = convos[0].messages ?? []
    } else {
      aiMessages.value = [{ role: 'agent', text: '选择模型后直接描述目标。我会基于完整的 ADB/APK 能力帮你完成操作。' }]
    }
    aiLoaded.value = true
  } catch { /* silent */ }
}

async function sendAiMessage() {
  if (!aiPrompt.value.trim() || !aiSelectedProvider.value) return
  const text = aiPrompt.value.trim()
  aiMessages.value.push({ role: 'user', text })
  aiPrompt.value = ''
  aiRunning.value = true
  try {
    const { api: callApi } = await import('@/api/client')
    const response = await callApi<AgentRunResponse>('/api/agent/runs', {
      method: 'POST',
      body: JSON.stringify({
        prompt: text,
        providerId: aiSelectedProvider.value,
        deviceIds: [],
        permissionMode: 'Default',
        scopes: ['device:single'],
        webSearchEnabled: false,
        attachments: [],
        history: aiMessages.value.slice(-12),
      }),
    })
    aiMessages.value.push({ role: 'agent', text: response.message })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '请求失败'
    aiMessages.value.push({ role: 'agent', text: msg })
  } finally {
    aiRunning.value = false
  }
}

onMounted(() => {
  window.addEventListener('wad:notify', pushToast)
  if (!isMobile.value && route.name === 'agent') {
    aiPanelOpen.value = true
  }
})
onUnmounted(() => window.removeEventListener('wad:notify', pushToast))
</script>

<template>
  <div class="min-h-screen text-slate-950 dark:text-slate-100">
    <!-- Desktop Sidebar -->
    <aside
      v-if="route.name !== 'login'"
      class="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-slate-200/60 bg-white/80 p-4 backdrop-blur-xl dark:border-slate-700/40 dark:bg-slate-900/85 lg:block"
    >
      <div class="mb-8 flex items-center gap-3">
        <img :src="logoUrl" alt="Web ADB Devices" class="size-9 rounded-xl shadow-md shadow-sky-500/20" />
        <strong class="text-base font-semibold text-slate-800 dark:text-slate-100">Web ADB Devices</strong>
      </div>
      <nav class="space-y-1">
        <!-- Nav items: hover shows semi-transparent outline, active shows bold-filled icon + sky highlight -->
        <RouterLink
          v-for="[key, href, icon, iconActive] in nav"
          :key="key"
          :to="href"
          class="nav-item group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-200"
          :class="$route.name === key ? 'nav-active' : 'nav-inactive'"
        >
          <!-- Icon: active = bold-filled, inactive(hover) = outline with opacity -->
          <span
            :class="[
              $route.name === key ? iconActive : icon,
              'size-5 transition-all duration-200',
              $route.name !== key ? 'group-hover:opacity-50' : ''
            ]"
          />
          <span>{{ t(`nav.${key}`) }}</span>
        </RouterLink>
      </nav>

      <!-- AI Panel Toggle Button -->
      <button
        class="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/90 px-3 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:shadow-sm dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
        @click="toggleAiPanel"
      >
        <span :class="[aiPanelOpen ? 'icon-[solar--chat-round-close-bold]' : 'icon-[solar--chat-round-dots-bold]', 'size-5']" />
        <span>{{ aiPanelOpen ? '关闭AI' : 'AI 助手' }}</span>
      </button>
    </aside>

    <!-- Main Content Area -->
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

    <!-- Right Side AI Panel (Desktop) - Full functional chat interface -->
    <Transition name="panel-slide">
      <aside
        v-if="aiPanelOpen && route.name !== 'login' && !isMobile"
        class="fixed right-0 top-0 z-30 hidden h-screen w-[380px] flex flex-col border-l border-slate-200/60 bg-white/90 backdrop-blur-xl shadow-xl dark:border-slate-700/40 dark:bg-slate-900/95"
      >
        <!-- Panel Header -->
        <div class="flex items-center justify-between border-b border-slate-200/50 px-4 py-3 dark:border-slate-700/30">
          <div class="flex items-center gap-2">
            <span class="icon-[solar--magic-stick-3-bold size-5 text-sky-500]" />
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">AI 助手</span>
          </div>
          <button class="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" @click="aiPanelOpen = false">
            <span class="icon-[solar--close-circle-bold size-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200]" />
          </button>
        </div>

        <!-- Messages Area -->
        <div class="flex-1 overflow-y-auto space-y-3 p-4">
          <div v-if="!aiLoaded" class="flex items-center justify-center py-12">
            <svg class="size-6 animate-spin text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
          <template v-else>
            <div
              v-for="(msg, idx) in aiMessages"
              :key="idx"
              class="max-w-[85%] break-words whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm"
              :class="msg.role === 'user'
                ? 'ml-auto bg-sky-500 text-white'
                : 'mr-auto border border-slate-200/60 bg-white/80 backdrop-blur-md text-slate-700 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-200'"
            >{{ msg.text }}</div>
            <div v-if="aiRunning" class="inline-flex items-center gap-2 rounded-2xl border border-slate-200/60 bg-white/80 px-3.5 py-2.5 text-xs shadow-sm backdrop-blur-md dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300">
              <span>AI 正在思考</span>
              <span class="inline-flex gap-1"><span class="thinking-dot" /><span class="thinking-dot" /><span class="thinking-dot" /></span>
            </div>
          </template>
        </div>

        <!-- Input Area -->
        <div class="border-t border-slate-200/50 p-3 dark:border-slate-700/30">
          <textarea
            v-model="aiPrompt"
            placeholder="描述你的需求..."
            rows="2"
            class="w-full resize-none rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 transition-all focus:border-sky-400 focus:ring-1 focus:ring-sky-400/20 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500"
            @keydown.ctrl.enter.prevent="sendAiMessage"
          />
          <div class="mt-2 flex items-center justify-between gap-2">
            <LiquidSelect v-model="aiSelectedProvider" class="min-w-36" :options="aiProviderOptions" placeholder="选择模型" />
            <button
              class="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
              :disabled="aiRunning || !aiSelectedProvider || !aiPrompt.trim()"
              @click="sendAiMessage"
            >
              <span class="icon-[solar--plain-2-bold size-3.5]" />
              {{ aiRunning ? '发送中' : '发送' }}
            </button>
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

    <!-- Toast Notifications - slide from right, theme-aware colors -->
    <TransitionGroup name="toast-slide-right" tag="div" class="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="cursor-pointer rounded-xl px-4 py-3 text-sm shadow-xl backdrop-blur-md transition-colors"
        :class="[
          toast.type === 'error'
            ? 'bg-rose-50/95 border border-rose-200/70 text-rose-700 dark:bg-rose-950/90 dark:border-rose-800/60 dark:text-rose-200'
            : toast.type === 'success'
              ? 'bg-emerald-50/95 border border-emerald-200/70 text-emerald-700 dark:bg-emerald-950/90 dark:border-emerald-800/60 dark:text-emerald-200'
              : 'bg-slate-50/95 border border-slate-200/70 text-slate-700 dark:bg-slate-800/95 dark:border-slate-700/60 dark:text-slate-200'
        ]"
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
