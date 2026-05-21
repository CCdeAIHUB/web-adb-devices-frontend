<template>
  <section class="liquid-shell min-h-screen p-4 text-slate-950 dark:text-slate-100 sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">帮助</h1>
        <p class="mt-1 text-sm text-slate-500">连接、授权、安装 APK 和常见错误处理。</p>
      </div>
      <RouterLink class="glass-button glass-button-primary" to="/devices">
        <span class="icon-[solar--devices-bold-duotone] size-5" />
        <span>打开设备</span>
      </RouterLink>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <article id="install-apk" class="glass-panel p-5">
        <h2 class="font-semibold">安装内置 APK</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          设备必须先完成 ADB 授权。进入设备详情页，若显示 ADB 已连接但 APK 未安装，可以点击“安装内置 APK”。安装后请在手机上允许相关权限，再等待状态变为“已连接”。
        </p>
      </article>
      <article id="adb-auth" class="glass-panel p-5">
        <h2 class="font-semibold">ADB 授权</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          USB 连接时，手机会弹出调试授权确认。请选择允许。如果没有弹窗，可以重新插拔数据线，或在开发者选项中撤销 USB 调试授权后重新连接。
        </p>
      </article>
      <article id="apk-cert" class="glass-panel p-5">
        <h2 class="font-semibold">APK 安装失败</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          如果提示证书或解析失败，通常说明 APK 构建产物没有签名或损坏。请使用 CI 生成的新安装包，或在发布流程中确保 release APK 已签名并被正确打包。
        </p>
      </article>
      <article id="notifications" class="glass-panel p-5">
        <h2 class="font-semibold">通知跳转</h2>
        <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          出现需要用户处理的错误时，通知会给出简短说明；点击通知会进入对应帮助或设备页面。
        </p>
      </article>
    </div>
  </section>
</template>
