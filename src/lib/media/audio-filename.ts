import 'server-only'

export function normalizeAudioTranscriptionFileName(params: {
  fallbackBaseName: string
  attachmentFileName?: string
  downloadedFileName: string
  mimeType: string
}): string {
  const normalizeOggExtension = (name: string): string => name.replace(/\.[^.]+$/u, '') + '.ogg'

  const explicitName = params.attachmentFileName?.trim()
  if (explicitName) {
    if (/\.oga$/iu.test(explicitName)) return normalizeOggExtension(explicitName)
    return explicitName
  }

  const downloaded = params.downloadedFileName.trim() || params.fallbackBaseName
  const normalizedMime = params.mimeType.trim().toLowerCase()

  if (normalizedMime === 'audio/ogg' || normalizedMime === 'audio/opus' || /\.oga$/iu.test(downloaded)) {
    return normalizeOggExtension(downloaded)
  }

  return downloaded
}
