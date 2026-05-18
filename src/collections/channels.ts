import type { CollectionConfig } from 'payload'

export const Channels: CollectionConfig = {
  slug: 'channels',
  admin: {
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'channelType',
      type: 'select',
      required: true,
      options: [
        { label: 'Blog', value: 'blog' },
        { label: 'X', value: 'twitter' },
        { label: 'LinkedIn', value: 'linkedin' },
        { label: 'Email Newsletter', value: 'email' },
        { label: 'Documentation', value: 'docs' },
      ],
    },
    {
      name: 'config',
      type: 'json',
      label: 'Channel Config (non-secret settings only)',
    },
    {
      name: 'credentialsRef',
      type: 'text',
      label: 'Credentials Reference',
      admin: {
        description: 'Env var name or vault path — NEVER store secrets directly',
      },
    },
    { name: 'isActive', type: 'checkbox', defaultValue: true },
  ],
}
