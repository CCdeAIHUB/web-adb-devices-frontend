import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import './styles.css'

const theme = localStorage.getItem('wad_theme') ?? 'system'
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark))

createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .mount('#app')
