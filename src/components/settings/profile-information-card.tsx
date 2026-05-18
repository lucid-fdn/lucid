'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { accountInfoSchema, type AccountInfoData } from '@/lib/forms/schemas'
import { updateAccountInfoAction } from '@/lib/forms/actions'
import { UsernameField } from '@/components/forms/username-field'
import { FormField } from '@/components/forms/form-field'
import { notificationCopy } from '@/lib/notifications/copy'
import { summarizeError } from '@/lib/logging/safe-log'

interface ProfileInformationCardProps {
  defaultValues: {
    first_name?: string
    last_name?: string
    handle?: string
    email?: string
  }
}

export function ProfileInformationCard({ defaultValues }: ProfileInformationCardProps) {
  const { user } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<AccountInfoData>({
    resolver: zodResolver(accountInfoSchema),
    defaultValues: {
      first_name: defaultValues.first_name || '',
      last_name: defaultValues.last_name || '',
      handle: defaultValues.handle || '',
    },
  })

  const handle = watch('handle')

  const onSubmit = async (data: AccountInfoData) => {
    setLoading(true)

    try {
      const result = await updateAccountInfoAction(data)

      if (result.success) {
        toast.success(notificationCopy.profile.updatedSuccessfully)
      } else {
        toast.error(result.error ?? 'Failed to update account')
      }
    } catch (error) {
      console.error('[profile-information-card] Submit error:', summarizeError(error))
      toast.error(notificationCopy.common.unexpectedError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your personal information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* First Name */}
          <FormField
            label="First name"
            name="first_name"
            placeholder="John"
            error={errors.first_name?.message}
            required
            register={register('first_name')}
          />

          {/* Last Name */}
          <FormField
            label="Last name"
            name="last_name"
            placeholder="Doe"
            error={errors.last_name?.message}
            required
            register={register('last_name')}
          />

          {/* Primary Email - Read Only */}
          <FormField
            label="Primary email"
            name="email"
            value={user?.email ?? defaultValues.email ?? 'No email linked'}
            disabled
            help="Primary email is used for account notifications"
            className="[&_input]:bg-muted"
          />

          {/* Username */}
          <div className="space-y-2">
            <UsernameField
              value={handle}
              onChange={(value) => setValue('handle', value, { shouldValidate: true })}
              error={errors.handle?.message}
              required
            />
            <p className="text-xs text-muted-foreground">
              Username appears as a display name throughout the dashboard
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button type="submit" disabled={loading || !isDirty}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
