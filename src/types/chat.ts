// /src/types/chat.ts
export interface Message {
    id: string;
    chat_id: string;
    is_human: boolean;
    content: string;
    timestamp: string;
    metadata: {
        active?: boolean;
        processingTime?: string;
        sender_id?: string;
        sender_type?: "user" | "agent";
        message_type?: "message" | "token" | "complete" | "error";
        phase?: "idle" | "thinking" | "typing" | "done";
        agentId?: string;
    };
    _origin?: 'websocket' | 'history' | 'cache';  // Track message origin
    source?: 'props' | 'history';  // Track message source in UI
}
  