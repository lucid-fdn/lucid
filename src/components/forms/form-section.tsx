'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface FormSectionProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

/**
 * Form Section Component
 * 
 * Optional wrapper for grouping related form fields in a Card
 * Provides consistent styling across forms
 * 
 * @example
 * ```tsx
 * <FormSection title="Basic Info" description="Your name and avatar">
 *   <FormField label="Name" name="name" />
 *   <FormField label="Email" name="email" />
 * </FormSection>
 * ```
 * 
 * NOTE: This is optional! You can keep using Card directly.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: FormSectionProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
      </CardContent>
    </Card>
  )
}
