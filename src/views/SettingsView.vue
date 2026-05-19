<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const sections = [
  ['general', 'icon-[solar--tuning-2-outline]'],
  ['network', 'icon-[solar--global-outline]'],
  ['security', 'icon-[solar--shield-keyhole-outline]'],
  ['resources', 'icon-[solar--download-minimalistic-outline]'],
  ['devices', 'icon-[solar--devices-outline]'],
  ['media', 'icon-[solar--video-frame-play-horizontal-outline]'],
  ['automation', 'icon-[solar--programming-outline]'],
  ['agent', 'icon-[solar--magic-stick-3-outline]'],
  ['advanced', 'icon-[solar--settings-minimalistic-outline]'],
] as const
</script>

<template>
  <section class="p-6">
    <h1 class="mb-6 text-xl font-semibold">设置</h1>
    <div class="grid gap-3 md:grid-cols-3">
      <button
        v-for="[key, icon] in sections"
        :key="key"
        class="flex h-20 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-left hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900"
      >
        <span :class="[icon, 'size-6 text-sky-500']" />
        <span class="font-medium">{{ t(`settings.${key}`) }}</span>
      </button>
    </div>
  </section>
</template>
