import type { CollectionConfig } from 'payload'

export const Publications: CollectionConfig = {
  slug: 'publications',
  admin: {
    defaultColumns: ['contentItem', 'channel', 'status', 'publishedAt'],
  },
  fields: [
    {
      name: 'contentItem',
      type: 'relationship',
      relationTo: 'content-items',
      required: true,
    },
    {
      name: 'channel',
      type: 'relationship',
      relationTo: 'channels',
      required: true,
    },
    { name: 'publishedAt', type: 'date' },
    {
      name: 'externalId',
      type: 'text',
      label: 'External ID (tweet ID, campaign ID, etc.)',
    },
    { name: 'externalUrl', type: 'text', label: 'External URL' },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Published', value: 'published' },
        { label: 'Failed', value: 'failed' },
        { label: 'Retracted', value: 'retracted' },
      ],
    },
  ],
}
