import 'server-only'

import type { ImageBackground, ImageOutputFormat, ImageQuality, ImageSize } from './types'

const VALID_SIZES: readonly ImageSize[] = ['1024x1024', '1024x1536', '1536x1024', 'auto']
const VALID_QUALITIES: readonly ImageQuality[] = ['low', 'medium', 'high', 'auto']
const VALID_FORMATS: readonly ImageOutputFormat[] = ['png', 'webp', 'jpeg']
const VALID_BACKGROUNDS: readonly ImageBackground[] = ['opaque', 'transparent', 'auto']

export function resolveImageSize(size?: string | null): ImageSize {
  return VALID_SIZES.includes(size as ImageSize) ? (size as ImageSize) : '1024x1024'
}

export function resolveImageQuality(quality?: string | null): ImageQuality {
  const configured = quality ?? process.env.IMAGE_QUALITY
  return VALID_QUALITIES.includes(configured as ImageQuality) ? (configured as ImageQuality) : 'high'
}

export function resolveImageOutputFormat(format?: string | null): ImageOutputFormat {
  const configured = format ?? process.env.IMAGE_OUTPUT_FORMAT
  return VALID_FORMATS.includes(configured as ImageOutputFormat) ? (configured as ImageOutputFormat) : 'webp'
}

export function resolveImageBackground(background?: string | null): ImageBackground {
  return VALID_BACKGROUNDS.includes(background as ImageBackground) ? (background as ImageBackground) : 'auto'
}

export function mimeTypeForImageFormat(format: ImageOutputFormat): 'image/png' | 'image/webp' | 'image/jpeg' {
  switch (format) {
    case 'png':
      return 'image/png'
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
    default:
      return 'image/webp'
  }
}
