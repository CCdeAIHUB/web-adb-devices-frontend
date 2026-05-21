<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  options: Array<{ label: string; value: string }>
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const selected = computed(() => props.options.find((item) => item.value === props.modelValue))

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
}

function closeOnOutside(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) {
    open.value = false
  }
}

watch(open, (value) => {
  if (value) document.addEventListener('mousedown', closeOnOutside)
  else document.removeEventListener('mousedown', closeOnOutside)
})

onBeforeUnmount(() => document.removeEventListener('mousedown', closeOnOutside))
</script>

<template>
  <div ref="root" class="liquid-select">
    <button type="button" class="liquid-select-trigger" :class="open ? 'is-open' : ''" :disabled="disabled" @click="open = !open">
      <span class="truncate">{{ selected?.label || placeholder || '请选择' }}</span>
      <span class="icon-[solar--alt-arrow-down-bold-duotone] size-5 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
    </button>
    <Transition name="liquid-select">
      <div v-if="open" class="liquid-select-menu">
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
  </div>
</template>
