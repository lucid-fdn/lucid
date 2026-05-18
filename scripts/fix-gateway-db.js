/**
 * Fix gateway DB functions to include project_id
 * Addresses audit findings from Lucid Gateway integration review
 */
const fs = require('fs')

const filePath = 'src/lib/db/index.ts'
let content = fs.readFileSync(filePath, 'utf8')
let count = 0

// 1. Add project_id to logOrgLucidGatewayKeyAuditEvent params
const search1 = 'actorUserId?: string | null\n  metadata?: Record<string, unknown>\n}) {'
const replace1 = 'actorUserId?: string | null\n  projectId?: string | null\n  metadata?: Record<string, unknown>\n}) {'
if (content.includes(search1)) {
  content = content.replace(search1, replace1)
  count++
  console.log('✅ 1. Added projectId to logOrgLucidGatewayKeyAuditEvent params')
} else {
  console.log('❌ 1. MISS: logOrgLucidGatewayKeyAuditEvent params')
  // Try with \r\n
  const s1cr = search1.replace(/\n/g, '\r\n')
  const r1cr = replace1.replace(/\n/g, '\r\n')
  if (content.includes(s1cr)) {
    content = content.replace(s1cr, r1cr)
    count++
    console.log('  ✅ Found with CRLF')
  }
}

// 2. Add project_id to logOrgLucidGatewayKeyAuditEvent insert
const search2 = 'actor_user_id: params.actorUserId || null,\n      metadata: params.metadata || {},'
const replace2 = 'actor_user_id: params.actorUserId || null,\n      project_id: params.projectId || null,\n      metadata: params.metadata || {},'
if (content.includes(search2)) {
  content = content.replace(search2, replace2)
  count++
  console.log('✅ 2. Added project_id to logOrgLucidGatewayKeyAuditEvent insert')
} else {
  const s2cr = search2.replace(/\n/g, '\r\n')
  const r2cr = replace2.replace(/\n/g, '\r\n')
  if (content.includes(s2cr)) {
    content = content.replace(s2cr, r2cr)
    count++
    console.log('  ✅ Found with CRLF')
  } else {
    console.log('❌ 2. MISS: logOrgLucidGatewayKeyAuditEvent insert')
  }
}

// 3. Add project_id to audit event SELECTs (all occurrences)
const search3 = 'id, org_id, key_id, event_type, actor_user_id, metadata, created_at'
const replace3 = 'id, org_id, key_id, event_type, actor_user_id, project_id, metadata, created_at'
let auditSelectCount = 0
while (content.includes(search3)) {
  content = content.replace(search3, replace3)
  auditSelectCount++
}
if (auditSelectCount > 0) {
  count += auditSelectCount
  console.log(`✅ 3. Updated ${auditSelectCount} audit event SELECT columns`)
} else {
  console.log('❌ 3. MISS: audit event SELECT columns')
}

// 4. Add project_id to key SELECTs (all occurrences)
const search4 = 'id, org_id, key_alias, key_preview, lucidgateway_key_id, rpm_limit, tpm_limit, max_budget, budget_duration, models, is_active, status, metadata, created_by, rotated_from_key_id, created_at, updated_at, revoked_at'
const replace4 = 'id, org_id, key_alias, key_preview, lucidgateway_key_id, rpm_limit, tpm_limit, max_budget, budget_duration, models, is_active, status, metadata, created_by, rotated_from_key_id, project_id, created_at, updated_at, revoked_at'
let keySelectCount = 0
while (content.includes(search4)) {
  content = content.replace(search4, replace4)
  keySelectCount++
}
if (keySelectCount > 0) {
  count += keySelectCount
  console.log(`✅ 4. Updated ${keySelectCount} key SELECT columns`)
} else {
  console.log('❌ 4. MISS: key SELECT columns')
}

// 5. Add projectId to createOrgLucidGatewayKey params
const search5 = 'rotatedFromKeyId?: string | null\n})'
const replace5 = 'rotatedFromKeyId?: string | null\n  projectId?: string | null\n})'
if (content.includes(search5)) {
  content = content.replace(search5, replace5)
  count++
  console.log('✅ 5. Added projectId to createOrgLucidGatewayKey params')
} else {
  const s5cr = search5.replace(/\n/g, '\r\n')
  const r5cr = replace5.replace(/\n/g, '\r\n')
  if (content.includes(s5cr)) {
    content = content.replace(s5cr, r5cr)
    count++
    console.log('  ✅ Found with CRLF')
  } else {
    console.log('❌ 5. MISS: createOrgLucidGatewayKey params')
  }
}

// 6. Add project_id to createOrgLucidGatewayKey insert
const search6 = 'rotated_from_key_id: params.rotatedFromKeyId || null,'
const replace6 = 'rotated_from_key_id: params.rotatedFromKeyId || null,\n      project_id: params.projectId || null,'
if (content.includes(search6)) {
  content = content.replace(search6, replace6)
  count++
  console.log('✅ 6. Added project_id to createOrgLucidGatewayKey insert')
} else {
  console.log('❌ 6. MISS: createOrgLucidGatewayKey insert')
}

fs.writeFileSync(filePath, content)
console.log(`\nTotal replacements: ${count}`)