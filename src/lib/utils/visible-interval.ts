/**
 * Tab-visibility-aware setInterval.
 *
 * Pauses when the tab is hidden to save network/battery.
 * Refetches immediately when the tab becomes visible again.
 *
 * @returns cleanup function (call in useEffect return)
 */
export function setVisibleInterval(
  callback: () => void,
  intervalMs: number,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null

  const start = () => {
    if (!timer) timer = setInterval(callback, intervalMs)
  }

  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      stop()
    } else {
      callback()
      start()
    }
  }

  if (document.visibilityState !== 'hidden') {
    start()
  }

  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    stop()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
