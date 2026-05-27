<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  options: Array<{ label: string; value: string }>
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const teleportTarget = ref<HTMLElement | 'body'>('body')
const selected = computed(() => props.options.find((item) => item.value === props.modelValue))
const selectedLabel = computed(() => selected.value?.label ?? (props.modelValue ? props.modelValue : props.placeholder || '请选择'))

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function closeOnOutside(event: MouseEvent) {
  const target = event.target as Node
  if (root.value && !root.value.contains(target) && !(menu.value?.contains(target) ?? false)) {
    open.value = false
  }
}

function updatePosition() {
  if (!root.value) return
  teleportTarget.value = (document.fullscreenElement as HTMLElement | null) ?? 'body'
  const rect = root.value.getBoundingClientRect()
  const gap = 8
  const preferredHeight = 288
  const spaceBelow = window.innerHeight - rect.bottom - gap
  const spaceAbove = rect.top - gap
  const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow
  const maxHeight = Math.max(128, Math.min(preferredHeight, (placeAbove ? spaceAbove : spaceBelow) - gap))
  menuStyle.value = {
    position: 'fixed',
    left: `${Math.max(8, rect.left)}px`,
    width: `${rect.width}px`,
    maxHeight: `${maxHeight}px`,
    zIndex: '9999',
    ...(placeAbove
      ? { bottom: `${Math.max(8, window.innerHeight - rect.top + gap)}px` }
      : { top: `${Math.min(window.innerHeight - 8, rect.bottom + gap)}px` }),
  }
}

watch(open, (value) => {
  if (value) {
    nextTick(updatePosition)
    document.addEventListener('mousedown', closeOnOutside)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('fullscreenchange', updatePosition)
  } else {
    document.removeEventListener('mousedown', closeOnOutside)
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
    document.removeEventListener('fullscreenchange', updatePosition)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', closeOnOutside)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  document.removeEventListener('fullscreenchange', updatePosition)
})
</script>

<template>
  <div ref="root" class="liquid-select">
    <button type="button" class="liquid-select-trigger" :class="open ? 'is-open' : ''" :disabled="disabled" @click="open = !open">
      <span class="truncate">{{ selectedLabel }}</span>
      <span class="icon-[solar--alt-arrow-down-bold-duotone] size-5 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>
    <Teleport :to="teleportTarget">
      <Transition name="liquid-select">
        <div v-if="open" ref="menu" class="liquid-select-menu" :style="menuStyle">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="liquid-select-option"
            :class="option.value === modelValue ? 'is-selected' : ''"
            @click="choose(option.value)"
          >
            <span class="truncate">{{ option.label }}</span>
            <span v-if="option.value === modelValue" class="icon-[solar--check-circle-bold-duotone] size-5 shrink-0 text-sky-500" />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
