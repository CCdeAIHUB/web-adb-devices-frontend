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

export interface AdbScannedDevice {
  serial: string
  state: 'device' | 'unauthorized' | 'offline' | string
  model?: string
  product?: string
  transportId?: string
}

export interface AdbScanResponse {
  success: boolean
  errorCode?: string
  stderr: string
  devices: AdbScannedDevice[]
  records: DeviceRecord[]
}

export const useDeviceStore = defineStore('devices', {
  state: () => ({
    devices: [] as DeviceRecord[],
    adbScan: null as AdbScanResponse | null,
    scanning: false,
  }),
  actions: {
    async load() {
      this.devices = await api<DeviceRecord[]>('/api/devices')
    },
    async scanAdb() {
      this.scanning = true
      try {
        this.adbScan = await api<AdbScanResponse>('/api/devices/adb/scan', {
          method: 'POST',
          body: JSON.stringify({}),
        })
        this.devices = this.adbScan.records
      } finally {
        this.scanning = false
      }
    },
  },
})
