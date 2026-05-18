# Caching System Documentation

This document outlines the caching strategy and implementation in the Lucid application.

## Overview

Our application uses a multi-layer caching strategy to optimize performance and user experience:

1. **Server-Side Caching (Redis/Upstash)**
   - Used for server-shared data
   - Reduces database load
   - Handles rate limiting and session management

2. **Client-Side Caching (React Query)**
   - Manages server-sourced data
   - Provides background revalidation
   - Enables quick refetching

3. **Local Storage**
   - Stores user preferences
   - Handles offline data
   - Manages small, persistent data

4. **Zustand State Management**
   - Manages UI state
   - Handles ephemeral data
   - Provides state persistence when needed

## Cache Types and TTLs

| Cache Type | TTL | Use Case | Invalidation Strategy |
|------------|-----|----------|----------------------|
| Auth | 1 hour | User authentication | Event-driven (logout) |
| Image | 24 hours | Generated images | TTL-based |
| Rate Limit | 1 minute | API rate limiting | TTL-based |
| Chat | 7 days | Chat history | Event-driven + TTL |
| User Prefs | 30 days | User settings | Manual |
| Agent State | 24 hours | Agent configuration | Event-driven |

## Usage Guidelines

### React Query

Use for server-sourced data that needs background revalidation:

```typescript
const { data } = useQueryWithCache({
  cacheKey: 'agent_list',
  queryKey: ['agents'],
  queryFn: fetchAgents,
});
```

### Local Storage

Use for persistent user settings and small offline data:

```typescript
const { value, setValue } = useLocalStorage('user_prefs', defaultPrefs);
```

### Zustand

Use for UI state management and ephemeral data. Zustand is chosen over alternatives because:
- Lightweight and simple API
- Built-in TypeScript support
- Easy integration with React Query
- Minimal boilerplate
- Built-in persistence middleware

Example usage:
```typescript
// Create a persisted store for UI preferences
const useConfigStore = createPersistedStore('config-store', {
  theme: 'system',
  language: 'en',
  notifications: true,
});

// Use in components
const { theme, setTheme } = useConfigStore();

// Integration with React Query
const useAgentStore = createPersistedStore('agent-store', {
  selectedAgent: null,
  filters: {},
  setSelectedAgent: (agent) => useAgentStore.setState({ selectedAgent: agent }),
});
```

## Cache Warming

Critical data is pre-warmed on application startup:

- User preferences
- Agent list
- Chat history (periodically)

## Monitoring

The system tracks:
- Cache hit/miss rates
- Error rates
- Memory usage
- Performance metrics

Alerts are triggered when:
- Hit rate drops below 80%
- Error rate exceeds 1%
- Memory usage exceeds 1GB

## Compression

Data compression is applied based on:
- Size (>50KB)
- Data type (always/never compress lists)
- Performance impact

## Best Practices

1. **Data Selection**
   - Use Redis for server-shared data
   - Use React Query for API responses
   - Use localStorage for user preferences
   - Use Zustand for UI state

2. **TTL Management**
   - Keep TTLs aligned with data freshness requirements
   - Use event-driven invalidation for dynamic data
   - Implement fallback TTLs for critical data

3. **Performance**
   - Monitor cache hit rates
   - Warm frequently accessed data
   - Compress large payloads
   - Implement proper error handling

4. **Security**
   - Never store sensitive data in localStorage
   - Use secure cookies for auth tokens
   - Implement proper access controls

## Troubleshooting

Common issues and solutions:

1. **High Miss Rate**
   - Check TTL settings
   - Verify cache warming
   - Monitor data freshness

2. **Memory Issues**
   - Review compression settings
   - Check for memory leaks
   - Monitor Redis usage

3. **Performance Problems**
   - Check cache hit rates
   - Review warming strategy
   - Monitor network usage 

## Data Ownership Rules

To prevent data duplication and ensure consistency, follow these strict rules:

### Server-Sourced Data (React Query + Redis)
- Agent data from API
- User profile information
- Chat messages
- Transaction history
- Any data that comes from the server

### UI State (Zustand)
- Form states during agent creation
- Modal open/close states
- UI filters and sorting preferences
- Temporary UI calculations
- Never store server data here

### Persistent Preferences (Local Storage)
- Theme preferences
- Language settings
- Notification preferences
- Small, stable user settings
- Never store server data or large objects here

### Data Flow Examples

```typescript
// ✅ CORRECT: Server data in React Query
const { data: agent } = useQueryWithCache({
  cacheKey: 'agent_list',
  queryKey: ['agents'],
  queryFn: fetchAgents,
});

// ✅ CORRECT: UI state in Zustand
const useAgentCreationStore = createPersistedStore('agent_creation', {
  currentStep: 1,
  formData: {},
});

// ✅ CORRECT: User preferences in Local Storage
const useConfigStore = createPersistedStore('config', {
  theme: 'system',
  language: 'en',
});

// ❌ INCORRECT: Don't duplicate server data
const useAgentStore = createPersistedStore('agent_store', {
  // Don't store agent data here if it's already in React Query
  selectedAgent: null, // This is fine as it's UI state
  agentData: {}, // This is wrong - should be in React Query
});
```

### Common Pitfalls to Avoid

1. **Server Data Duplication**
   ```typescript
   // ❌ Don't do this
   const useUserStore = createPersistedStore('user', {
     userData: {}, // Server data should be in React Query
   });

   // ✅ Do this instead
   const { data: userData } = useQueryWithCache({
     cacheKey: 'user_data',
     queryKey: ['user'],
     queryFn: fetchUser,
   });
   ```

2. **Large Objects in Local Storage**
   ```typescript
   // ❌ Don't do this
   localStorage.setItem('chat_history', JSON.stringify(largeChatArray));

   // ✅ Do this instead
   const { data: chatHistory } = useQueryWithCache({
     cacheKey: 'chat_history',
     queryKey: ['chat'],
     queryFn: fetchChatHistory,
   });
   ```

3. **UI State vs Server State**
   ```typescript
   // ✅ Correct separation
   const useAgentStore = createPersistedStore('agent', {
     // UI state only
     selectedAgentId: null,
     filters: {},
     sortOrder: 'asc',
   });

   // Server data in React Query
   const { data: agentData } = useQueryWithCache({
     cacheKey: 'agent_data',
     queryKey: ['agent', selectedAgentId],
     queryFn: () => fetchAgent(selectedAgentId),
   });
   ``` 