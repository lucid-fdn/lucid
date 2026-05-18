import { LucidHttpClient, type LucidRequestOptions } from './fetcher.js'
import {
  nativeActionDispatchResponseSchema,
  nativeApprovalDetailResponseSchema,
  nativeApprovalDecisionResponseSchema,
  nativeApprovalExplainResponseSchema,
  nativeBootstrapSchema,
  nativeDeviceDeleteResponseSchema,
  nativeDeviceListResponseSchema,
  nativeDeviceResponseSchema,
  nativeInboxResponseSchema,
  nativePushRegistrationResponseSchema,
  nativeRunControlResponseSchema,
  nativeRunDetailResponseSchema,
  nativeRunsResponseSchema,
  nativeSessionHandoffResponseSchema,
  nativeSessionRefreshResponseSchema,
  nativeSessionRevokeResponseSchema,
  nativeShareResponseSchema,
  nativeVoiceCommandResponseSchema,
  type NativeActionDispatchInput,
  type NativeActionDispatchResponse,
  type NativeApprovalDetailResponse,
  type NativeApprovalDecisionInput,
  type NativeApprovalDecisionResponse,
  type NativeApprovalExplainResponse,
  type NativeBootstrap,
  type NativeDeviceListResponse,
  type NativeDeviceResponse,
  type NativeInboxResponse,
  type NativePushRegistrationInput,
  type NativePushRegistrationResponse,
  type NativeRunControlInput,
  type NativeRunControlResponse,
  type NativeRunDetailResponse,
  type NativeRunsResponse,
  type NativeSessionHandoffInput,
  type NativeSessionHandoffResponse,
  type NativeSessionExchangeInput,
  type NativeSessionRefreshInput,
  type NativeSessionRefreshResponse,
  type NativeSessionRevokeInput,
  type NativeSessionRevokeResponse,
  type NativeShareInput,
  type NativeShareResponse,
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

  exchangeSessionHandoff(input: NativeSessionExchangeInput): Promise<NativeSessionRefreshResponse> {
    return this.http.post('/api/native/session/exchange', nativeSessionRefreshResponseSchema, input)
  }

  refreshSession(input: NativeSessionRefreshInput): Promise<NativeSessionRefreshResponse> {
    return this.http.post('/api/native/session/refresh', nativeSessionRefreshResponseSchema, input)
  }

  revokeSession(input: NativeSessionRevokeInput): Promise<NativeSessionRevokeResponse> {
    return this.http.post('/api/native/session/revoke', nativeSessionRevokeResponseSchema, input)
  }

  getInbox(): Promise<NativeInboxResponse> {
    return this.http.get('/api/native/inbox', nativeInboxResponseSchema)
  }

  listRuns(): Promise<NativeRunsResponse> {
    return this.http.get('/api/native/runs', nativeRunsResponseSchema)
  }

  getRun(id: string): Promise<NativeRunDetailResponse> {
    return this.http.get(`/api/native/runs/${encodeURIComponent(id)}`, nativeRunDetailResponseSchema)
  }

  getApproval(id: string): Promise<NativeApprovalDetailResponse> {
    return this.http.get(`/api/native/approvals/${encodeURIComponent(id)}`, nativeApprovalDetailResponseSchema)
  }

  decideApproval(id: string, input: NativeApprovalDecisionInput): Promise<NativeApprovalDecisionResponse> {
    return this.http.post(`/api/native/approvals/${encodeURIComponent(id)}/decision`, nativeApprovalDecisionResponseSchema, input)
  }

  explainApproval(id: string): Promise<NativeApprovalExplainResponse> {
    return this.http.post(`/api/native/approvals/${encodeURIComponent(id)}/explain`, nativeApprovalExplainResponseSchema)
  }

  controlRun(id: string, input: NativeRunControlInput): Promise<NativeRunControlResponse> {
    return this.http.post(`/api/native/runs/${encodeURIComponent(id)}/control`, nativeRunControlResponseSchema, input)
  }

  shareToLucid(input: NativeShareInput): Promise<NativeShareResponse> {
    return this.http.post('/api/native/share', nativeShareResponseSchema, input)
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
