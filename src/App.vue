<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

const nav = [
  ['dashboard', '/', 'icon-[solar--home-2-outline]'],
  ['devices', '/devices', 'icon-[solar--devices-outline]'],
  ['agent', '/agent', 'icon-[solar--magic-stick-3-outline]'],
  ['settings', '/settings', 'icon-[solar--settings-outline]'],
  ['logs', '/logs', 'icon-[solar--document-text-outline]'],
] as const
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
    <aside
      v-if="route.name !== 'login'"
      class="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-950/90 lg:block"
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
          class="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-slate-600 hover:bg-sky-50 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-slate-900"
          active-class="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
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
