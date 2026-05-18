'use client'

import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { teamInvitesSchema, type TeamInvitesData, type WorkspaceOnboardingData } from '@/lib/forms/workspace-onboarding-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X } from 'lucide-react'

interface StepTeamInvitesProps {
  data: Partial<WorkspaceOnboardingData>
  onComplete: (data: Partial<WorkspaceOnboardingData>) => void
  onBack: () => void
  isLoading: boolean
}

export function StepTeamInvites({ data, onComplete, onBack, isLoading }: StepTeamInvitesProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TeamInvitesData>({
    resolver: zodResolver(teamInvitesSchema) as any,
    defaultValues: {
      invites: data.invites?.length ? data.invites : [{ email: '', role: 'developer' }],
      skip_invites: false,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'invites',
  })

  const onSubmit = (formData: TeamInvitesData) => {
    onComplete(formData)
  }

  const handleSkip = () => {
    onComplete({ invites: [] })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Bring your team along
        </h1>
        <p className="text-muted-foreground text-lg">
          They'll get access to your agents and workspace
        </p>
      </div>

      {/* Invites Card */}
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-6 space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              {/* Email Input */}
              <div className="flex-1 space-y-2">
                <Label htmlFor={`invites.${index}.email`}>
                  Email Address
                </Label>
                <Input
                  id={`invites.${index}.email`}
                  type="email"
                  placeholder="teammate@example.com"
                  {...register(`invites.${index}.email` as const)}
                  className={errors.invites?.[index]?.email ? 'border-destructive' : ''}
                />
                {errors.invites?.[index]?.email && (
                  <p className="text-sm text-destructive">
                    {errors.invites[index]?.email?.message}
                  </p>
                )}
              </div>

              {/* Role Select */}
              <div className="w-40 space-y-2">
                <Label htmlFor={`invites.${index}.role`}>
                  Role
                </Label>
                <Controller
                  control={control}
                  name={`invites.${index}.role` as const}
                  render={({ field: controllerField }) => (
                    <Select
                      value={controllerField.value}
                      onValueChange={controllerField.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="developer">Developer</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Remove Button */}
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-8"
                  onClick={() => remove(index)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Remove invite</span>
                </Button>
              )}
            </div>
          ))}

          {/* Add More Button */}
          {fields.length < 10 && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => append({ email: '', role: 'developer' })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add another teammate
            </Button>
          )}

          {errors.invites?.message && (
            <p className="text-sm text-destructive text-center">
              {errors.invites.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <p className="text-center text-sm text-muted-foreground max-w-md mx-auto">
        Don't worry, you can always invite more people later from your workspace settings
      </p>

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          disabled={isLoading}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={handleSkip}
          disabled={isLoading}
        >
          Skip for now
        </Button>
        <Button
          type="submit"
          size="lg"
          disabled={isLoading}
          className="min-w-[200px]"
        >
          {isLoading ? 'Sending invites...' : 'Send Invites'}
        </Button>
      </div>
    </form>
  )
}
