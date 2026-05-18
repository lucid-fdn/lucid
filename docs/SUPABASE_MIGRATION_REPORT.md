# Supabase Migration Report

**Generated:** 2025-10-20T20:00:20.300Z
**Files to migrate:** 53

## Files


[36mFile: C:\LucidMerged\src\app\(app)\settings\billing\page.tsx[0m
[33mOperations found:[0m
  • Table: organization_members (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\(workflow)\[workspace-slug]\workflows\page.tsx[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\(workflow)\[workspace-slug]\workflows\[workflowId]\page.tsx[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\company\[slug]\info\route.ts[0m
[33mOperations found:[0m
  • Table: organizations (1 operations)
  • Table: assets (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

[36mFile: C:\LucidMerged\src\app\api\create-checkout-session\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\favorites\reorder\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\favorites\route.ts[0m
[33mOperations found:[0m
  • Table: favorites (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\favorites\[id]\route.ts[0m
[33mOperations found:[0m
  • Table: favorites (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\organizations\[orgId]\leave\route.ts[0m
[33mOperations found:[0m
  • Table: organizations (1 operations)
  • Table: organization_members (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

[36mFile: C:\LucidMerged\src\app\api\organizations\[orgId]\members\route.ts[0m
[33mOperations found:[0m
  • Table: profiles (1 operations)
  • Table: organization_members (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

[36mFile: C:\LucidMerged\src\app\api\organizations\[orgId]\members\[memberId]\route.ts[0m
[33mOperations found:[0m
  • Table: organization_members (6 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\organizations\[orgId]\route.ts[0m
[33mOperations found:[0m
  • Table: organizations (3 operations)
  • Table: organization_members (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

[36mFile: C:\LucidMerged\src\app\api\orgs\[id]\invites\route.ts[0m
[33mOperations found:[0m
  • Table: organizations (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

[36mFile: C:\LucidMerged\src\app\api\orgs\[id]\members\route.ts[0m
[33mOperations found:[0m
  • Table: organization_members (3 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\push\subscribe\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\v2\marketplace\assets\[id]\bookmark\route.ts[0m
[33mOperations found:[0m
  • Table: bookmarks (4 operations)
  • Table: assets (4 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\v2\marketplace\assets\[id]\like\route.ts[0m
[33mOperations found:[0m
  • Table: assets (4 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\v2\marketplace\assets\[id]\rate\route.ts[0m
[33mOperations found:[0m
  • Table: assets (4 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\app\api\v2\marketplace\contributors\[handle]\follow\route.ts[0m
[33mOperations found:[0m
  • Table: profiles (4 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

[36mFile: C:\LucidMerged\src\app\api\v2\marketplace\organizations\[id]\follow\route.ts[0m
[33mOperations found:[0m
  • Table: profiles (1 operations)
  • Table: organizations (5 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

[36mFile: C:\LucidMerged\src\app\api\webhooks\resend\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\webhooks\[path]\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\executions\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (3 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\schedules\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\schedules\[scheduleId]\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\variables\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\variables\[variableId]\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\versions\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\versions\[versionId]\restore\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\webhooks\route.ts[0m
[33mOperations found:[0m
  • Table: workflows (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mworkflows:[0m
    [31m✗[0m getWorkflows(orgId) - needs to be added
    [31m✗[0m getWorkflow(workflowId) - needs to be added

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\webhooks\[webhookId]\analytics\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\webhooks\[webhookId]\logs\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\webhooks\[webhookId]\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\app\api\workflows\[id]\webhooks\[webhookId]\test\route.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\hooks\use-notifications.tsx[0m
[33mOperations found:[0m
  • Table: organizations (1 operations)
  • Table: notifications (5 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

  [34mnotifications:[0m
    [32m✓[0m getNotifications(userId, limit)
    [32m✓[0m createNotification(notification)
    [32m✓[0m markNotificationAsRead(userId, notificationId)

[36mFile: C:\LucidMerged\src\lib\access-control\index.ts[0m
[33mOperations found:[0m
  • Table: organization_members (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\lib\access-control\server.ts[0m
[33mOperations found:[0m
  • Table: organizations (1 operations)
  • Table: organization_members (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

[36mFile: C:\LucidMerged\src\lib\auth\cache.ts[0m
[33mOperations found:[0m
  • Table: profiles (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

[36mFile: C:\LucidMerged\src\lib\auth\handle.ts[0m
[33mOperations found:[0m
  • Table: profiles (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

[36mFile: C:\LucidMerged\src\lib\auth\server-utils.ts[0m
[33mOperations found:[0m
  • Table: organization_members (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\lib\auth\session.ts[0m
[33mOperations found:[0m
  • Table: profiles (5 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

[36mFile: C:\LucidMerged\src\lib\db\index.ts[0m
[33mOperations found:[0m
  • Table: profiles (7 operations)
  • Table: organizations (5 operations)
  • Table: organization_members (3 operations)
  • Table: notifications (5 operations)
  • Table: bookmarks (4 operations)
  • Table: assets (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

  [34mnotifications:[0m
    [32m✓[0m getNotifications(userId, limit)
    [32m✓[0m createNotification(notification)
    [32m✓[0m markNotificationAsRead(userId, notificationId)

[36mFile: C:\LucidMerged\src\lib\expressions\context-builder.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\lib\invites\index.ts[0m
[33mOperations found:[0m
  • Table: organization_members (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\lib\mail\index.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\lib\marketplace\merger.ts[0m
[33mOperations found:[0m
  • Table: bookmarks (2 operations)
  • Table: assets (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

[36mFile: C:\LucidMerged\src\lib\notifications\service.ts[0m
[33mOperations found:[0m
  • Table: profiles (2 operations)
  • Table: notifications (1 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

  [34mnotifications:[0m
    [32m✓[0m getNotifications(userId, limit)
    [32m✓[0m createNotification(notification)
    [32m✓[0m markNotificationAsRead(userId, notificationId)

[36mFile: C:\LucidMerged\src\lib\notifications.ts[0m
[33mOperations found:[0m
  • Table: organization_members (1 operations)
  • Table: notifications (2 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mnotifications:[0m
    [32m✓[0m getNotifications(userId, limit)
    [32m✓[0m createNotification(notification)
    [32m✓[0m markNotificationAsRead(userId, notificationId)

[36mFile: C:\LucidMerged\src\lib\supabase\server.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\lib\uploads\storage.ts[0m
[33mOperations found:[0m
  • No specific table operations detected
  • Manual review recommended

[36mFile: C:\LucidMerged\src\lib\workspace\index.ts[0m
[33mOperations found:[0m
  • Table: profiles (1 operations)
  • Table: organizations (4 operations)
  • Table: organization_members (4 operations)

[32mSuggested changes:[0m
  1. Remove: import { createClient } from "@supabase/supabase-js"
  2. Add: import { ... } from "@/lib/db"
  3. Replace direct queries with centralized functions

[35mAvailable functions in @/lib/db:[0m

  [34mprofiles:[0m
    [32m✓[0m getProfile(userId)
    [32m✓[0m updateProfile(userId, updates)
    [32m✓[0m createProfile(profile)
    [32m✓[0m getProfileByHandle(handle)

  [34morganizations:[0m
    [32m✓[0m getOrganizationById(orgId)
    [32m✓[0m getUserOrganizations(userId)
    [32m✓[0m createOrganization(org, creatorId)
    [32m✓[0m updateOrganization(orgId, updates)

## Next Steps

1. Review suggestions for each file
2. Add missing functions to `src/lib/db/index.ts`
3. Update imports and replace direct queries
4. Run ESLint to catch any remaining issues
5. Test thoroughly
