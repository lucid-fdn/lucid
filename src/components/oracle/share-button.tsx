'use client'

import { useState, useEffect } from 'react'

export function ShareButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [copied, setCopied] = useState(false)

  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const shareUrl = `${origin}/oracle/agents/${agentId}`
  const tweetText = `Check out ${agentName} on the Agent Economy Oracle`
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border border-border inline-flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Share
      </a>
      <button
        onClick={handleCopy}
        className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border border-border"
      >
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}
