"use client"

import * as React from "react"

export type AgentBuilderStartView = "browse" | "blank" | "template" | "describe" | "upload"

export interface UseAgentBuilderStartStateInput {
  workspaceSlug: string
  initialTemplateSlug?: string | null
  initialBlank?: boolean
  initialDescribe?: boolean
  initialUpload?: boolean
  initialBrowseAllTemplates?: boolean
  initialPrompt?: string
  urlBasePath?: string
}

export function useAgentBuilderStartState({
  workspaceSlug,
  initialTemplateSlug = null,
  initialBlank = false,
  initialDescribe = false,
  initialUpload = false,
  initialBrowseAllTemplates = false,
  initialPrompt = "",
  urlBasePath,
}: UseAgentBuilderStartStateInput) {
  const [activeTemplateSlug, setActiveTemplateSlug] = React.useState<string | null>(initialTemplateSlug)
  const [activeView, setActiveView] = React.useState<AgentBuilderStartView>(
    resolveAgentBuilderInitialStartView({ initialTemplateSlug, initialBlank, initialDescribe, initialUpload }),
  )
  const [isBrowseAllTemplates, setIsBrowseAllTemplates] = React.useState(initialBrowseAllTemplates)
  const [generationPrompt, setGenerationPrompt] = React.useState(initialPrompt)
  const [submittedDescribePrompt, setSubmittedDescribePrompt] = React.useState(initialPrompt)
  const basePath = urlBasePath ?? `/${workspaceSlug}/new`

  const syncUrl = React.useCallback((params: URLSearchParams | null) => {
    const nextUrl = params && Array.from(params.keys()).length > 0
      ? `${basePath}?${params.toString()}`
      : basePath
    window.history.pushState({}, "", nextUrl)
  }, [basePath])

  React.useEffect(() => {
    setActiveTemplateSlug(initialTemplateSlug)
    setActiveView(resolveAgentBuilderInitialStartView({ initialTemplateSlug, initialBlank, initialDescribe, initialUpload }))
  }, [initialBlank, initialDescribe, initialTemplateSlug, initialUpload])

  React.useEffect(() => {
    setIsBrowseAllTemplates(initialBrowseAllTemplates)
  }, [initialBrowseAllTemplates])

  React.useEffect(() => {
    if (!initialPrompt.trim()) return
    setGenerationPrompt((current) => current || initialPrompt)
    setSubmittedDescribePrompt((current) => current || initialPrompt)
  }, [initialPrompt])

  React.useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const nextTemplate = params.get("template")
      const nextBlank = params.get("blank") === "1"
      const start = params.get("start")
      const nextDescribe = start === "describe" || start === "interview"
      const nextUpload = start === "upload"
      const nextBrowseAll = params.get("view") === "templates"

      setActiveTemplateSlug(nextTemplate)
      setActiveView(resolveAgentBuilderInitialStartView({
        initialTemplateSlug: nextTemplate,
        initialBlank: nextBlank,
        initialDescribe: nextDescribe,
        initialUpload: nextUpload,
      }))
      setIsBrowseAllTemplates(nextBrowseAll)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  const pushBrowse = React.useCallback(() => {
    setActiveTemplateSlug(null)
    setActiveView("browse")
    setIsBrowseAllTemplates(false)
    syncUrl(null)
  }, [syncUrl])

  const pushBrowseAllTemplates = React.useCallback(() => {
    setActiveTemplateSlug(null)
    setActiveView("browse")
    setIsBrowseAllTemplates(true)
    syncUrl(new URLSearchParams([["view", "templates"]]))
  }, [syncUrl])

  const pushBlank = React.useCallback(() => {
    setActiveTemplateSlug(null)
    setActiveView("blank")
    setIsBrowseAllTemplates(false)
    syncUrl(new URLSearchParams([["blank", "1"]]))
  }, [syncUrl])

  const pushDescribe = React.useCallback(() => {
    setActiveTemplateSlug(null)
    setActiveView("describe")
    setIsBrowseAllTemplates(false)
    syncUrl(new URLSearchParams([["start", "describe"]]))
  }, [syncUrl])

  const pushUpload = React.useCallback(() => {
    setActiveTemplateSlug(null)
    setActiveView("upload")
    setIsBrowseAllTemplates(false)
    syncUrl(new URLSearchParams([["start", "upload"]]))
  }, [syncUrl])

  const pushTemplate = React.useCallback((templateSlug: string) => {
    setActiveTemplateSlug(templateSlug)
    setActiveView("template")
    setIsBrowseAllTemplates(false)
    syncUrl(new URLSearchParams([["template", templateSlug]]))
  }, [syncUrl])

  const submitDescribePrompt = React.useCallback((prompt: string) => {
    const trimmed = prompt.trim()
    if (!trimmed) return false
    setSubmittedDescribePrompt(trimmed)
    pushDescribe()
    return true
  }, [pushDescribe])

  return {
    activeTemplateSlug,
    activeView,
    isBrowseAllTemplates,
    generationPrompt,
    submittedDescribePrompt,
    setGenerationPrompt,
    pushBrowse,
    pushBrowseAllTemplates,
    pushBlank,
    pushDescribe,
    pushUpload,
    pushTemplate,
    submitDescribePrompt,
  }
}

export function resolveAgentBuilderInitialStartView({
  initialTemplateSlug,
  initialBlank,
  initialDescribe,
  initialUpload,
}: {
  initialTemplateSlug?: string | null
  initialBlank?: boolean
  initialDescribe?: boolean
  initialUpload?: boolean
}): AgentBuilderStartView {
  return initialTemplateSlug
    ? "template"
    : initialBlank
      ? "blank"
      : initialUpload
        ? "upload"
        : initialDescribe
          ? "describe"
          : "browse"
}
