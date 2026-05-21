<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]'],
  ['agent', '/agent', 'icon-[solar--magic-stick-3-outline]'],
  ['tasks', '/tasks', 'icon-[solar--programming-outline]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]'],
  ['logs', '/logs', 'icon-[solar--document-text-outline]'],
] as const
</script>

<template>
  <div class="min-h-screen text-slate-950 dark:text-slate-100">
    <aside
      v-if="route.name !== 'login'"
      class="fixed inset-y-0 left-0 hidden w-64 border-r border-white/45 bg-white/50 p-4 shadow-[12px_0_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/45 lg:block"
    >
      <div class="mb-8 flex items-center gap-3">
        <span class="icon-[solar--smartphone-update-outline] size-7 text-sky-500" />
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
  </div>
</template>
