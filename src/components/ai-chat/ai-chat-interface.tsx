'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ModelSelector } from './model-selector';
import { AgentSelector } from './assistant-selector';
import { ChatInput } from './chat-input';
import { EmptyState } from '@/components/ai-common/empty-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Plus,
  Settings2,
  PanelLeftClose,
  PanelLeft,
  BookOpen,
  Thermometer,
  Hash,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { FileUIPart } from '@/lib/ai/attachments';
import { getAcceptForModel, isVisionCapable, IMAGE_INPUT_ACCEPT } from '@/lib/ai/attachments';
import { DEFAULT_MODEL_ID } from '@/lib/ai/models';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import type { EntitlementDeny } from '@/lib/entitlements/types';
import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log';
import { parseEntitlementError } from '@/components/entitlements/entitlement-error';
import { ChatLimitCard } from '@/components/entitlements/chat-limit-card';
import { UsageHint } from '@/components/entitlements/usage-hint';
import { useEntitlementStatus } from '@/hooks/use-entitlement-status';

interface AssistantOption {
  id: string;
  name: string;
}

interface AIChatInterfaceProps {
  orgId: string;
  projectId?: string;
  conversationId?: string;
  systemPrompt?: string;
  initialModel?: string;
  onConversationCreate?: (conversationId: string) => void;
  /** Server-prefetched model groups — passed through to ModelSelector */
  initialModels?: Array<{ provider: string; models: Array<{ id: string; modelId?: string; passportId?: string; name: string; provider: string; category: string; description?: string }> }>;
  /** When set, routes through the agent worker (AgentLoop + tools + plugins) */
  assistantId?: string;
  /** Server-prefetched assistants for the org — enables agent mode selector */
  initialAssistants?: AssistantOption[];
}

const MessageList = dynamic(() => import('./message-list').then((mod) => mod.MessageList), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Loading conversation...
    </div>
  ),
});

const ConversationSidebar = dynamic(() => import('./conversation-sidebar').then((mod) => mod.ConversationSidebar), {
  ssr: false,
  loading: () => <div className="h-full w-[280px] border-r bg-muted/30" />,
});

export function AIChatInterface({
  orgId,
  projectId,
  conversationId,
  systemPrompt,
  initialModel = DEFAULT_MODEL_ID,
  initialModels,
  assistantId: assistantIdProp,
  initialAssistants = [],
}: AIChatInterfaceProps) {
  const debugEnabled = process.env.NODE_ENV !== 'production';
  const [model, setModel] = useState(initialModel);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(assistantIdProp || null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [enableRAG, setEnableRAG] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileUIPart[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId || null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [entitlementDeny, setEntitlementDeny] = useState<EntitlementDeny | null>(null);
  const entitlementDenyRef = useRef<EntitlementDeny | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Proactive usage warnings (server-computed thresholds)
  const { data: entitlementData } = useEntitlementStatus({ orgId });
  const aiQueryItem = entitlementData?.items.find(i => i.metric === 'ai_queries_monthly') ?? null;

  // Memoize transport to avoid re-creating on every render
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const response = await fetch(input, init);

          // Intercept entitlement errors (429/403 with structured deny payload)
          if (!response.ok && (response.status === 429 || response.status === 403)) {
            try {
              const cloned = response.clone();
              const body = await cloned.json();
              const deny = parseEntitlementError(body);
              if (deny) {
                entitlementDenyRef.current = deny;
                setEntitlementDeny(deny);
              }
            } catch {
              // Not an entitlement error — let it fall through
            }
          }

          if (debugEnabled) {
            const url =
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;

            const bodyPreview = response.ok
              ? undefined
              : await response.clone().text().catch(() => '<unavailable>');

            console.log('[AIChatInterface] Transport response', {
              url,
              method: init?.method || 'GET',
              status: response.status,
              statusText: response.statusText,
              ok: response.ok,
              bodyPreview,
            });
          }

          return response;
        }) as typeof globalThis.fetch,
        body: {
          model,
          orgId,
          conversationId: activeConversationId,
          systemPrompt,
          enableRAG,
          projectId,
          temperature,
          maxTokens,
          ...(activeAssistantId && { assistantId: activeAssistantId }),
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debugEnabled is for logging only
    [model, orgId, activeConversationId, systemPrompt, enableRAG, projectId, temperature, maxTokens, activeAssistantId],
  );

  useEffect(() => {
    if (!debugEnabled) return;
    console.log('[AIChatInterface] Model state updated', redactLogMetadata({
      model,
      orgId,
      projectId,
      activeConversationId,
      enableRAG,
      temperature,
      maxTokens,
    }));
  }, [debugEnabled, model, orgId, projectId, activeConversationId, enableRAG, temperature, maxTokens]);

  // AI SDK v6: useChat from @ai-sdk/react with DefaultChatTransport
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
    onFinish: () => {
      if (debugEnabled) {
        console.log('[AIChatInterface] Stream finished', {
          model,
          conversationId: activeConversationId,
          messageCount: messages.length,
        });
      }
      abortControllerRef.current = null;
      // Refresh sidebar to show updated conversation
      setSidebarRefreshKey((k) => k + 1);
    },
    onError: (error: Error) => {
      const safeError = summarizeError(error);
      console.error('[AIChatInterface] Error:', {
        message: safeError.message,
        name: safeError.name,
        context: {
          api: '/api/ai/chat',
          model,
          orgId,
          projectId,
          activeConversationId,
          enableRAG,
          temperature,
          maxTokens,
          hasSystemPrompt: Boolean(systemPrompt),
          inputLength: input?.length ?? 0,
          filesCount: files.length,
        },
      });
      abortControllerRef.current = null;
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Inject server-side messages (scheduled tasks, cross-agent) via Realtime
  useChatRealtime({
    conversationId: activeConversationId,
    orgId,
    messages,
    setMessages,
    isStreaming: status === 'streaming',
  });

  // Handle new conversation
  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setInput('');
    setFiles([]);
    setActiveConversationId(null);
  }, [setMessages]);

  // Handle switching between chat mode and agent mode
  const handleAssistantChange = useCallback((id: string | null) => {
    setActiveAssistantId(id);
    setMessages([]);
    setInput('');
    setFiles([]);
    setActiveConversationId(null);
  }, [setMessages]);

  // Handle selecting a conversation from sidebar — loads message history
  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      setInput('');
      setFiles([]);
      setIsLoadingHistory(true);

      try {
        const res = await fetch(`/api/ai/chat?conversationId=${id}`);
        if (!res.ok) throw new Error('Failed to load conversation');
        const data = await res.json();

        if (data.messages?.length > 0) {
          // Convert DB messages to UIMessage format compatible with useChat
          const uiMessages = data.messages.map((m: { id: string; role: string; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role,
            parts: [{ type: 'text' as const, text: m.content }],
            createdAt: new Date(m.created_at),
          }));
          setMessages(uiMessages);
        } else {
          setMessages([]);
        }
      } catch {
        // Conversation exists but failed to load — start fresh
        setMessages([]);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [setMessages],
  );

  // Handle stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  // Handle form submit — auto-creates conversation on first message
  const onSubmit = useCallback(async () => {
    const trimmedInput = input?.trim();
    if (!trimmedInput && files.length === 0) return;

    // Auto-create conversation if none exists
    if (!activeConversationId && projectId) {
      try {
        const res = await fetch('/api/ai/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId,
            projectId,
            model,
            title: trimmedInput?.slice(0, 100) || 'New Chat',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.conversation?.id) {
            setActiveConversationId(data.conversation.id);
          }
        }
      } catch {
        // Continue without persistence — don't block the chat
      }
    }

    // Clear any previous entitlement error
    setEntitlementDeny(null);
    entitlementDenyRef.current = null;

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    if (debugEnabled) {
      console.log('[AIChatInterface] Sending message', redactLogMetadata({
        model,
        orgId,
        projectId,
        activeConversationId,
        enableRAG,
        temperature,
        maxTokens,
        hasSystemPrompt: Boolean(systemPrompt),
        inputLength: trimmedInput?.length ?? 0,
        filesCount: files.length,
      }));
    }

    // AI SDK v6: sendMessage with text + files for multi-modal
    if (files.length > 0) {
      sendMessage({
        text: trimmedInput || '',
        files,
      });
    } else {
      sendMessage({ text: trimmedInput || '' });
    }
    setInput('');
    setFiles([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- settings captured at transport creation
  }, [input, files, sendMessage, activeConversationId, projectId, orgId, model]);

  const hasMessages = messages.length > 0;

  const chatSuggestions = [
    {
      label: 'Explain RLS policies',
      prompt: 'Explain how Row Level Security works in Supabase',
    },
    {
      label: 'Debug an error',
      prompt: 'Help me debug a TypeScript error',
    },
    {
      label: 'Write a component',
      prompt: 'Create a React component with TypeScript',
    },
    {
      label: 'Optimize code',
      prompt: 'How can I optimize this code for performance?',
    },
  ];

  return (
    <div className="flex h-full relative">
      {/* Conversation Sidebar */}
      {projectId && (
        <AnimatePresence mode="wait">
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden shrink-0"
            >
              <ConversationSidebar
                orgId={orgId}
                projectId={projectId}
                activeConversationId={activeConversationId}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
                refreshKey={sidebarRefreshKey}
                className="w-[280px]"
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {!hasMessages ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 relative"
            >
              <EmptyState
                title="Ask me anything"
                subtitle="Get help with code, debug errors, or learn something new"
                placeholder="Ask about development, debugging, or best practices..."
                suggestions={chatSuggestions}
                value={input}
                onChange={setInput}
                onSubmit={onSubmit}
                disabled={false}
                modelSelector={
                  <div className="flex items-center gap-4 flex-wrap">
                    {projectId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowSidebar(!showSidebar)}
                      >
                        {showSidebar ? (
                          <PanelLeftClose className="h-4 w-4" />
                        ) : (
                          <PanelLeft className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {initialAssistants.length > 0 && (
                      <AgentSelector
                        value={activeAssistantId}
                        onChange={handleAssistantChange}
                        agents={initialAssistants}
                        disabled={isLoading}
                      />
                    )}
                    {!activeAssistantId && (
                      <ModelSelector
                        value={model}
                        onChange={setModel}
                        disabled={isLoading}
                        initialModels={initialModels}
                      />
                    )}
                    {/* RAG Toggle — only in chat mode */}
                    {!activeAssistantId && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id="rag-toggle"
                          checked={enableRAG}
                          onCheckedChange={setEnableRAG}
                        />
                        <Label
                          htmlFor="rag-toggle"
                          className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          Knowledge Base
                        </Label>
                      </div>
                    )}
                  </div>
                }
              />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  {projectId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowSidebar(!showSidebar)}
                    >
                      {showSidebar ? (
                        <PanelLeftClose className="h-4 w-4" />
                      ) : (
                        <PanelLeft className="h-4 w-4" />
                      )}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNewConversation}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New Chat
                  </Button>

                  {initialAssistants.length > 0 && (
                    <AgentSelector
                      value={activeAssistantId}
                      onChange={setActiveAssistantId}
                      agents={initialAssistants}
                      disabled={isLoading}
                    />
                  )}

                  {!activeAssistantId && (
                    <ModelSelector
                      value={model}
                      onChange={setModel}
                      disabled={isLoading}
                      initialModels={initialModels}
                    />
                  )}

                  {/* RAG Toggle — only in chat mode */}
                  {!activeAssistantId && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="rag-toggle-header"
                        checked={enableRAG}
                        onCheckedChange={setEnableRAG}
                      />
                      <Label
                        htmlFor="rag-toggle-header"
                        className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        KB
                      </Label>
                    </div>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <Settings2 className="h-5 w-5" />
                </Button>
              </div>

              {showSettings && (
                <div className="border-b px-4 py-3 bg-muted/30">
                  <div className="max-w-3xl mx-auto space-y-3">
                    {/* Info Row */}
                    <div className="flex items-center gap-4 text-sm flex-wrap">
                      <span className="text-muted-foreground">Model:</span>
                      <span className="font-medium">
                        {model.split('/').pop()}
                      </span>
                      <span className="text-muted-foreground ml-4">
                        Messages:
                      </span>
                      <span className="font-medium">{messages.length}</span>
                      <span className="text-muted-foreground ml-4">RAG:</span>
                      <span className="font-medium">
                        {enableRAG ? 'Enabled' : 'Disabled'}
                      </span>
                      {activeConversationId && (
                        <>
                          <span className="text-muted-foreground ml-4">
                            Session:
                          </span>
                          <span className="font-mono text-xs">
                            {activeConversationId.slice(0, 8)}…
                          </span>
                        </>
                      )}
                    </div>
                    {/* Controls Row */}
                    <div className="flex items-center gap-6">
                      {/* Temperature */}
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <Thermometer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">
                          Temp: {temperature.toFixed(1)}
                        </Label>
                        <Slider
                          value={[temperature]}
                          onValueChange={([v]) => setTemperature(v)}
                          min={0}
                          max={2}
                          step={0.1}
                          className="flex-1"
                          disabled={isLoading}
                        />
                      </div>
                      {/* Max Tokens */}
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Label className="text-xs text-muted-foreground whitespace-nowrap">
                          Tokens: {maxTokens.toLocaleString()}
                        </Label>
                        <Slider
                          value={[maxTokens]}
                          onValueChange={([v]) => setMaxTokens(v)}
                          min={256}
                          max={32000}
                          step={256}
                          className="flex-1"
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <MessageList
                messages={messages}
                status={isLoadingHistory ? 'submitted' : (entitlementDeny ? 'ready' : status)}
                error={error}
                onStop={handleStop}
              />

              {/* Entitlement error card — shown inline where the response would be */}
              {entitlementDeny && (
                <div className="px-4 pb-4">
                  <ChatLimitCard deny={entitlementDeny} />
                </div>
              )}

              <UsageHint item={aiQueryItem} />

              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={onSubmit}
                onStop={handleStop}
                isLoading={isLoading}
                placeholder={
                  activeAssistantId
                    ? 'Ask anything... (images supported)'
                    : isVisionCapable(model)
                      ? 'Ask anything... (images supported)'
                      : 'Ask anything...'
                }
                files={files}
                onFilesChange={setFiles}
                accept={activeAssistantId ? IMAGE_INPUT_ACCEPT : getAcceptForModel(model)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
