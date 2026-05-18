import type { CollectionConfig } from 'payload'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'orgId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Lucid Organization ID',
    },
    { name: 'domain', type: 'text', label: 'Custom Domain (future)' },
  ],
}
