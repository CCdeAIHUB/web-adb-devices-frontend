import { createI18n } from 'vue-i18n'

const messages = {
  zh: {
    nav: { dashboard: '总览', devices: '设备', agent: 'Agent', tasks: '任务', settings: '设置', logs: '日志' },
    auth: { password: '管理员密码', login: '登录' },
    states: { Offline: '未连接', Unauthorized: '未授权', Matched: '已匹配', Online: '已连接', Protected: '异常保护', Updating: '更新中' },
    settings: { general: '常规', network: '网络', security: '安全', resources: '资源', devices: '设备', media: '投屏', automation: '自动化', agent: 'AI Agent', advanced: '高级' },
  },
  en: {
    nav: { dashboard: 'Overview', devices: 'Devices', agent: 'Agent', tasks: 'Tasks', settings: 'Settings', logs: 'Logs' },
    auth: { password: 'Admin password', login: 'Sign in' },
    states: { Offline: 'Offline', Unauthorized: 'Unauthorized', Matched: 'Matched', Online: 'Online', Protected: 'Protected', Updating: 'Updating' },
    settings: { general: 'General', network: 'Network', security: 'Security', resources: 'Resources', devices: 'Devices', media: 'Screen', automation: 'Automation', agent: 'AI Agent', advanced: 'Advanced' },
  },
}

export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('wad_locale') ?? 'zh',
  fallbackLocale: 'en',
  messages,
})
