import { defineStore } from 'pinia'
import { api } from '@/api/client'

export interface DeviceRecord {
  deviceId: string
  temporaryAdbSerial?: string
  model?: string
  apkVersion?: string
  displayState: 'Offline' | 'Unauthorized' | 'Matched' | 'Online' | 'Protected' | 'Updating'
  internalState: string
  updatedAt: string
}

export const useDeviceStore = defineStore('devices', {
  state: () => ({
    devices: [] as DeviceRecord[],
  }),
  actions: {
    async load() {
      this.devices = await api<DeviceRecord[]>('/api/devices')
    },
  },
})
