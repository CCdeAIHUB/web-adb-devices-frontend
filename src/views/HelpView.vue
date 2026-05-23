<script setup lang="ts">
import { RouterLink } from 'vue-router'
import pixelGuide from '@/assets/help/pixel-permissions.svg'
import xiaomiGuide from '@/assets/help/xiaomi-permissions.svg'
import oppoGuide from '@/assets/help/oppo-permissions.svg'
import vivoGuide from '@/assets/help/vivo-permissions.svg'
import samsungGuide from '@/assets/help/samsung-permissions.svg'

const connectionSteps = [
  { title: '连接 ADB', body: '使用数据线连接设备，手机弹出 USB 调试授权时选择允许；无线 ADB 设备会单独标记，避免和 USB ADB 混在一起。' },
  { title: '安装内置 APK', body: '设备状态为“ADB 已连接”但 APK 未在线时，在设备详情页安装内置 APK。安装失败会通过通知提示原因。' },
  { title: '授予手机权限', body: '安装完成后，在手机上开启无障碍服务、输入法、通知和后台运行权限。完成后回到客户端等待设备变为“已连接”。' },
  { title: '开始代理操作', body: 'AI Agent 会根据对话判断是否需要操作设备，并在需要时让你选择一台或多台设备，不会把每一句话都变成任务。' },
]

const vendorGuides = [
  {
    name: 'Pixel / 原生 Android',
    image: pixelGuide,
    path: '设置 > 无障碍 > 已下载的应用 > Web ADB Devices',
    note: '开启无障碍服务后，再到系统输入法页面启用 Web ADB 输入法。',
  },
  {
    name: '小米 / HyperOS / MIUI',
    image: xiaomiGuide,
    path: '设置 > 更多设置 > 无障碍 > 已下载的应用',
    note: '还需要在“省电策略”里选择无限制，并允许后台弹出界面。',
  },
  {
    name: 'OPPO / OnePlus / ColorOS',
    image: oppoGuide,
    path: '设置 > 其他设置 > 无障碍 > 已下载的服务',
    note: '如果 APK 在线不稳定，请打开自启动并关闭电池优化。',
  },
  {
    name: 'vivo / iQOO / OriginOS',
    image: vivoGuide,
    path: '设置 > 快捷与辅助 > 无障碍 > 已安装服务',
    note: '部分机型需要在后台耗电管理中允许后台高耗电运行。',
  },
  {
    name: 'Samsung / One UI',
    image: samsungGuide,
    path: '设置 > 辅助功能 > 已安装的应用程序',
    note: '启用后确认通知权限，必要时在电池中设置为不受限制。',
  },
]

const permissionCards = [
  { id: 'accessibility', title: '无障碍服务', body: '用于读取界面结构、点击控件和辅助完成自动化。开启后手机会显示系统安全确认，这是 Android 的正常保护流程。' },
  { id: 'input-method', title: '输入法', body: '用于稳定输入中文、验证码之外的普通文本和长文本。需要在系统输入法列表中启用，并在需要输入时切换到 Web ADB 输入法。' },
  { id: 'notifications', title: '通知权限', body: '用于显示连接状态、错误原因和需要你处理的权限步骤。点击客户端通知会跳到对应的帮助位置。' },
  { id: 'battery', title: '后台运行', body: '用于保持 APK Companion 在线。建议关闭电池优化、允许自启动，并把后台策略设置为无限制。' },
]

const errors = [
  { id: 'adb-auth', title: '没有 ADB 授权弹窗', body: '重新插拔数据线，确认数据线支持传输；仍没有弹窗时，在开发者选项里撤销 USB 调试授权后重新连接。' },
  { id: 'apk-cert', title: 'APK 证书或解析失败', body: '通常是 APK 文件损坏或未使用正确构建产物。当前客户端会优先安装内置调试签名 APK；失败时通知会给出原始错误。' },
  { id: 'install-apk', title: '已安装 APK 但仍未在线', body: '先打开 APK 并点击启动 Companion，再检查无障碍、通知、输入法和后台权限。部分系统需要重新启动 APK。' },
  { id: 'wireless-adb', title: '无线 ADB 与 USB ADB', body: '无线 ADB 会显示为网络地址或配对设备，不计入 USB ADB。状态判断会分别处理，避免把无线设备误认为有线连接。' },
]
</script>

<template>
  <section class="min-h-[calc(100vh-8rem)] text-slate-950 dark:text-slate-100">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">连接帮助</h1>
        <p class="mt-1 text-sm text-slate-500">按设备连接、APK 安装和手机权限逐步排查。</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink class="glass-button" to="/devices">
          <span class="icon-[solar--devices-bold-duotone] size-5" />
          <span>查看设备</span>
        </RouterLink>
        <RouterLink class="glass-button" to="/settings?section=logs">
          <span class="icon-[solar--document-text-bold-duotone] size-5" />
          <span>查看日志</span>
        </RouterLink>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <article class="glass-panel p-5">
        <h2 class="text-base font-semibold">从连接到可控</h2>
        <div class="mt-4 grid gap-3">
          <div v-for="(step, index) in connectionSteps" :key="step.title" class="rounded-2xl border border-white/45 bg-white/40 p-4 dark:border-white/10 dark:bg-white/5">
            <div class="mb-2 flex items-center gap-3">
              <span class="grid size-8 place-items-center rounded-full bg-sky-500/15 text-sm font-bold text-sky-700 dark:text-sky-200">{{ index + 1 }}</span>
              <h3 class="font-semibold">{{ step.title }}</h3>
            </div>
            <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">{{ step.body }}</p>
          </div>
        </div>
      </article>

      <article id="apk-permissions" class="glass-panel p-5">
        <h2 class="text-base font-semibold">APK 权限要开启哪些</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div v-for="item in permissionCards" :id="item.id" :key="item.id" class="rounded-2xl border border-white/45 bg-white/40 p-4 dark:border-white/10 dark:bg-white/5">
            <h3 class="font-semibold">{{ item.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ item.body }}</p>
          </div>
        </div>
      </article>
    </div>

    <section class="mt-4 glass-panel p-5">
      <div class="mb-4 flex items-center gap-2">
        <span class="icon-[solar--smartphone-2-bold-duotone] size-6 text-sky-500" />
        <h2 class="text-base font-semibold">不同手机的示例路径</h2>
      </div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article v-for="guide in vendorGuides" :key="guide.name" class="overflow-hidden rounded-2xl border border-white/45 bg-white/40 dark:border-white/10 dark:bg-white/5">
          <img :src="guide.image" class="h-56 w-full bg-slate-100 object-contain dark:bg-slate-950" :alt="guide.name" />
          <div class="p-4">
            <h3 class="font-semibold">{{ guide.name }}</h3>
            <p class="mt-2 text-sm font-medium text-sky-700 dark:text-sky-200">{{ guide.path }}</p>
            <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ guide.note }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="mt-4 grid gap-4 lg:grid-cols-2">
      <article v-for="item in errors" :id="item.id" :key="item.id" class="glass-panel p-5">
        <h2 class="font-semibold">{{ item.title }}</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{{ item.body }}</p>
      </article>
    </section>
  </section>
</template>
