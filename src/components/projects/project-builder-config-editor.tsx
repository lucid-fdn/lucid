'use client'

import * as React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import type { BlueprintConfigFormat } from '@/lib/projects/blueprint-serialization'

interface ProjectBuilderConfigEditorProps {
  value: string
  format: BlueprintConfigFormat
  onChange: (value: string) => void
  validateChange?: (value: string) => boolean
  onRejectedChange?: () => void
}

const lucidEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#050505 !important',
    fontSize: '12px',
  },
  '.cm-editor': {
    backgroundColor: '#050505 !important',
  },
  '.cm-scroller': {
    backgroundColor: '#050505 !important',
    minHeight: '520px',
    fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.45',
  },
  '.cm-content': {
    backgroundColor: '#050505 !important',
    padding: '16px 0',
    caretColor: 'hsl(var(--foreground))',
  },
  '.cm-line': {
    padding: '0 16px',
  },
  '.cm-layer, .cm-selectionLayer, .cm-cursorLayer': {
    backgroundColor: 'transparent !important',
  },
  '.cm-gutters': {
    backgroundColor: '#050505 !important',
    borderRight: '1px solid hsl(var(--border) / 0.45)',
    color: 'hsl(var(--muted-foreground) / 0.55)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#0d0d0d !important',
  },
  '.cm-activeLine': {
    backgroundColor: '#0d0d0d !important',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'hsl(var(--primary) / 0.22) !important',
  },
  '&.cm-focused': {
    outline: 'none',
  },
})

export function ProjectBuilderConfigEditor({
  value,
  format,
  onChange,
  validateChange,
  onRejectedChange,
}: ProjectBuilderConfigEditorProps) {
  const extensions = React.useMemo<Extension[]>(
    () => [
      format === 'yaml' ? yaml() : json(),
      EditorState.transactionFilter.of((transaction) => {
        if (!transaction.docChanged || !validateChange) return transaction
        const nextValue = transaction.newDoc.toString()
        if (validateChange(nextValue)) return transaction
        onRejectedChange?.()
        return []
      }),
      lucidEditorTheme,
      EditorView.lineWrapping,
    ],
    [format, onRejectedChange, validateChange],
  )

  return (
    <CodeMirror
      value={value}
      height="auto"
      basicSetup={{
        foldGutter: false,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        highlightSelectionMatches: false,
      }}
      theme={oneDark}
      extensions={extensions}
      onChange={onChange}
    />
  )
}
