'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { termsSchema, type TermsData, type UserOnboardingData } from '@/lib/forms/user-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from '@/components/ui/avatar'
import { ModelIcon } from '@/components/icons/model-icon'
import { Sparkles, Loader2 } from 'lucide-react'
import { default as GithubLogo } from '@lobehub/icons/es/Github'
import type { StepComponentProps } from '@/types/multi-step'

const modelIcons = [
  { name: 'Claude', provider: 'Claude' },
  { name: 'Google', provider: 'Google' },
  { name: 'OpenClaw', provider: null, src: '/logos/openclaw.png' },
  { name: 'Mistral', provider: 'Mistral' },
]

const appIcons = [
  { name: 'Telegram', src: '/logos/telegram.svg', fallback: 'TG', padded: false, dark: false },
  { name: 'X', src: '/logos/x.svg', fallback: 'X', padded: true, dark: true },
  { name: 'Slack', src: '/logos/slack.png', fallback: 'SL', padded: true, dark: false },
  { name: 'GitHub', src: null, fallback: 'GH', padded: false, dark: true, lobehub: GithubLogo },
]

export function StepComplete({ data, onComplete, onBack, isLoading }: StepComponentProps<UserOnboardingData>) {
  const isWorkspaceOnboarding = !data.handle && !!data.workspace_name

  const formSchema = isWorkspaceOnboarding ? z.object({ agree_terms: z.boolean().default(false) }) : termsSchema

  const {
    handleSubmit,
    watch,
    setValue,
    reset,
  } = useForm<TermsData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      agree_terms: data.agree_terms || true,
    },
  })

  useEffect(() => {
    if (data && Object.keys(data).length > 0) {
      reset({ agree_terms: data.agree_terms || true })
    }
  }, [data, reset])

  useEffect(() => {
    setValue('agree_terms', true, { shouldValidate: true })
  }, [setValue])

  const agreeTerms = watch('agree_terms')

  const onSubmit = (formData: TermsData) => {
    const completeData = { ...data, ...formData }
    onComplete(completeData)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">
          You're good to go
        </h1>
        <p className="text-muted-foreground text-lg">
          Your agents are ready to come alive.
        </p>
      </div>

      {/* Tip Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
        {/* Create your first agent */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex -space-x-1.5">
            {modelIcons.map((model, i) => (
              <div
                key={model.name}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-background ring-2 ring-background overflow-hidden"
                style={{ zIndex: modelIcons.length - i }}
              >
                {model.src ? (
                  <img src={model.src} alt={model.name} className="h-3.5 w-3.5 object-contain" />
                ) : (
                  <ModelIcon provider={model.provider!} size={14} />
                )}
              </div>
            ))}
          </div>
          <h3 className="text-sm font-medium">Create your first agent</h3>
          <p className="text-sm text-muted-foreground">
            Deploy an AI agent that works for you across channels.
          </p>
        </div>

        {/* Connect your apps */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex -space-x-1.5">
            {appIcons.map((app, i) => (
              app.lobehub ? (
                <div
                  key={app.name}
                  className={`flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-background overflow-hidden ${app.dark ? 'bg-black text-white' : 'bg-white text-zinc-900'}`}
                  style={{ zIndex: appIcons.length - i }}
                >
                  <app.lobehub size={24} />
                </div>
              ) : (
                <div
                  key={app.name}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ring-background overflow-hidden ${app.dark ? 'bg-black' : 'bg-white'}`}
                  style={{ zIndex: appIcons.length - i }}
                >
                  <img src={app.src!} alt={app.name} className={`${app.padded ? 'h-3.5 w-3.5' : 'h-full w-full'} object-contain`} />
                </div>
              )
            ))}
          </div>
          <h3 className="text-sm font-medium">Connect your apps</h3>
          <p className="text-sm text-muted-foreground">
            Integrate with the tools your team already uses.
          </p>
        </div>

        {/* Explore templates */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Explore templates</h3>
          <p className="text-sm text-muted-foreground">
            Start from a pre-built agent and customize it in minutes.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4">
        <Button
          type="submit"
          size="lg"
          disabled={(!isWorkspaceOnboarding && !agreeTerms) || isLoading}
          className="min-w-[280px] h-12 text-base"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isWorkspaceOnboarding ? 'Creating workspace...' : 'Setting things up...'}
            </>
          ) : (
            isWorkspaceOnboarding ? 'Create Workspace' : 'Enter Lucid'
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={isLoading}
          className="text-muted-foreground"
        >
          Back
        </Button>
      </div>
    </form>
  )
}
