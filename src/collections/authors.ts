import type { CollectionConfig } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: false, index: true },
    { name: 'avatar', type: 'upload', relationTo: 'media' },
    { name: 'bio', type: 'textarea' },
    { name: 'isAgent', type: 'checkbox', defaultValue: false },
    {
      name: 'agentId',
      type: 'text',
      admin: { condition: (data) => data?.isAgent },
    },
    {
      name: 'lucidUserId',
      type: 'text',
      label: 'Lucid User ID',
      admin: { condition: (data) => !data?.isAgent },
    },
  ],
}
