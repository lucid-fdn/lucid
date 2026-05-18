import { LucidHttpClient, type LucidRequestOptions } from './fetcher.js'
import {
  nativeBootstrapSchema,
  nativeDeviceDeleteResponseSchema,
  nativeDeviceListResponseSchema,
  nativeDeviceResponseSchema,
  type NativeBootstrap,
  type NativeDeviceListResponse,
  type NativeDeviceResponse,
  type RegisterNativeDeviceInput,
  type UpdateNativeDeviceInput,
} from './schemas.js'

export class LucidAppClient {
  private readonly http: LucidHttpClient

  constructor(options: LucidRequestOptions) {
    this.http = new LucidHttpClient(options)
  }

  getBootstrap(): Promise<NativeBootstrap> {
    return this.http.get('/api/native/bootstrap', nativeBootstrapSchema)
  }

  listDevices(): Promise<NativeDeviceListResponse> {
    return this.http.get('/api/native/devices', nativeDeviceListResponseSchema)
  }

  registerDevice(input: RegisterNativeDeviceInput): Promise<NativeDeviceResponse> {
    return this.http.post('/api/native/devices', nativeDeviceResponseSchema, input)
  }

  updateDevice(id: string, input: UpdateNativeDeviceInput): Promise<NativeDeviceResponse> {
    return this.http.patch(`/api/native/devices/${encodeURIComponent(id)}`, nativeDeviceResponseSchema, input)
  }

  async deleteDevice(id: string): Promise<void> {
    await this.http.delete(`/api/native/devices/${encodeURIComponent(id)}`, nativeDeviceDeleteResponseSchema)
  }
}

export function createLucidAppClient(options: LucidRequestOptions): LucidAppClient {
  return new LucidAppClient(options)
}
