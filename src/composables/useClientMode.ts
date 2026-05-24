import { computed, readonly, ref } from 'vue'

export type ClientMode = 'desktop' | 'mobile'

const clientMode = ref<ClientMode>('desktop')
const viewportWidth = ref(0)
let started = false

function getNavigatorInfo() {
  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean; platform?: string }
  }
  return {
    userAgent: nav.userAgent ?? '',
    platform: `${nav.userAgentData?.platform ?? ''} ${nav.platform ?? ''}`,
    uaMobile: nav.userAgentData?.mobile === true,
    touchPoints: nav.maxTouchPoints ?? 0,
  }
}

function matchesMedia(query: string) {
  return window.matchMedia(query).matches
}

function resolveClientMode(): ClientMode {
  viewportWidth.value = window.innerWidth

  const { userAgent, platform, uaMobile, touchPoints } = getNavigatorInfo()
  const text = `${platform} ${userAgent}`
  const ipadDesktopUa = /Macintosh/i.test(userAgent) && touchPoints > 1
  const mobileUa = uaMobile || /Android|iPhone|iPad|iPod|Windows Phone|Mobile|Tablet/i.test(userAgent) || ipadDesktopUa
  const desktopPlatform = !ipadDesktopUa && /Win32|Win64|Windows|MacIntel|Macintosh|Linux x86_64|X11|CrOS/i.test(text)
  const finePointer = matchesMedia('(any-pointer: fine)')
  const hover = matchesMedia('(any-hover: hover)')
  const coarseOnly = matchesMedia('(any-pointer: coarse)') && matchesMedia('(any-hover: none)')

  if (desktopPlatform || (finePointer && hover && !mobileUa)) {
    return 'desktop'
  }

  if (mobileUa || (touchPoints > 0 && coarseOnly)) {
    return 'mobile'
  }

  return viewportWidth.value < 768 ? 'mobile' : 'desktop'
}

function applyClientMode() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return
  }

  const mode = resolveClientMode()
  clientMode.value = mode
  document.documentElement.dataset.clientMode = mode
  document.documentElement.classList.toggle('client-desktop', mode === 'desktop')
  document.documentElement.classList.toggle('client-mobile', mode === 'mobile')
}

function startClientMode() {
  if (started || typeof window === 'undefined') {
    return
  }

  started = true
  applyClientMode()
  window.addEventListener('resize', applyClientMode)
  window.addEventListener('orientationchange', applyClientMode)
  window.visualViewport?.addEventListener('resize', applyClientMode)

  for (const query of ['(any-pointer: fine)', '(any-pointer: coarse)', '(any-hover: hover)', '(any-hover: none)']) {
    window.matchMedia(query).addEventListener('change', applyClientMode)
  }
}

export function useClientMode() {
  startClientMode()

  return {
    clientMode: readonly(clientMode),
    viewportWidth: readonly(viewportWidth),
    isDesktopClient: computed(() => clientMode.value === 'desktop'),
    isMobileClient: computed(() => clientMode.value === 'mobile'),
    refreshClientMode: applyClientMode,
  }
}
