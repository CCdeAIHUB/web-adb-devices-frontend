<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const password = ref('')
const error = ref('')
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

async function submit() {
  error.value = ''
  try {
    await auth.login(password.value)
    await router.push((route.query.redirect as string) || '/')
  } catch {
    error.value = 'ERR_LOGIN_FAILED'
  }
}
</script>

<template>
  <section class="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
    <form class="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6" @submit.prevent="submit">
      <div class="mb-6 flex items-center gap-3">
        <span class="icon-[solar--shield-keyhole-outline] size-7 text-sky-400" />
        <h1 class="text-lg font-semibold">Web ADB Devices</h1>
      </div>
      <label class="mb-2 block text-sm text-slate-300" for="password">{{ t('auth.password') }}</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        class="h-11 w-full rounded-md border border-slate-700 bg-slate-950 px-3 outline-none focus:border-sky-500"
      >
      <p v-if="error" class="mt-3 text-sm text-rose-300">{{ error }}</p>
      <button class="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-sky-500 font-medium text-white hover:bg-sky-600">
        <span class="icon-[solar--login-3-outline] size-5" />
        {{ t('auth.login') }}
      </button>
    </form>
  </section>
</template>
