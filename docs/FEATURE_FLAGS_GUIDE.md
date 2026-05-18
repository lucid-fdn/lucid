# 🎛️ Feature Flags System - Complete Guide

**Version:** 1.0.0  
**Last Updated:** 2025-10-06  
**Status:** ✅ Production Ready

---

## 📋 Overview

The feature flags system allows you to enable/disable features without deploying new code. Perfect for A/B testing, gradual rollouts, and kill switches.

**File:** `src/lib/features.ts`

---

## 🎯 All Available Flags

### Navigation Features
```typescript
notifications: true          // Show notification bell
orgSwitcher: true           // Organization switcher
userMenu: true              // User dropdown menu
search: true                // Search functionality
keyboardShortcuts: true     // Cmd+, / Cmd+K shortcuts
```

### UI Features
```typescript
darkMode: true              // Dark mode toggle
mobileMenu: true            // Mobile hamburger menu
scrollAnimation: true       // Navbar scroll animation
```

### Core App Features
```typescript
// Chat & AI
chat: true                  // Chat functionality
agents: true                // AI agents feature
agentCreation: true         // Create new agents
agentMarketplace: true      // Agent marketplace

// Marketplace
marketplace: true           // Main marketplace
marketplaceAssets: true     // Asset listings
marketplaceCompanies: true  // Company profiles
marketplaceContributors: true // Contributor profiles

// User Features
dashboard: true             // User dashboard
profile: true               // User profile pages
publicProfiles: true        // Public profile viewing
settings: true              // Settings pages
onboarding: true            // Onboarding flow

// Organizations
organizations: true         // Organization feature
organizationCreation: true  // Create organizations
organizationManagement: true // Manage organizations

// Content
blog: true                  // Blog posts
```

### Auth & Wallet
```typescript
walletLogin: true           // Web3 wallet login
emailLogin: true            // Email login
googleLogin: true           // Google OAuth
web3Features: true          // All web3 functionality
```

### Communication
```typescript
emailNotifications: true    // Email notifications
browserNotifications: true  // Browser notifications
waitlist: true              // Waitlist functionality
contactForm: true           // Contact form
```

### Development
```typescript
debugMode: NODE_ENV === 'development'  // Debug features
betaFeatures: false                    // Beta features
advancedAnalytics: false               // Advanced analytics
```

### Experimental
```typescript
aiImageGeneration: true     // AI image generation
mentionsInChat: true        // @ mentions in chat
agentReactions: true        // Agent emoji reactions
```

---

## 💻 Usage Examples

### Basic Usage

```typescript
import { FEATURES } from '@/lib/features';

// Simple conditional rendering
{FEATURES.notifications && <NavNotifications />}
{FEATURES.chat && <ChatButton />}
{FEATURES.marketplace && <MarketplaceLink />}
```

### Component-Level Usage

```typescript
import { useFeatureFlags } from '@/lib/features';

export function MyComponent() {
  const features = useFeatureFlags();
  
  return (
    <div>
      {features.dashboard && <DashboardWidget />}
      {features.agents && <AgentsSection />}
      {features.blog && <BlogFeed />}
    </div>
  );
}
```

### Function-Level Usage

```typescript
import { isFeatureEnabled } from '@/lib/features';

async function processData() {
  if (isFeatureEnabled('advancedAnalytics')) {
    await trackAdvancedMetrics();
  }
  
  if (isFeatureEnabled('emailNotifications')) {
    await sendNotificationEmail();
  }
}
```

### Route Protection

```typescript
// app/(studio)/marketplace/page.tsx
import { FEATURES } from '@/lib/features';
import { redirect } from 'next/navigation';

export default function MarketplacePage() {
  if (!FEATURES.marketplace) {
    redirect('/dashboard');
  }
  
  return <MarketplaceContent />;
}
```

### Conditional Links

```typescript
import { FEATURES } from '@/lib/features';
import Link from 'next/link';

export function Navigation() {
  return (
    <nav>
      {FEATURES.chat && <Link href="/chat">Chat</Link>}
      {FEATURES.agents && <Link href="/agents">Agents</Link>}
      {FEATURES.marketplace && <Link href="/explore">Marketplace</Link>}
      {FEATURES.blog && <Link href="/blog">Blog</Link>}
    </nav>
  );
}
```

---

## 🎨 Integration Examples

### Navbar Integration

```typescript
// components/navigation/unified-navbar.tsx
import { FEATURES } from '@/lib/features';

export function UnifiedNavbar() {
  return (
    <nav>
      <NavLogo />
      
      {FEATURES.search && <SearchInput />}
      
      {/* Navigation items */}
      <ul>
        {FEATURES.marketplace && <li><Link href="/explore">Explore</Link></li>}
        {FEATURES.blog && <li><Link href="/blog">Blog</Link></li>}
        {FEATURES.agents && <li><Link href="/agents">Agents</Link></li>}
      </ul>
      
      {/* User actions */}
      {FEATURES.notifications && <NavNotifications />}
      {FEATURES.orgSwitcher && <NavOrgSwitcher />}
      {FEATURES.userMenu && <NavUserMenu />}
    </nav>
  );
}
```

### Sidebar Integration

```typescript
// app/(studio)/application-layout.tsx
import { FEATURES } from '@/lib/features';

export function ApplicationLayout() {
  return (
    <SidebarProvider>
      <Sidebar>
        {FEATURES.dashboard && (
          <SidebarMenuItem>
            <Link href="/dashboard">Dashboard</Link>
          </SidebarMenuItem>
        )}
        
        {FEATURES.chat && (
          <SidebarMenuItem>
            <Link href="/chat">Chat</Link>
          </SidebarMenuItem>
        )}
        
        {FEATURES.agents && (
          <SidebarMenuItem>
            <Link href="/agents">Agents</Link>
          </SidebarMenuItem>
        )}
        
        {FEATURES.settings && (
          <SidebarMenuItem>
            <Link href="/settings">Settings</Link>
          </SidebarMenuItem>
        )}
      </Sidebar>
      
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
```

### Settings Integration

```typescript
// app/(studio)/settings/page.tsx
import { FEATURES } from '@/lib/features';

export function SettingsPage() {
  return (
    <div>
      <SettingsSidebar>
        {FEATURES.profile && <Link href="/settings/profile">Profile</Link>}
        {FEATURES.organizations && <Link href="/settings/organizations">Organizations</Link>}
        {FEATURES.notifications && <Link href="/settings/notifications">Notifications</Link>}
      </SettingsSidebar>
    </div>
  );
}
```

---

## 🔧 Environment-Based Flags

### Development-Only Features

```typescript
export const FEATURES = {
  // Only enabled in development
  debugMode: process.env.NODE_ENV === 'development',
  
  // Only enabled with env var
  betaFeatures: process.env.NEXT_PUBLIC_ENABLE_BETA === 'true',
  
  // Percentage-based rollout
  newFeature: Math.random() < 0.5, // 50% of users
};
```

### Usage

```typescript
import { FEATURES } from '@/lib/features';

export function Component() {
  return (
    <div>
      {FEATURES.debugMode && (
        <div className="debug-panel">
          {/* Debug tools */}
        </div>
      )}
      
      {FEATURES.betaFeatures && (
        <BetaFeaturesBanner />
      )}
    </div>
  );
}
```

---

## 🚀 Deployment Strategies

### Gradual Rollout

```typescript
// Start with 10% of users
newFeature: Math.random() < 0.1, // Week 1

// Increase to 50%
newFeature: Math.random() < 0.5, // Week 2

// Full rollout
newFeature: true, // Week 3
```

### A/B Testing

```typescript
// Group A: Original feature
// Group B: New feature
const userId = getUserId();
const isGroupB = userId % 2 === 0;

export const FEATURES = {
  newCheckout: isGroupB,
  oldCheckout: !isGroupB,
};
```

### Kill Switch

```typescript
// Instantly disable a broken feature
export const FEATURES = {
  brokenFeature: false, // ❌ Disabled
  workingFeature: true, // ✅ Working
};
```

---

## 📊 Analytics Integration

```typescript
import { FEATURES } from '@/lib/features';
import { trackEvent } from '@/lib/analytics';

// Track feature usage
if (FEATURES.marketplace) {
  trackEvent('feature_enabled', { feature: 'marketplace' });
}

// Track feature visibility
Object.entries(FEATURES).forEach(([feature, enabled]) => {
  trackEvent('feature_state', {
    feature,
    enabled,
    timestamp: Date.now(),
  });
});
```

---

## 🧪 Testing

### Test Feature Flags

```typescript
import { FEATURES, isFeatureEnabled } from '@/lib/features';

describe('Feature Flags', () => {
  it('should have notifications enabled', () => {
    expect(FEATURES.notifications).toBe(true);
  });
  
  it('should check feature with helper', () => {
    expect(isFeatureEnabled('chat')).toBe(true);
  });
  
  it('should have beta features disabled', () => {
    expect(FEATURES.betaFeatures).toBe(false);
  });
});
```

### Test with Mocked Flags

```typescript
jest.mock('@/lib/features', () => ({
  FEATURES: {
    marketplace: true,
    betaFeatures: false,
  },
  isFeatureEnabled: jest.fn(),
}));
```

---

## 🎯 Best Practices

### ✅ DO

```typescript
// Use descriptive names
{FEATURES.agentCreation && <CreateAgentButton />}

// Check before expensive operations
if (FEATURES.advancedAnalytics) {
  await expensiveAnalyticsCall();
}

// Document why a feature is disabled
betaFeatures: false, // Disabled until Q4 launch

// Use environment variables for deployment-specific flags
debugMode: process.env.NODE_ENV === 'development',
```

### ❌ DON'T

```typescript
// Don't use vague names
{FEATURES.feature1 && <Component />} // ❌

// Don't nest too deeply
{FEATURES.a && FEATURES.b && FEATURES.c && <Component />} // ❌

// Don't forget to clean up old flags
oldFeatureFromLastYear: false, // ❌ Remove this!

// Don't hardcode values that should be environment-specific
production: true, // ❌ Use process.env
```

---

## 🔄 Migration Guide

### Integrating Existing Features

1. **Identify the feature**
   ```typescript
   // Before
   <ChatButton />
   
   // After
   {FEATURES.chat && <ChatButton />}
   ```

2. **Update navigation**
   ```typescript
   // Before
   <Link href="/agents">Agents</Link>
   
   // After
   {FEATURES.agents && <Link href="/agents">Agents</Link>}
   ```

3. **Protect routes**
   ```typescript
   // Before
   export default function AgentsPage() {
     return <AgentsContent />;
   }
   
   // After
   export default function AgentsPage() {
     if (!FEATURES.agents) redirect('/');
     return <AgentsContent />;
   }
   ```

---

## 📝 Summary

### Features Covered
- **40+ feature flags** across the application
- **Navigation, UI, Auth, Marketplace, Chat, Agents, Settings**
- **Environment-aware** flags
- **Type-safe** usage
- **Easy to extend**

### Usage Patterns
- Simple conditionals: `{FEATURES.x && <Component />}`
- Hook usage: `useFeatureFlags()`
- Function checks: `isFeatureEnabled('feature')`
- Route protection
- Analytics integration

### Benefits
- 🚀 Fast feature deployment
- 🔄 Easy rollbacks
- 🎯 A/B testing ready
- 🔒 Kill switch for broken features
- 📊 Analytics tracking
- 🧪 Easy testing

---

## 🎉 Complete!

Feature flags are now integrated across your entire codebase. You can:
- Toggle any feature on/off instantly
- Run A/B tests
- Gradually roll out features
- Disable broken features
- Test in isolation

**Ready to deploy! 🚀**
