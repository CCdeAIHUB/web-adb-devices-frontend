import { createI18n } from 'vue-i18n'

const messages = {
  zh: {
    nav: { dashboard: '??', devices: '??', agent: 'Agent', tasks: '??', settings: '??', help: '??' },
    auth: { password: '?????', login: '??' },
    states: { Offline: '???', Unauthorized: '???', Matched: 'ADB ???', Online: '???', Protected: '????', Updating: '???' },
    settings: { general: '??', network: '??', security: '??', devices: '??', media: '??', automation: '???', agent: 'AI Agent', advanced: '??', logs: '??' },
  },
  en: {
    nav: { dashboard: 'Overview', devices: 'Devices', agent: 'Agent', tasks: 'Tasks', settings: 'Settings', help: 'Help' },
    auth: { password: 'Admin password', login: 'Sign in' },
    states: { Offline: 'Disconnected', Unauthorized: 'Needs authorization', Matched: 'ADB connected', Online: 'Connected', Protected: 'Protected', Updating: 'Updating' },
    settings: { general: 'General', network: 'Network', security: 'Security', devices: 'Devices', media: 'Screen', automation: 'Automation', agent: 'AI Agent', advanced: 'Advanced', logs: 'Logs' },
  },
}

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('wad_locale') ?? 'zh',
  fallbackLocale: 'en',
  messages,
})
