import { defineStore } from 'pinia'
import { api } from '@/api/client'

interface SessionResponse {
  authenticated: boolean
  isDefaultPassword: boolean
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    authenticated: false,
    isDefaultPassword: false,
    loaded: false,
  }),
  actions: {
    async refresh() {
      const session = await api<SessionResponse>('/api/auth/session')
      this.authenticated = session.authenticated
      this.isDefaultPassword = session.isDefaultPassword
      this.loaded = true
    },
    async login(password: string) {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      await this.refresh()
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST' })
      this.authenticated = false
    },
  },
})
