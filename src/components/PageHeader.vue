<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'

const aiPanelOpen = inject<Ref<boolean> | undefined>('aiPanelOpen', undefined)
const toggleAiPanel = inject<(() => void) | undefined>('toggleAiPanel', undefined)
</script>

<template>
  <div class="page-header mb-5 flex flex-wrap items-center justify-between gap-3">
    <div class="min-w-0">
      <slot />
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <slot name="actions" />
      <!-- AI toggle button (desktop only, provided by App.vue) -->
      <button
        v-if="toggleAiPanel"
        class="hidden lg:inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/90 px-3 text-sm font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:shadow-sm dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
        @click="toggleAiPanel"
      >
        <span :class="[aiPanelOpen?.value ? 'icon-[solar--close-circle-bold]' : 'icon-[solar--magic-stick-3-bold]', 'size-4.5']" />
        <span>{{ aiPanelOpen?.value ? '关闭AI' : 'AI 助手' }}</span>
      </button>
    </div>
  </div>
</template>
