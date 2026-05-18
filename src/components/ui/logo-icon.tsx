'use client'

import { memo, useEffect, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import {
  Globe,
  TrendingUp,
  Cpu,
  MessageSquare,
  Puzzle,
} from 'lucide-react'
import SiAirtable, { defaultColor as SiAirtableHex } from '@icons-pack/react-simple-icons/icons/SiAirtable.mjs'
import SiAnthropic, { defaultColor as SiAnthropicHex } from '@icons-pack/react-simple-icons/icons/SiAnthropic.mjs'
import SiAsana, { defaultColor as SiAsanaHex } from '@icons-pack/react-simple-icons/icons/SiAsana.mjs'
import SiBitbucket, { defaultColor as SiBitbucketHex } from '@icons-pack/react-simple-icons/icons/SiBitbucket.mjs'
import SiBitly, { defaultColor as SiBitlyHex } from '@icons-pack/react-simple-icons/icons/SiBitly.mjs'
import SiBrave, { defaultColor as SiBraveHex } from '@icons-pack/react-simple-icons/icons/SiBrave.mjs'
import SiCalendly, { defaultColor as SiCalendlyHex } from '@icons-pack/react-simple-icons/icons/SiCalendly.mjs'
import SiClickup, { defaultColor as SiClickupHex } from '@icons-pack/react-simple-icons/icons/SiClickup.mjs'
import SiConfluence, { defaultColor as SiConfluenceHex } from '@icons-pack/react-simple-icons/icons/SiConfluence.mjs'
import SiDatadog, { defaultColor as SiDatadogHex } from '@icons-pack/react-simple-icons/icons/SiDatadog.mjs'
import SiDocker, { defaultColor as SiDockerHex } from '@icons-pack/react-simple-icons/icons/SiDocker.mjs'
import SiDropbox, { defaultColor as SiDropboxHex } from '@icons-pack/react-simple-icons/icons/SiDropbox.mjs'
import SiFacebook, { defaultColor as SiFacebookHex } from '@icons-pack/react-simple-icons/icons/SiFacebook.mjs'
import SiFigma, { defaultColor as SiFigmaHex } from '@icons-pack/react-simple-icons/icons/SiFigma.mjs'
import SiGithub, { defaultColor as SiGithubHex } from '@icons-pack/react-simple-icons/icons/SiGithub.mjs'
import SiGithubactions, { defaultColor as SiGithubactionsHex } from '@icons-pack/react-simple-icons/icons/SiGithubactions.mjs'
import SiGitlab, { defaultColor as SiGitlabHex } from '@icons-pack/react-simple-icons/icons/SiGitlab.mjs'
import SiGmail, { defaultColor as SiGmailHex } from '@icons-pack/react-simple-icons/icons/SiGmail.mjs'
import SiGoogle, { defaultColor as SiGoogleHex } from '@icons-pack/react-simple-icons/icons/SiGoogle.mjs'
import SiGoogleanalytics, { defaultColor as SiGoogleanalyticsHex } from '@icons-pack/react-simple-icons/icons/SiGoogleanalytics.mjs'
import SiGooglecalendar, { defaultColor as SiGooglecalendarHex } from '@icons-pack/react-simple-icons/icons/SiGooglecalendar.mjs'
import SiGoogledocs, { defaultColor as SiGoogledocsHex } from '@icons-pack/react-simple-icons/icons/SiGoogledocs.mjs'
import SiGoogledrive, { defaultColor as SiGoogledriveHex } from '@icons-pack/react-simple-icons/icons/SiGoogledrive.mjs'
import SiGooglemeet, { defaultColor as SiGooglemeetHex } from '@icons-pack/react-simple-icons/icons/SiGooglemeet.mjs'
import SiGooglesheets, { defaultColor as SiGooglesheetsHex } from '@icons-pack/react-simple-icons/icons/SiGooglesheets.mjs'
import SiGoogletasks, { defaultColor as SiGoogletasksHex } from '@icons-pack/react-simple-icons/icons/SiGoogletasks.mjs'
import SiHubspot, { defaultColor as SiHubspotHex } from '@icons-pack/react-simple-icons/icons/SiHubspot.mjs'
import SiInstagram, { defaultColor as SiInstagramHex } from '@icons-pack/react-simple-icons/icons/SiInstagram.mjs'
import SiIntercom, { defaultColor as SiIntercomHex } from '@icons-pack/react-simple-icons/icons/SiIntercom.mjs'
import SiJenkins, { defaultColor as SiJenkinsHex } from '@icons-pack/react-simple-icons/icons/SiJenkins.mjs'
import SiJira, { defaultColor as SiJiraHex } from '@icons-pack/react-simple-icons/icons/SiJira.mjs'
import SiLinear, { defaultColor as SiLinearHex } from '@icons-pack/react-simple-icons/icons/SiLinear.mjs'
import SiMailchimp, { defaultColor as SiMailchimpHex } from '@icons-pack/react-simple-icons/icons/SiMailchimp.mjs'
import SiMiro, { defaultColor as SiMiroHex } from '@icons-pack/react-simple-icons/icons/SiMiro.mjs'
import SiNotion, { defaultColor as SiNotionHex } from '@icons-pack/react-simple-icons/icons/SiNotion.mjs'
import SiPostgresql, { defaultColor as SiPostgresqlHex } from '@icons-pack/react-simple-icons/icons/SiPostgresql.mjs'
import SiRailway, { defaultColor as SiRailwayHex } from '@icons-pack/react-simple-icons/icons/SiRailway.mjs'
import SiReddit, { defaultColor as SiRedditHex } from '@icons-pack/react-simple-icons/icons/SiReddit.mjs'
import SiSentry, { defaultColor as SiSentryHex } from '@icons-pack/react-simple-icons/icons/SiSentry.mjs'
import SiShopify, { defaultColor as SiShopifyHex } from '@icons-pack/react-simple-icons/icons/SiShopify.mjs'
import SiStripe, { defaultColor as SiStripeHex } from '@icons-pack/react-simple-icons/icons/SiStripe.mjs'
import SiSupabase, { defaultColor as SiSupabaseHex } from '@icons-pack/react-simple-icons/icons/SiSupabase.mjs'
import SiTelegram, { defaultColor as SiTelegramHex } from '@icons-pack/react-simple-icons/icons/SiTelegram.mjs'
import SiTiktok, { defaultColor as SiTiktokHex } from '@icons-pack/react-simple-icons/icons/SiTiktok.mjs'
import SiTrello, { defaultColor as SiTrelloHex } from '@icons-pack/react-simple-icons/icons/SiTrello.mjs'
import SiTypeform, { defaultColor as SiTypeformHex } from '@icons-pack/react-simple-icons/icons/SiTypeform.mjs'
import SiVercel, { defaultColor as SiVercelHex } from '@icons-pack/react-simple-icons/icons/SiVercel.mjs'
import SiWhatsapp, { defaultColor as SiWhatsappHex } from '@icons-pack/react-simple-icons/icons/SiWhatsapp.mjs'
import SiX, { defaultColor as SiXHex } from '@icons-pack/react-simple-icons/icons/SiX.mjs'
import SiYoutube, { defaultColor as SiYoutubeHex } from '@icons-pack/react-simple-icons/icons/SiYoutube.mjs'
import SiZendesk, { defaultColor as SiZendeskHex } from '@icons-pack/react-simple-icons/icons/SiZendesk.mjs'
import SiZoom, { defaultColor as SiZoomHex } from '@icons-pack/react-simple-icons/icons/SiZoom.mjs'
import { useTheme } from 'next-themes'

// =============================================================================
// IMAGE-BASED ICONS
// =============================================================================

function BrandImage({ src, alt, size = 16, className }: { src: string; alt: string; size?: number; className?: string }) {
  return <img src={src} alt={alt} width={size} height={size} className={`rounded-sm ${className ?? ''}`} />
}

// =============================================================================
// BRAND RESOLUTION
// =============================================================================

type IconComponent = ComponentType<{
  size?: number | string
  color?: string
  className?: string
  title?: string
}>

interface ResolvedSimpleIcon {
  component: IconComponent
  hex?: string
}

/** Image assets for brands unavailable in simple-icons or where we prefer a repo asset. */
const IMAGE_OVERRIDES: Record<string, string> = {
  alchemy: '/logos/icon/alchemy.jpeg',
  binance: '/logos/icon/binance.png',
  canva: '/logos/icon/canva.svg',
  chainstack: '/logos/icon/chainstack.webp',
  discord: '/logos/discord.svg',
  fireflies: '/logos/icon/fireflies.svg',
  helius: '/logos/icon/helius.svg',
  hyperliquid: '/logos/icon/hyperliquid.png',
  lemlist: '/logos/icon/lemlist.svg',
  monday: '/logos/icon/monday.svg',
  moralis: '/logos/icon/moralis.jpeg',
  msteams: '/logos/icon/msteams.svg',
  polymarket: '/logos/icon/polymarket.png',
  slack: '/logos/slack.png',
  telegram: '/logos/telegram.svg',
}

const ICON_OVERRIDES: Record<string, { icon: IconComponent; color?: string }> = {
}

/** Aliases where the slug doesn't match the simple-icons export name. */
const SIMPLE_ICON_ALIASES: Record<string, string> = {
  twitter: 'x',
  'google-mail': 'gmail',
  'brave-search': 'brave',
  apollo: 'apollographql',
  msteams: 'microsoftteams',
}

const SIMPLE_ICONS: Record<string, ResolvedSimpleIcon> = {
  airtable: { component: SiAirtable, hex: SiAirtableHex },
  anthropic: { component: SiAnthropic, hex: SiAnthropicHex },
  asana: { component: SiAsana, hex: SiAsanaHex },
  bitbucket: { component: SiBitbucket, hex: SiBitbucketHex },
  bitly: { component: SiBitly, hex: SiBitlyHex },
  brave: { component: SiBrave, hex: SiBraveHex },
  calendly: { component: SiCalendly, hex: SiCalendlyHex },
  clickup: { component: SiClickup, hex: SiClickupHex },
  confluence: { component: SiConfluence, hex: SiConfluenceHex },
  datadog: { component: SiDatadog, hex: SiDatadogHex },
  docker: { component: SiDocker, hex: SiDockerHex },
  dropbox: { component: SiDropbox, hex: SiDropboxHex },
  facebook: { component: SiFacebook, hex: SiFacebookHex },
  figma: { component: SiFigma, hex: SiFigmaHex },
  github: { component: SiGithub, hex: SiGithubHex },
  githubactions: { component: SiGithubactions, hex: SiGithubactionsHex },
  gmail: { component: SiGmail, hex: SiGmailHex },
  gitlab: { component: SiGitlab, hex: SiGitlabHex },
  google: { component: SiGoogle, hex: SiGoogleHex },
  googleanalytics: { component: SiGoogleanalytics, hex: SiGoogleanalyticsHex },
  googlecalendar: { component: SiGooglecalendar, hex: SiGooglecalendarHex },
  googledocs: { component: SiGoogledocs, hex: SiGoogledocsHex },
  googledrive: { component: SiGoogledrive, hex: SiGoogledriveHex },
  googlemeet: { component: SiGooglemeet, hex: SiGooglemeetHex },
  googlesheets: { component: SiGooglesheets, hex: SiGooglesheetsHex },
  googletasks: { component: SiGoogletasks, hex: SiGoogletasksHex },
  hubspot: { component: SiHubspot, hex: SiHubspotHex },
  instagram: { component: SiInstagram, hex: SiInstagramHex },
  intercom: { component: SiIntercom, hex: SiIntercomHex },
  jenkins: { component: SiJenkins, hex: SiJenkinsHex },
  jira: { component: SiJira, hex: SiJiraHex },
  linear: { component: SiLinear, hex: SiLinearHex },
  mailchimp: { component: SiMailchimp, hex: SiMailchimpHex },
  miro: { component: SiMiro, hex: SiMiroHex },
  notion: { component: SiNotion, hex: SiNotionHex },
  postgresql: { component: SiPostgresql, hex: SiPostgresqlHex },
  railway: { component: SiRailway, hex: SiRailwayHex },
  reddit: { component: SiReddit, hex: SiRedditHex },
  sentry: { component: SiSentry, hex: SiSentryHex },
  shopify: { component: SiShopify, hex: SiShopifyHex },
  stripe: { component: SiStripe, hex: SiStripeHex },
  supabase: { component: SiSupabase, hex: SiSupabaseHex },
  telegram: { component: SiTelegram, hex: SiTelegramHex },
  tiktok: { component: SiTiktok, hex: SiTiktokHex },
  trello: { component: SiTrello, hex: SiTrelloHex },
  typeform: { component: SiTypeform, hex: SiTypeformHex },
  vercel: { component: SiVercel, hex: SiVercelHex },
  whatsapp: { component: SiWhatsapp, hex: SiWhatsappHex },
  x: { component: SiX, hex: SiXHex },
  youtube: { component: SiYoutube, hex: SiYoutubeHex },
  zendesk: { component: SiZendesk, hex: SiZendeskHex },
  zoom: { component: SiZoom, hex: SiZoomHex },
}

function slugMatchesKey(slug: string, key: string) {
  return slug === key || slug.startsWith(`${key}-`) || slug.endsWith(`-${key}`)
}

function normalizeSlug(slug: string): string {
  return slug.toLowerCase().trim()
}

function getSimpleIconCandidates(slug: string): string[] {
  const normalized = normalizeSlug(slug)
  const candidates = [normalized]
  for (const [alias, target] of Object.entries(SIMPLE_ICON_ALIASES)) {
    if (slugMatchesKey(normalized, alias)) candidates.push(target)
  }
  return [...new Set(candidates)]
}

function resolveSimpleIcon(slug: string): ResolvedSimpleIcon | null {
  for (const candidate of getSimpleIconCandidates(slug)) {
    const compact = candidate.replace(/[^a-z0-9]/g, '').toLowerCase()
    const icon = SIMPLE_ICONS[candidate] ?? SIMPLE_ICONS[compact]
    if (icon) return icon
  }
  return null
}

/** True when the brand hex would be invisible against the current theme background. */
function isInvisibleOnTheme(hex: string | undefined, isDark: boolean): boolean {
  if (!hex) return false
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return false
  const v = Number.parseInt(normalized, 16)
  if (Number.isNaN(v)) return false
  const r = (v >> 16) & 255
  const g = (v >> 8) & 255
  const b = v & 255
  const toLinear = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return isDark ? lum < 0.04 : lum > 0.92
}

// =============================================================================
// CATEGORY FALLBACK ICONS
// =============================================================================

const CATEGORY_ICONS: Record<string, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  trading: TrendingUp,
  blockchain: TrendingUp,
  orchestration: Cpu,
  communication: MessageSquare,
  web: Globe,
  media: Globe,
  general: Globe,
}

// =============================================================================
// LUCID DIAMOND (inline SVG)
// =============================================================================

function LucidDiamond({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L2 9l10 13L22 9L12 2z" fill="currentColor" opacity={0.9} />
      <path d="M12 2L2 9h20L12 2z" fill="currentColor" opacity={0.7} />
    </svg>
  )
}

// =============================================================================
// LOGO ICON
// =============================================================================

export interface LogoIconProps {
  slug: string
  category?: string
  alwaysOn?: boolean
  section?: string
  size?: number
  className?: string
}

function LogoIconInner({ slug, category, alwaysOn, size = 16, className }: LogoIconProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const normalizedSlug = normalizeSlug(slug)
  const isLucidOwned = normalizedSlug.startsWith('lucid-') || normalizedSlug.startsWith('platform-')
  const SimpleIcon = isLucidOwned ? null : resolveSimpleIcon(slug)
  const isDark = mounted ? resolvedTheme === 'dark' : true

  // 1a. Explicit image overrides
  for (const [key, src] of Object.entries(IMAGE_OVERRIDES)) {
    if (slugMatchesKey(normalizedSlug, key)) {
      return <BrandImage src={src} alt={key} size={size} className={className} />
    }
  }

  // 1b. Explicit component overrides
  for (const [key, { icon: Icon, color }] of Object.entries(ICON_OVERRIDES)) {
    if (slugMatchesKey(normalizedSlug, key)) {
      return <Icon size={size} color={color} className={className} />
    }
  }

  // 2. Lucid-owned — audit gets real logo, others get diamond
  if (isLucidOwned) {
    if (slugMatchesKey(normalizedSlug, 'lucid-audit')) {
      return <BrandImage src={isDark ? '/lucid_w.png' : '/lucid.png'} alt="Lucid" size={size} className={className} />
    }
    return <LucidDiamond size={size} className={`text-violet-500 ${className ?? ''}`} />
  }

  // 3. simple-icons brand color (currentColor only if invisible on theme)
  if (SimpleIcon) {
    const Icon = SimpleIcon.component
    const color = isInvisibleOnTheme(SimpleIcon.hex, isDark) ? 'currentColor' : 'default'
    return <Icon size={size} color={color} className={className} />
  }

  // 4. Category fallback for skills and platform tools
  if (category) {
    const CategoryIcon = CATEGORY_ICONS[category] ?? Globe
    return <CategoryIcon className={`text-violet-500 ${className ?? ''}`} style={{ width: size, height: size }} />
  }

  // Fallback
  return <Puzzle className={`text-muted-foreground ${className ?? ''}`} style={{ width: size, height: size }} />
}

export const LogoIcon = memo(LogoIconInner)
LogoIcon.displayName = 'LogoIcon'
