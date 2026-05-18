'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Users, ChevronRight, ChevronLeft, Crown, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ModelIcon } from '@/components/icons/model-icon'
import { toast } from '@/hooks/use-toast'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { useProjectGeneration } from '@/hooks/use-project-generation'
import { GenerationPromptPanel } from '@/components/ai/project-generation/generation-prompt-panel'
import { GenerationSuggestionCard } from '@/components/ai/project-generation/generation-suggestion-card'
import { GenerationModeSummary } from '@/components/ai/project-generation/generation-mode-summary'
import {
  CREW_ROLE_PRESETS,
  CUSTOM_CREW_ROLE_VALUE,
  UNSET_CREW_ROLE_VALUE,
  getCrewRoleSelectValue,
} from '@/lib/crews/roles'
import type { Agent as Assistant } from '@/types/agent'
import type { CreateCrewInput } from '@contracts/crew'
import { projectDraftFromTeam } from '@/lib/ai/project-generation/projection'
import { applyGeneratedTeamDraftToCreation } from '@/lib/ai/project-generation/team-create-edit'

interface CreateCrewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assistants: Assistant[]
  orgId: string
  projectId?: string
  onCreated?: (crewId?: string) => void
  initialName?: string
  initialObjective?: string
  sourceGroupName?: string
  replaceGroupAfterCreate?: boolean
  onReplaceGroupAfterCreateChange?: (replace: boolean) => void
  /** Pre-selected assistant IDs (from multi-select → Create Crew on canvas) */
  preselectedAssistantIds?: string[]
}

interface MemberDraft {
  assistant: Assistant
  role: string
  isCoordinator: boolean
}

type Step = 'basics' | 'members' | 'review'

const STEP_ORDER: Step[] = ['basics', 'members', 'review']

export function CreateCrewDialog({
  open,
  onOpenChange,
  assistants,
  orgId,
  projectId,
  onCreated,
  initialName,
  initialObjective,
  sourceGroupName,
  replaceGroupAfterCreate = false,
  onReplaceGroupAfterCreateChange,
  preselectedAssistantIds,
}: CreateCrewDialogProps) {
  const [step, setStep] = useState<Step>('basics')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    prompt: guidedEditPrompt,
    setPrompt: setGuidedEditPrompt,
    result: guidedEditResult,
    isGenerating: isGuidedEditLoading,
    generate: runGuidedEdit,
    reset: resetGuidedEdit,
  } = useProjectGeneration({ workspaceId: orgId })

  // Basics
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')

  // Members
  const [members, setMembers] = useState<MemberDraft[]>([])

  // Pre-populate members from canvas multi-select (only once per dialog open)
  const didPreselect = useRef(false)
  useEffect(() => {
    if (!open) {
      didPreselect.current = false
      return
    }
    if (didPreselect.current) return
    if (preselectedAssistantIds?.length) {
      didPreselect.current = true
      const preselected: MemberDraft[] = preselectedAssistantIds
        .map((id) => assistants.find((a) => a.id === id))
        .filter((a): a is Assistant => !!a)
        .map((a, i) => ({
          assistant: a,
          role: '',
          isCoordinator: i === 0,
        }))
      if (preselected.length > 0) {
        setMembers(preselected)
        setStep('members')
      }
    }
  }, [open, preselectedAssistantIds, assistants])

  useEffect(() => {
    if (!open) return
    setName((current) => current || initialName || '')
    setObjective((current) => current || initialObjective || '')
  }, [initialName, initialObjective, open])

  const stepIndex = STEP_ORDER.indexOf(step)
  const canGoBack = stepIndex > 0
  const isLastStep = stepIndex === STEP_ORDER.length - 1

  const resetForm = useCallback(() => {
    setStep('basics')
    setName(initialName ?? '')
    setObjective(initialObjective ?? '')
    setMembers([])
    setIsSubmitting(false)
    setGuidedEditPrompt('')
    resetGuidedEdit()
  }, [initialName, initialObjective, resetGuidedEdit])

  const handleClose = useCallback((open: boolean) => {
    if (!open) resetForm()
    onOpenChange(open)
  }, [onOpenChange, resetForm])

  const canAdvance = (): boolean => {
    if (step === 'basics') return name.trim().length > 0 && objective.trim().length > 0
    if (step === 'members') return members.length >= 1 && members.some((m) => m.isCoordinator)
    return true
  }

  const handleNext = () => {
    if (!canAdvance()) return
    const next = STEP_ORDER[stepIndex + 1]
    if (next) setStep(next)
  }

  const handleBack = () => {
    const prev = STEP_ORDER[stepIndex - 1]
    if (prev) setStep(prev)
  }

  const addMember = (assistant: Assistant) => {
    if (members.find((m) => m.assistant.id === assistant.id)) return
    const isFirst = members.length === 0
    setMembers((prev) => [
      ...prev,
      { assistant, role: '', isCoordinator: isFirst },
    ])
  }

  const removeMember = (assistantId: string) => {
    setMembers((prev) => {
      const filtered = prev.filter((m) => m.assistant.id !== assistantId)
      // If we removed the coordinator, promote first remaining
      if (filtered.length > 0 && !filtered.some((m) => m.isCoordinator)) {
        filtered[0].isCoordinator = true
      }
      return filtered
    })
  }

  const updateMemberRole = (assistantId: string, role: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.assistant.id === assistantId ? { ...m, role } : m)),
    )
  }

  const updateMemberRolePreset = (assistantId: string, value: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.assistant.id !== assistantId) return m
        if (value === UNSET_CREW_ROLE_VALUE) return { ...m, role: '' }
        if (value === CUSTOM_CREW_ROLE_VALUE) return m
        return { ...m, role: value }
      }),
    )
  }

  const setCoordinator = (assistantId: string) => {
    setMembers((prev) =>
      prev.map((m) => ({ ...m, isCoordinator: m.assistant.id === assistantId })),
    )
  }

  const handleSubmit = async () => {
    if (!canAdvance()) return
    setIsSubmitting(true)
    try {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' })
      const csrf = getCSRFTokenFromCookie()

      // Build star topology: coordinator ↔ each non-coordinator member
      const coordinatorIndex = members.findIndex((m) => m.isCoordinator)
      const edges: CreateCrewInput['edges'] = members
        .map((m, i) => {
          if (i === coordinatorIndex) return null
          return {
            source_member_index: coordinatorIndex,
            target_member_index: i,
            direction: 'bidirectional' as const,
          }
        })
        .filter((e): e is NonNullable<typeof e> => e !== null)

      const payload: CreateCrewInput & { org_id: string } = {
        org_id: orgId,
        project_id: projectId,
        name: name.trim(),
        objective: objective.trim(),
        members: members.map((m) => ({
          assistant_id: m.assistant.id,
          role: m.role.trim() || m.assistant.name,
          is_coordinator: m.isCoordinator,
        })),
        edges,
      }

      const res = await fetch('/api/crews', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(body.error || `Failed (${res.status})`)
      }

      const body = await res.json().catch(() => ({}))
      const createdCrewId = body?.crew?.id as string | undefined

      toast.success('Team created', { description: `"${name}" is ready to go.` })
      handleClose(false)
      onCreated?.(createdCrewId)
    } catch (err) {
      toast.error('Failed to create team', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Agents not yet added as members
  const availableAssistants = assistants.filter(
    (a) => !members.find((m) => m.assistant.id === a.id),
  )
  const guidedEditApplyResult = useMemo(() => {
    if (!guidedEditResult) return null
    return applyGeneratedTeamDraftToCreation({
      draft: guidedEditResult.draft,
      members,
    })
  }, [guidedEditResult, members])

  const handleRunGuidedEdit = useCallback(async () => {
    if (!guidedEditPrompt.trim() || members.length === 0) return

    return runGuidedEdit({
      draft: projectDraftFromTeam({
        crew: {
          name: name.trim() || initialName || 'New Team',
          objective: objective.trim() || initialObjective || 'Coordinate the selected agents.',
          description: null,
        },
        members: members.map((member) => ({
          assistant: {
            name: member.assistant.name,
            description: member.assistant.description ?? null,
            system_prompt: member.assistant.system_prompt,
            lucid_model: member.assistant.lucid_model,
          },
          role: member.role.trim() || member.assistant.name,
          isCoordinator: member.isCoordinator,
        })),
        edges: members.flatMap((member) => {
          const coordinator = members.find((candidate) => candidate.isCoordinator)
          if (!coordinator || coordinator.assistant.id === member.assistant.id) {
            return []
          }
          return [{
            from: coordinator.role.trim() || coordinator.assistant.name,
            to: member.role.trim() || member.assistant.name,
          }]
        }),
      }),
    })
  }, [guidedEditPrompt, initialName, initialObjective, members, name, objective, runGuidedEdit])

  const handleApplyGuidedEdit = useCallback(() => {
    if (!guidedEditApplyResult?.members || !guidedEditApplyResult.name) return

    const assistantsById = new Map(members.map((member) => [member.assistant.id, member.assistant]))
    setName(guidedEditApplyResult.name)
    setObjective(guidedEditApplyResult.objective ?? '')
    setMembers(guidedEditApplyResult.members.map((member) => ({
      assistant: assistantsById.get(member.assistant.id)!,
      role: member.role,
      isCoordinator: member.isCoordinator,
    })))
    toast.success('Guided team suggestion applied')
  }, [guidedEditApplyResult, members])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Create Team
          </DialogTitle>
          <DialogDescription>
            {step === 'basics' && 'Name your team and define its objective.'}
            {step === 'members' && 'Add agents and assign roles. Pick a coordinator.'}
            {step === 'review' && 'Review your team before creating it.'}
          </DialogDescription>
        </DialogHeader>

        {sourceGroupName && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <p className="text-xs font-medium text-emerald-300">
              Promoting group "{sourceGroupName}" into a real team.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Groups stay visual and lightweight. Teams can run, track activity, and assign a coordinator.
            </p>
          </div>
        )}

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-1">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  i <= stepIndex ? 'bg-primary' : 'bg-muted',
                )}
              />
              {i < STEP_ORDER.length - 1 && (
                <div className={cn('h-px w-8', i < stepIndex ? 'bg-primary' : 'bg-muted')} />
              )}
            </div>
          ))}
        </div>

        {/* Step: Basics */}
        {step === 'basics' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="crew-name">Name</Label>
              <Input
                id="crew-name"
                placeholder="e.g., Research Team"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crew-objective">Objective</Label>
              <Textarea
                id="crew-objective"
                placeholder="What should this team accomplish? The coordinator will receive this as its primary goal."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                maxLength={2000}
                rows={4}
              />
            </div>
            {sourceGroupName && onReplaceGroupAfterCreateChange && (
              <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                <Checkbox
                  checked={replaceGroupAfterCreate}
                  onCheckedChange={(checked) => onReplaceGroupAfterCreateChange(Boolean(checked))}
                />
                <div className="space-y-1">
                  <span className="text-sm font-medium text-foreground">Replace group with team</span>
                  <p className="text-xs text-muted-foreground">
                    Remove the draft group after creation and keep the new team as the operational unit on the canvas.
                  </p>
                </div>
              </label>
            )}
          </div>
        )}

        {/* Step: Members */}
        {step === 'members' && (
          <div className="space-y-4 py-2">
            {/* Current members */}
            {members.length > 0 && (
              <div className="space-y-2">
                <Label>Members ({members.length})</Label>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {members.map((m) => (
                    <div
                      key={m.assistant.id}
                      className="flex items-start gap-2 rounded-lg border bg-background p-2"
                    >
                      <ModelIcon model={m.assistant.lucid_model} size={16} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{m.assistant.name}</span>
                          {m.isCoordinator && (
                            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              Coordinator
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={getCrewRoleSelectValue(m.role)}
                            onValueChange={(value) => updateMemberRolePreset(m.assistant.id, value)}
                          >
                            <SelectTrigger className="h-8 w-[172px] text-xs">
                              <SelectValue placeholder="Choose role" />
                            </SelectTrigger>
                            <SelectContent className="z-[120]">
                              <SelectItem value={UNSET_CREW_ROLE_VALUE}>Choose role</SelectItem>
                              {CREW_ROLE_PRESETS.map((preset) => (
                                <SelectItem key={preset.value} value={preset.value}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                              <SelectItem value={CUSTOM_CREW_ROLE_VALUE}>Custom role</SelectItem>
                            </SelectContent>
                          </Select>
                          {getCrewRoleSelectValue(m.role) === CUSTOM_CREW_ROLE_VALUE && (
                            <Input
                              className="h-8 w-[132px] text-xs"
                              placeholder="Custom role"
                              value={m.role}
                              onChange={(e) => updateMemberRole(m.assistant.id, e.target.value)}
                            />
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setCoordinator(m.assistant.id)}
                        className={cn(
                          'mt-0.5 rounded p-1 transition-colors',
                          m.isCoordinator
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'text-muted-foreground/30 hover:text-amber-400',
                        )}
                        title={m.isCoordinator ? 'Coordinator' : 'Set as coordinator'}
                      >
                        <Crown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeMember(m.assistant.id)}
                        className="mt-0.5 rounded p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available agents to add */}
            {availableAssistants.length > 0 && (
              <div className="space-y-2">
                <Label>Add agents</Label>
                <div className="space-y-1 max-h-[160px] overflow-y-auto">
                  {availableAssistants.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => addMember(a)}
                      className="flex items-center gap-2 w-full p-2 rounded-lg border border-dashed hover:border-primary/50 hover:bg-accent/50 transition-colors text-left"
                    >
                      <ModelIcon model={a.lucid_model} size={16} />
                      <span className="text-sm truncate flex-1">{a.name}</span>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {members.length > 0 && !members.some((m) => m.isCoordinator) && (
              <p className="text-xs text-destructive">Pick a coordinator (click the crown icon).</p>
            )}
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="space-y-3 py-2">
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <GenerationPromptPanel
                id="crew-guided-edit"
                label="Refine with AI"
                description="Lucid works on the current selected members and suggests a tighter team shape before creation."
                prompt={guidedEditPrompt}
                onPromptChange={setGuidedEditPrompt}
                placeholder="Make the team more explicit about triage versus resolution, and tighten the coordinator role."
                rows={3}
                compact
                isGenerating={isGuidedEditLoading}
                hasResult={Boolean(guidedEditResult)}
                disabled={members.length === 0}
                onGenerate={() => { void handleRunGuidedEdit() }}
                onClear={() => {
                  setGuidedEditPrompt('')
                  resetGuidedEdit()
                }}
              />
              {guidedEditResult ? (
                <GenerationSuggestionCard
                  reasoningSummary={guidedEditResult.reasoning_summary}
                  warnings={guidedEditResult.warnings}
                  className="space-y-3 rounded-lg border bg-background/60 p-3"
                >
                  <GenerationModeSummary result={guidedEditResult} title="Suggested path" />
                  {guidedEditApplyResult?.members ? (
                    <>
                      <div className="grid gap-2 text-xs text-muted-foreground">
                        <p>Name: <span className="text-foreground">{guidedEditApplyResult.name}</span></p>
                        <p>Objective: <span className="text-foreground">{guidedEditApplyResult.objective || 'No objective'}</span></p>
                      </div>
                      <div className="space-y-1">
                        {guidedEditApplyResult.members.map((member) => (
                          <div key={member.assistant.id} className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-foreground">{member.assistant.name}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {member.role}
                            </span>
                            {member.isCoordinator ? <Crown className="h-3 w-3 text-amber-400" /> : null}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <Button type="button" size="sm" onClick={handleApplyGuidedEdit}>
                          Apply suggestion
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {guidedEditApplyResult?.reason ?? 'This suggestion needs a different member count. Adjust the selected agents first, then refine again.'}
                    </p>
                  )}
                </GenerationSuggestionCard>
              ) : null}
            </div>
            <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{name}</span>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {members.length} agents
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3">{objective}</p>
            </div>
            <div className="space-y-1">
              {members.map((m) => (
                <div key={m.assistant.id} className="flex items-center gap-2 text-sm">
                  <ModelIcon model={m.assistant.lucid_model} size={14} />
                  <span className="truncate">{m.assistant.name}</span>
                  {m.role && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {m.role}
                    </span>
                  )}
                  {m.isCoordinator && <Crown className="h-3 w-3 text-amber-400" />}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              Topology: Star (coordinator connects to all members)
            </p>
          </div>
        )}

        <DialogFooter className="flex items-center gap-2">
          {canGoBack && (
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={isSubmitting}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {!isLastStep ? (
            <Button size="sm" onClick={handleNext} disabled={!canAdvance()}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || !canAdvance()}>
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
