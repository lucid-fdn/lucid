'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/ui/components/file-upload'
import { isWeb3Enabled } from '@/lib/auth/client-config'

const PrivyWalletAddressProbe = dynamic(
  () => import('./privy-wallet-address-probe').then((mod) => mod.PrivyWalletAddressProbe),
  { ssr: false },
)

interface LaunchWizardProps {
  userId: string
}

type Step = 'configure' | 'review'

const STEPS: { key: Step; label: string; icon: 'settings' | 'rocket' }[] = [
  { key: 'configure', label: 'Configure', icon: 'settings' },
  { key: 'review', label: 'Review & Launch', icon: 'rocket' },
]

const CATEGORIES = [
  'general',
  'trading',
  'research',
  'creative',
  'data',
  'social',
  'defi',
  'gaming',
  'other',
]

/* ─── Icon Components ───────────────────────────────────────────────── */

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

const STEP_ICONS = {
  settings: SettingsIcon,
  rocket: RocketIcon,
}

/* ─── Custom Dropdown ───────────────────────────────────────────────── */

function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white backdrop-blur-sm transition-all duration-200 hover:border-white/20 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
      >
        <span className={selected ? 'text-white' : 'text-white/30'}>
          {selected?.label ?? placeholder ?? 'Select...'}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-white/10 bg-gray-900/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors ${
                  opt.value === value
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-white/80 hover:bg-white/5 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Glass Card ────────────────────────────────────────────────────── */

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8 ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

/* ─── Step Indicator ────────────────────────────────────────────────── */

function StepIndicator({
  currentStep,
  canGoToReview,
  onStepClick,
}: {
  currentStep: Step
  canGoToReview: boolean
  onStepClick: (step: Step) => void
}) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex items-center justify-center px-4">
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const Icon = STEP_ICONS[step.icon]
          const isCompleted = i < currentIdx
          const isCurrent = i === currentIdx

          const canClick =
            step.key === 'configure' ||
            (step.key === 'review' && canGoToReview)

          return (
            <div key={step.key} className="flex items-center">
              {i > 0 && (
                <div className="relative h-[2px] w-16 sm:w-28">
                  <div className="absolute inset-0 bg-white/10" />
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-cyan-500"
                    initial={{ width: '0%' }}
                    animate={{ width: isCompleted || isCurrent ? '100%' : '0%' }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => canClick && onStepClick(step.key)}
                className={`group flex flex-col items-center gap-2 ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="relative">
                  {isCurrent && (
                    <motion.div
                      className="absolute -inset-1.5 rounded-full border-2 border-cyan-400/40"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}

                  <motion.div
                    className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                      isCompleted
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                        : isCurrent
                          ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                          : 'border-white/15 bg-white/5 text-white/30'
                    }`}
                    whileHover={canClick ? { scale: 1.1 } : {}}
                    whileTap={canClick ? { scale: 0.95 } : {}}
                  >
                    {isCompleted ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </motion.div>
                </div>

                <span
                  className={`text-xs font-medium uppercase tracking-wider transition-colors duration-300 ${
                    isCurrent
                      ? 'text-cyan-400'
                      : isCompleted
                        ? 'text-cyan-500/70'
                        : 'text-white/25'
                  }`}
                >
                  {step.label}
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Navigation Buttons ────────────────────────────────────────────── */

function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  isSubmitting,
  isLaunch,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled: boolean
  isSubmitting?: boolean
  isLaunch?: boolean
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <motion.button
          type="button"
          onClick={onBack}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          Back
        </motion.button>
      ) : (
        <div />
      )}

      <motion.button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || isSubmitting}
        whileHover={!nextDisabled && !isSubmitting ? { scale: 1.02 } : {}}
        whileTap={!nextDisabled && !isSubmitting ? { scale: 0.98 } : {}}
        className={`group relative overflow-hidden rounded-xl px-8 py-2.5 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${
          isLaunch
            ? 'bg-gradient-to-r from-cyan-500 via-cyan-400 to-blue-500 text-gray-950 shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)]'
            : 'bg-cyan-500/90 text-gray-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:bg-cyan-400 hover:shadow-[0_0_25px_rgba(6,182,212,0.4)]'
        }`}
      >
        {isLaunch && !nextDisabled && !isSubmitting && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
          />
        )}

        <span className="relative flex items-center gap-2">
          {isSubmitting && (
            <LoaderIcon className="h-4 w-4 animate-spin" />
          )}
          {nextLabel}
        </span>
      </motion.button>
    </div>
  )
}

/* ─── Form Field Wrapper ────────────────────────────────────────────── */

function FieldGroup({
  label,
  required,
  helper,
  children,
}: {
  label: string
  required?: boolean
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium uppercase tracking-wider text-white/60">
        {label}
        {required && <span className="ml-1 text-cyan-400">*</span>}
      </label>
      {children}
      {helper && <p className="text-xs text-white/25">{helper}</p>}
    </div>
  )
}

/* ─── Styled Input ──────────────────────────────────────────────────── */

function StyledInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  prefix,
  mono,
  ...rest
}: {
  type?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  prefix?: string
  mono?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'>) {
  if (prefix) {
    return (
      <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-all duration-200 focus-within:border-cyan-500/50 focus-within:ring-2 focus-within:ring-cyan-500/20">
        <span className="flex h-full items-center bg-white/5 px-3 py-3 text-sm text-white/40">
          {prefix}
        </span>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full bg-transparent px-3 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none ${mono ? 'font-mono' : ''}`}
          {...rest}
        />
      </div>
    )
  }

  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 backdrop-blur-sm transition-all duration-200 hover:border-white/20 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 ${mono ? 'font-mono' : ''}`}
      {...rest}
    />
  )
}

/* ─── Styled Textarea ───────────────────────────────────────────────── */

function StyledTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 backdrop-blur-sm transition-all duration-200 hover:border-white/20 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
    />
  )
}

/* ─── Review Row ────────────────────────────────────────────────────── */

function ReviewRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.04] py-3 last:border-0">
      <span className="shrink-0 text-sm text-white/40">{label}</span>
      <span
        className={`text-right text-sm font-medium text-white ${mono ? 'font-mono text-xs' : ''} ${truncate ? 'max-w-[220px] truncate' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

/* ─── Slide Direction Helper ────────────────────────────────────────── */

const STEP_ORDER: Step[] = ['configure', 'review']

function getDirection(from: Step, to: Step): number {
  return STEP_ORDER.indexOf(to) > STEP_ORDER.indexOf(from) ? 1 : -1
}

/* ═══ Main Component ═══════════════════════════════════════════════════ */

export function LaunchWizardClient({ userId }: LaunchWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('configure')
  const [direction, setDirection] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('general')
  const [pricePerRequest, setPricePerRequest] = useState('0.01')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [privyWalletAddress, setPrivyWalletAddress] = useState('')
  const [useExternalWallet, setUseExternalWallet] = useState(false)
  const [externalWallet, setExternalWallet] = useState('')

  // The effective creator wallet used for submission
  const creatorWallet = useExternalWallet ? externalWallet : privyWalletAddress

  // Import from Studio state
  const [mode, setMode] = useState<'create' | 'import'>('create')
  const [studioAssistants, setStudioAssistants] = useState<
    { id: string; name: string; description: string | null; avatar_url: string | null; org_id: string }[]
  >([])
  const [hasStudioAgents, setHasStudioAgents] = useState<boolean | null>(null)
  const [selectedAssistantId, setSelectedAssistantId] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState('')

  // Auto-generate slug from display name
  useEffect(() => {
    if (displayName && !slugTouched) {
      setSlug(
        displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      )
    }
  }, [displayName, slugTouched])

  // Fetch Studio assistants on mount
  useEffect(() => {
    fetch('/api/launchpad/my-assistants')
      .then((res) => res.json())
      .then((data) => {
        const list = data.assistants ?? []
        setStudioAssistants(list)
        setHasStudioAgents(list.length > 0)
      })
      .catch(() => setHasStudioAgents(false))
  }, [])

  const canProceedToReview = displayName.trim() && slug.trim() && creatorWallet.trim()

  const navigateTo = useCallback(
    (target: Step) => {
      setDirection(getDirection(step, target))
      setStep(target)
    },
    [step]
  )

  function handleAvatarSelect(file: File | null) {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    if (!file) {
      setAvatarFile(null)
      setAvatarPreview(null)
      return
    }
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar must be under 5 MB')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/launchpad/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(selectedAssistantId && { assistant_id: selectedAssistantId }),
          ...(selectedOrgId && { org_id: selectedOrgId }),
          creator_wallet: creatorWallet,
          slug,
          display_name: displayName,
          description: description || undefined,
          category,
          price_per_request: Number(pricePerRequest),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to launch agent')
        setIsSubmitting(false)
        return
      }

      // Upload avatar if selected
      if (avatarFile && data.agent?.slug) {
        try {
          const form = new FormData()
          form.append('avatar', avatarFile)
          await fetch(`/api/launchpad/agents/${data.agent.slug}/avatar`, {
            method: 'POST',
            body: form,
          })
        } catch {
          // Non-blocking — agent is already created
        }
      }

      router.push(`/agent/${data.agent.slug}`)
    } catch {
      setError('Network error. Please try again.')
      setIsSubmitting(false)
    }
  }

  /* ─── Slide Variants ──────────────────────────────────────────────── */

  const slideVariants = {
    enter: (d: number) => ({
      x: d > 0 ? 80 : -80,
      opacity: 0,
      filter: 'blur(4px)',
    }),
    center: {
      x: 0,
      opacity: 1,
      filter: 'blur(0px)',
    },
    exit: (d: number) => ({
      x: d > 0 ? -80 : 80,
      opacity: 0,
      filter: 'blur(4px)',
    }),
  }
  const web3Enabled = isWeb3Enabled()

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      {web3Enabled ? <PrivyWalletAddressProbe onAddress={setPrivyWalletAddress} /> : null}

      {/* ── Step Indicator ──────────────────────────────────────────── */}
      <StepIndicator
        currentStep={step}
        canGoToReview={!!canProceedToReview}
        onStepClick={navigateTo}
      />

      {/* ── Error Alert ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.07] p-4 backdrop-blur-sm">
              <div className="mt-0.5 shrink-0 rounded-full bg-red-500/20 p-1">
                <svg className="h-3 w-3 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Step Content ────────────────────────────────────────────── */}
      <div className="relative">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ── Step 1: Configure ────────────────────────────────────── */}
          {step === 'configure' && (
            <motion.div
              key="configure"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <GlassCard>
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Configure Your Agent</h2>
                    <p className="mt-1 text-sm text-white/40">
                      Define your agent and how it appears on the marketplace.
                    </p>
                  </div>

                  {/* Mode Toggle — only if user has Studio agents */}
                  {hasStudioAgents && (
                    <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5">
                      {([
                        { key: 'create' as const, label: 'Create New Agent' },
                        { key: 'import' as const, label: 'Import from Studio' },
                      ]).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setMode(opt.key)
                            if (opt.key === 'create') {
                              setSelectedAssistantId('')
                              setSelectedOrgId('')
                              setDisplayName('')
                              setSlug('')
                              setSlugTouched(false)
                              setDescription('')
                            }
                          }}
                          className={`relative flex-1 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                            mode === opt.key
                              ? 'text-cyan-300'
                              : 'text-white/40 hover:text-white/60'
                          }`}
                        >
                          {mode === opt.key && (
                            <motion.div
                              layoutId="mode-toggle"
                              className="absolute inset-0 rounded-lg border border-cyan-500/30 bg-cyan-500/10"
                              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                          )}
                          <span className="relative">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Import Mode — Studio Agent Selector */}
                  {mode === 'import' && (
                    <FieldGroup label="Select Studio Agent" required>
                      <CustomSelect
                        value={selectedAssistantId}
                        onChange={(val) => {
                          setSelectedAssistantId(val)
                          const agent = studioAssistants.find((a) => a.id === val)
                          if (agent) {
                            setSelectedOrgId(agent.org_id)
                            setDisplayName(agent.name)
                            setSlugTouched(false)
                            setSlug(
                              agent.name
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, '')
                            )
                            setDescription(agent.description ?? '')
                          }
                        }}
                        options={studioAssistants.map((a) => ({
                          value: a.id,
                          label: a.name,
                        }))}
                        placeholder="Select a Studio agent..."
                      />
                    </FieldGroup>
                  )}

                  {/* Display Name & Slug — two-column */}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <FieldGroup label="Display Name" required helper="Public-facing name for your agent">
                      <StyledInput
                        value={displayName}
                        onChange={(e) => {
                          setDisplayName(e.target.value)
                          if (
                            !slugTouched ||
                            slug ===
                              displayName
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, '')
                          ) {
                            setSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '-')
                                .replace(/^-|-$/g, '')
                            )
                            setSlugTouched(false)
                          }
                        }}
                        placeholder="My Trading Bot"
                      />
                    </FieldGroup>

                    <FieldGroup label="Slug" required helper="URL-safe identifier">
                      <StyledInput
                        value={slug}
                        onChange={(e) => {
                          setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                          setSlugTouched(true)
                        }}
                        placeholder="my-trading-bot"
                        mono
                      />
                    </FieldGroup>
                  </div>

                  {/* Slug preview */}
                  {slug && (
                    <div className="-mt-3 flex items-center gap-1.5 text-xs text-white/25">
                      <span>lucid.ai/agent/</span>
                      <span className="font-mono text-cyan-400/60">{slug}</span>
                    </div>
                  )}

                  {/* Description */}
                  <FieldGroup label="Description" helper="Tell investors what your agent does">
                    <StyledTextarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this agent do? Why should people invest?"
                      rows={3}
                    />
                  </FieldGroup>

                  {/* Avatar Upload */}
                  <FieldGroup label="Avatar" helper="Square image, max 5 MB. PNG or JPG recommended.">
                    <FileUpload
                      onFilesAdded={(files) => handleAvatarSelect(files[0] ?? null)}
                      multiple={false}
                      accept="image/*"
                    >
                      <FileUploadContent>
                        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-cyan-400/40 bg-black/90 p-8 shadow-xl">
                          <svg
                            className="h-10 w-10 text-cyan-300/70"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          <p className="text-base font-medium text-white">Drop avatar here</p>
                          <p className="max-w-xs text-center text-sm text-white/50">
                            Square image, max 5 MB. PNG or JPG recommended.
                          </p>
                        </div>
                      </FileUploadContent>
                      <div className="flex items-center gap-4">
                        <FileUploadTrigger
                          asChild
                          className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-white/15 bg-white/[0.03] transition-all duration-200 hover:border-cyan-500/40 hover:bg-white/[0.06]"
                        >
                          <button type="button">
                            {avatarPreview ? (
                              <img
                                src={avatarPreview}
                                alt="Avatar preview"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <svg
                                className="h-6 w-6 text-white/20 transition-colors group-hover:text-cyan-400/60"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                            )}
                          </button>
                        </FileUploadTrigger>
                        <div className="flex flex-col gap-1">
                          <FileUploadTrigger
                            asChild
                            className="text-left text-sm text-white/50 transition-colors hover:text-cyan-400"
                          >
                            <button type="button">
                              {avatarPreview ? 'Change image' : 'Upload image'}
                            </button>
                          </FileUploadTrigger>
                          {avatarPreview && (
                            <button
                              type="button"
                              onClick={() => handleAvatarSelect(null)}
                              className="text-left text-xs text-white/30 transition-colors hover:text-red-400"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </FileUpload>
                  </FieldGroup>

                  {/* Category & Price — two-column */}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <FieldGroup label="Category">
                      <CustomSelect
                        value={category}
                        onChange={setCategory}
                        options={CATEGORIES.map((c) => ({
                          value: c,
                          label: c.charAt(0).toUpperCase() + c.slice(1),
                        }))}
                      />
                    </FieldGroup>

                    <FieldGroup label="Price per Request" helper="Amount in USDC">
                      <StyledInput
                        type="number"
                        value={pricePerRequest}
                        onChange={(e) => setPricePerRequest(e.target.value)}
                        prefix="$"
                        step="0.001"
                        min="0.001"
                      />
                    </FieldGroup>
                  </div>

                  {/* Payout Wallet */}
                  <FieldGroup label="Payout Wallet" required helper="Where you receive revenue from your agent">
                    {!useExternalWallet ? (
                      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="font-mono text-sm text-white">
                            {privyWalletAddress
                              ? `${privyWalletAddress.slice(0, 6)}...${privyWalletAddress.slice(-4)}`
                              : 'Loading wallet...'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUseExternalWallet(true)}
                          className="text-xs text-white/40 transition-colors hover:text-cyan-400"
                        >
                          Use external wallet
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <StyledInput
                          value={externalWallet}
                          onChange={(e) => setExternalWallet(e.target.value)}
                          placeholder="Enter Solana wallet address..."
                          mono
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setUseExternalWallet(false)
                            setExternalWallet('')
                          }}
                          className="text-xs text-white/40 transition-colors hover:text-cyan-400"
                        >
                          Use Privy wallet instead
                        </button>
                      </div>
                    )}
                  </FieldGroup>

                  <NavButtons
                    onNext={() => navigateTo('review')}
                    nextLabel="Review"
                    nextDisabled={!canProceedToReview}
                  />
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── Step 2: Review & Launch ──────────────────────────────── */}
          {step === 'review' && (
            <motion.div
              key="review"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <GlassCard>
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Review & Launch</h2>
                    <p className="mt-1 text-sm text-white/40">
                      Verify your configuration before going live.
                    </p>
                  </div>

                  {/* Avatar + Summary card */}
                  {avatarPreview && (
                    <div className="flex justify-center">
                      <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-white/10">
                        <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-1">
                    <ReviewRow label="Display Name" value={displayName} />
                    <ReviewRow label="Slug" value={slug} mono />
                    <ReviewRow
                      label="Category"
                      value={category.charAt(0).toUpperCase() + category.slice(1)}
                    />
                    <ReviewRow
                      label="Price per Request"
                      value={`$${Number(pricePerRequest).toFixed(3)} USDC`}
                    />
                    <ReviewRow label="Creator Wallet" value={creatorWallet} mono truncate />
                    <ReviewRow label="Platform Fee" value="15%" />
                    <ReviewRow label="Token Supply" value="1,000,000,000" />
                    <ReviewRow label="Creator Allocation" value="10%" />
                  </div>

                  {/* Description */}
                  {description && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
                        Description
                      </p>
                      <p className="text-sm leading-relaxed text-white/70">{description}</p>
                    </div>
                  )}

                  {/* Warning box */}
                  <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 backdrop-blur-sm">
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <p className="text-sm leading-relaxed text-amber-300/80">
                      This will create your agent on Lucid Launch. Token creation and staking
                      pool setup happen in separate steps after launch.
                    </p>
                  </div>

                  <NavButtons
                    onBack={() => navigateTo('configure')}
                    onNext={handleSubmit}
                    nextLabel={isSubmitting ? 'Launching...' : 'Launch Agent'}
                    nextDisabled={false}
                    isSubmitting={isSubmitting}
                    isLaunch
                  />
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
