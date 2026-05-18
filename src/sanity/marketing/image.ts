import createImageUrlBuilder from '@sanity/image-url'
import type { SanityImageSource } from '@sanity/image-url/lib/types/types'
import { dataset, projectId } from './env'

let _builder: ReturnType<typeof createImageUrlBuilder> | null = null

function getBuilder() {
  if (!_builder) {
    _builder = createImageUrlBuilder({ projectId, dataset })
  }
  return _builder
}

export function image(source: SanityImageSource) {
  return getBuilder().image(source).auto('format')
}
