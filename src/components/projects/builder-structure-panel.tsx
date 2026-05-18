'use client'

import * as React from 'react'
import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'
import { ChevronDown } from 'lucide-react'
import { BuilderAccordionBadge, BuilderAccordionItem } from '@/components/projects/builder-accordion-item'
import {
  addTeamMember,
  convertDraftToAgent,
  convertDraftToTeam,
  getDraftStructure,
  removeTeamMember,
  updateTeamMember,
  updateTeamMemberStructured,
} from '@/lib/ai/project-generation/structure'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function BuilderStructurePanel({
  draft,
  lockedKind,
  onUpdateDraft,
}: {
  draft: GenerationDraft
  lockedKind?: 'agent' | 'team'
  onUpdateDraft: (updater: (draft: GenerationDraft) => GenerationDraft) => void
}) {
  const structure = getDraftStructure(draft)
  const team = draft.team
  const isLocked = Boolean(lockedKind)
  const effectiveStructure = lockedKind ?? structure
  const [openMemberIndex, setOpenMemberIndex] = React.useState(0)
  const structureDescription = isLocked
    ? effectiveStructure === 'team'
      ? `${team?.members.length ?? 0} agents from the selected template.`
      : 'One agent from the selected template.'
    : effectiveStructure === 'team'
      ? `${team?.members.length ?? 0} agents with editable roles.`
      : 'One agent for direct execution.'

  React.useEffect(() => {
    if (!team?.members.length) return
    setOpenMemberIndex((current) => Math.min(current, team.members.length - 1))
  }, [team?.members.length])

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {effectiveStructure === 'team' ? 'Agents & roles' : 'Structure'}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {structureDescription}
          </p>
        </div>
        <Badge variant="outline" className="rounded-full text-[10px]">
          {effectiveStructure === 'team' ? 'Team' : 'Single agent'}
        </Badge>
      </div>

      {!isLocked ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={structure === 'agent' ? 'secondary' : 'outline'}
            className="h-auto justify-start rounded-2xl px-3 py-3 text-left"
            onClick={() => onUpdateDraft(convertDraftToAgent)}
          >
            <span className="space-y-1">
              <span className="block text-sm font-medium">Single agent</span>
              <span className="block text-xs text-muted-foreground">Fastest path for one clear operator.</span>
            </span>
          </Button>
          <Button
            type="button"
            variant={structure === 'team' ? 'secondary' : 'outline'}
            className="h-auto justify-start rounded-2xl px-3 py-3 text-left"
            onClick={() => onUpdateDraft(convertDraftToTeam)}
          >
            <span className="space-y-1">
              <span className="block text-sm font-medium">Team</span>
              <span className="block text-xs text-muted-foreground">Use roles, handoffs, and coordination.</span>
            </span>
          </Button>
        </div>
      ) : null}

      {effectiveStructure === 'team' && team ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {team.members.map((member, memberIndex) => {
              const isOpen = memberIndex === openMemberIndex
              const responsibilityCount = member.responsibilities?.filter((item) => item.trim()).length ?? 0
              const responsibilityLabel = responsibilityCount === 0
                ? 'No responsibilities'
                : responsibilityCount === 1
                  ? '1 responsibility'
                  : `${responsibilityCount} responsibilities`
              return (
                <BuilderAccordionItem
                  key={`${member.role}-${memberIndex}`}
                  open={isOpen}
                  onOpenChange={(open) => setOpenMemberIndex(open ? memberIndex : -1)}
                  title={(
                    <span className="flex items-center gap-2">
                      <span className="truncate">{member.role.trim() || `Role ${memberIndex + 1}`}</span>
                      {member.is_coordinator ? (
                        <BuilderAccordionBadge>Lead</BuilderAccordionBadge>
                      ) : null}
                    </span>
                  )}
                  subtitle={member.description?.trim() || responsibilityLabel}
                  badges={(
                    <BuilderAccordionBadge variant={member.system_prompt_mode === 'manual' ? 'secondary' : 'outline'}>
                      {member.system_prompt_mode === 'manual' ? 'Manual' : 'Auto'}
                    </BuilderAccordionBadge>
                  )}
                >
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const nextIndex = Math.max(0, memberIndex - 1)
                        onUpdateDraft((current) => removeTeamMember(current, member.role))
                        setOpenMemberIndex(nextIndex)
                      }}
                      disabled={team.members.length <= 2}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`team-member-role-${memberIndex}`}>Role name</Label>
                      <Input
                        id={`team-member-role-${memberIndex}`}
                        value={member.role}
                        onChange={(event) => {
                          const nextRole = event.target.value
                          onUpdateDraft((current) => updateTeamMemberStructured(current, member.role, (currentMember) => ({
                            ...currentMember,
                            role: nextRole,
                          })))
                        }}
                        placeholder="Researcher, Writer, QA reviewer..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`team-member-mission-${memberIndex}`}>Mission</Label>
                      <Input
                        id={`team-member-mission-${memberIndex}`}
                        value={member.description ?? ''}
                        onChange={(event) => {
                          const description = event.target.value
                          onUpdateDraft((current) => updateTeamMemberStructured(current, member.role, (currentMember) => ({
                            ...currentMember,
                            description,
                          })))
                        }}
                        placeholder="What this subagent owns"
                      />
                    </div>
                  </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Responsibilities</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onUpdateDraft((current) => updateTeamMemberStructured(current, member.role, (currentMember) => ({
                              ...currentMember,
                              responsibilities: [...(currentMember.responsibilities ?? []), ''],
                            })))}
                          >
                            Add
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {(member.responsibilities?.length ? member.responsibilities : ['']).map((responsibility, responsibilityIndex) => (
                            <div key={`${member.role}-responsibility-${responsibilityIndex}`} className="flex items-center gap-2">
                              <Input
                                value={responsibility}
                                onChange={(event) => {
                                  const value = event.target.value
                                  onUpdateDraft((current) => updateTeamMemberStructured(current, member.role, (currentMember) => {
                                    const responsibilities = currentMember.responsibilities?.length
                                      ? [...currentMember.responsibilities]
                                      : ['']
                                    responsibilities[responsibilityIndex] = value
                                    return {
                                      ...currentMember,
                                      responsibilities,
                                    }
                                  }))
                                }}
                                placeholder="Own a clear outcome"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onUpdateDraft((current) => updateTeamMemberStructured(current, member.role, (currentMember) => ({
                                  ...currentMember,
                                  responsibilities: (currentMember.responsibilities ?? [])
                                    .filter((_, index) => index !== responsibilityIndex),
                                })))}
                                disabled={(member.responsibilities?.length ?? 0) <= 1}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <details className="group rounded-2xl border border-border/50 bg-muted/10">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground">
                          <span>Advanced instructions</span>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              {member.system_prompt_mode === 'manual' ? 'Manual' : 'Auto'}
                            </Badge>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-border/50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor={`team-member-instructions-${memberIndex}`}>System instructions</Label>
                            {member.system_prompt_mode === 'manual' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onUpdateDraft((current) => updateTeamMemberStructured(current, member.role, (currentMember) => ({
                                  ...currentMember,
                                  system_prompt_mode: 'auto',
                                })))}
                              >
                                Regenerate
                              </Button>
                            ) : null}
                          </div>
                          <Textarea
                            id={`team-member-instructions-${memberIndex}`}
                            value={member.system_prompt}
                            onChange={(event) => onUpdateDraft((current) => updateTeamMember(current, member.role, (currentMember) => ({
                              ...currentMember,
                              system_prompt: event.target.value,
                              system_prompt_mode: 'manual',
                            })))}
                            placeholder="Optional operating instructions for this subagent"
                            className="min-h-24"
                          />
                        </div>
                      </details>
                </BuilderAccordionItem>
              )
            })}
            <Button type="button" size="sm" variant="outline" className="w-full rounded-2xl" onClick={() => {
              onUpdateDraft(addTeamMember)
              setOpenMemberIndex(team.members.length)
            }}>
              Add role
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
