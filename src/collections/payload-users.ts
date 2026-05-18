import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'payload-users',
  auth: {
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      options: ['super-admin', 'admin', 'editor', 'viewer'],
      defaultValue: 'editor',
    },
    {
      name: 'lucidUserId',
      type: 'text',
      index: true,
      label: 'Lucid User ID (from Privy)',
    },
  ],
}
