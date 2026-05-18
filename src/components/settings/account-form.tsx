'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UsernameField } from '@/components/forms/username-field'
import { FormField } from '@/components/forms/form-field'
import { FormSection } from '@/components/forms/form-section'
import { FormActions } from '@/components/forms/form-actions'
import { FormMessage } from '@/components/forms/form-message'
import { accountInfoSchema, type AccountInfoData } from '@/lib/forms/schemas'
import { updateAccountInfoAction } from '@/lib/forms/actions'

interface AccountFormProps {
  defaultValues: Partial<AccountInfoData>
}

export function AccountForm({ defaultValues }: AccountFormProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
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
    setMessage(null)

    try {
      const result = await updateAccountInfoAction(data)

      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Account updated' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update account' })
      }
    } catch (error) {
      console.error('[account-form] Submit error:', error)
      setMessage({ type: 'error', text: 'An unexpected error occurred' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Success/Error Message */}
      {message && (
        <FormMessage
          type={message.type}
          message={message.text}
        />
      )}

      {/* Account Info */}
      <FormSection
        title="Account Information"
        description="Your basic account details"
      >
        <FormField
          label="First Name"
          name="first_name"
          placeholder="John"
          error={errors.first_name?.message}
          required
          register={register('first_name')}
        />

        <FormField
          label="Last Name"
          name="last_name"
          placeholder="Doe"
          error={errors.last_name?.message}
          required
          register={register('last_name')}
        />

        <UsernameField
          value={handle}
          onChange={(value) => setValue('handle', value)}
          error={errors.handle?.message}
          required
        />
      </FormSection>

      {/* Submit Actions */}
      <FormActions loading={loading} />
    </form>
  )
}
