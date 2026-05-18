import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    mimeTypes: ['image/*', 'video/*', 'application/pdf'],
  },
  admin: {
    useAsTitle: 'alt',
  },
  fields: [{ name: 'alt', type: 'text', required: true }],
}
