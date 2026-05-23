import { createI18n } from 'vue-i18n'

const messages = {
  zh: {
    nav: { dashboard: '总览', devices: '设备', agent: 'AI助手', tasks: '任务', settings: '设置', logs: '日志', help: '帮助' },
    auth: { password: '管理员密码', login: '登录' },
    states: { Offline: '未连接', Unauthorized: '待授权', Matched: 'ADB 已连接', Online: '已连接', Authorized: '已授权', Protected: '异常保护', Updating: '更新中' },
    settings: { general: '常规', network: '网络', security: '安全', devices: '设备', media: '投屏', automation: '自动化', agent: 'AI Agent', advanced: '高级', help: '帮助与日志' },
  },
  en: {
    nav: { dashboard: 'Overview', devices: 'Devices', agent: 'Agent', tasks: 'Tasks', settings: 'Settings', logs: 'Logs', help: 'Help' },
    auth: { password: 'Admin password', login: 'Sign in' },
    states: { Offline: 'Disconnected', Unauthorized: 'Needs authorization', Matched: 'ADB connected', Online: 'Connected', Authorized: 'Authorized', Protected: 'Protected', Updating: 'Updating' },
    settings: { general: 'General', network: 'Network', security: 'Security', devices: 'Devices', media: 'Screen', automation: 'Automation', agent: 'AI Agent', advanced: 'Advanced', help: 'Help & Logs' },
  },
}

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('wad_locale') ?? 'zh',
  fallbackLocale: 'en',
  messages,
})
