import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import DashboardView from '@/views/DashboardView.vue'
import LoginView from '@/views/LoginView.vue'
import DevicesView from '@/views/DevicesView.vue'
import DeviceDetailView from '@/views/DeviceDetailView.vue'
import SettingsView from '@/views/SettingsView.vue'
import AgentView from '@/views/AgentView.vue'
import TasksView from '@/views/TasksView.vue'
import LogsView from '@/views/LogsView.vue'
import HelpView from '@/views/HelpView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/devices', name: 'devices', component: DevicesView },
    { path: '/devices/:deviceId', name: 'device-detail', component: DeviceDetailView },
    { path: '/agent', name: 'agent', component: AgentView },
    { path: '/tasks', name: 'tasks', component: TasksView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/logs', name: 'logs', component: LogsView },
    { path: '/help', name: 'help', component: HelpView },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.loaded) {
    await auth.refresh().catch(() => {
      auth.authenticated = false
      auth.loaded = true
    })
  }

  if (!to.meta.public && !auth.authenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.public && auth.authenticated) {
    return { name: 'dashboard' }
  }
})
