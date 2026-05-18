import { LucidHttpClient, type LucidRequestOptions } from './fetcher.js'
import {
  nativeBootstrapSchema,
  nativeActionDispatchResponseSchema,
  nativeDeviceDeleteResponseSchema,
  nativeDeviceListResponseSchema,
  nativeDeviceResponseSchema,
  nativePushRegistrationResponseSchema,
  nativeSessionHandoffResponseSchema,
  nativeVoiceCommandResponseSchema,
  type NativeActionDispatchInput,
  type NativeActionDispatchResponse,
  type NativeBootstrap,
  type NativeDeviceListResponse,
  type NativeDeviceResponse,
  type NativePushRegistrationInput,
  type NativePushRegistrationResponse,
  type NativeSessionHandoffInput,
  type NativeSessionHandoffResponse,
  type NativeVoiceCommandInput,
  type NativeVoiceCommandResponse,
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

  createSessionHandoff(input: NativeSessionHandoffInput): Promise<NativeSessionHandoffResponse> {
    return this.http.post('/api/native/session/handoff', nativeSessionHandoffResponseSchema, input)
  }

  registerPushToken(input: NativePushRegistrationInput): Promise<NativePushRegistrationResponse> {
    return this.http.post('/api/native/push/register', nativePushRegistrationResponseSchema, input)
  }

  createVoiceCommand(input: NativeVoiceCommandInput): Promise<NativeVoiceCommandResponse> {
    return this.http.post('/api/native/voice/commands', nativeVoiceCommandResponseSchema, input)
  }

  dispatchNativeAction(input: NativeActionDispatchInput): Promise<NativeActionDispatchResponse> {
    return this.http.post('/api/native/actions/dispatch', nativeActionDispatchResponseSchema, input)
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
