import type { CollectionConfig } from 'payload'

export const ContentItems: CollectionConfig = {
  slug: 'content-items',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'contentType', 'status', 'publishedAt'],
  },
  versions: {
    drafts: true,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: false,
      index: true,
      admin: { position: 'sidebar' },
    },
    { name: 'body', type: 'richText' },
    { name: 'excerpt', type: 'textarea', admin: { rows: 3 } },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    {
      name: 'contentType',
      type: 'select',
      required: true,
      defaultValue: 'blog_post',
      options: [
        { label: 'Blog Post', value: 'blog_post' },
        { label: 'Newsletter', value: 'newsletter' },
        { label: 'Social Post', value: 'social_post' },
        { label: 'Changelog', value: 'changelog' },
        { label: 'Announcement', value: 'announcement' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Review', value: 'review' },
        { label: 'Approved', value: 'approved' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'seoTitle',
      type: 'text',
      label: 'SEO Title',
      admin: { position: 'sidebar' },
    },
    {
      name: 'seoDescription',
      type: 'textarea',
      label: 'SEO Description',
      admin: { position: 'sidebar', rows: 2 },
    },
    {
      name: 'createdByType',
      type: 'select',
      defaultValue: 'human',
      options: [
        { label: 'Human', value: 'human' },
        { label: 'Agent', value: 'agent' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'createdByAgent',
      type: 'text',
      label: 'Agent ID',
      admin: {
        position: 'sidebar',
        condition: (data) => data?.createdByType === 'agent',
      },
    },
    { name: 'author', type: 'relationship', relationTo: 'authors' },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'scheduledPublishAt',
      type: 'date',
      label: 'Scheduled Publish',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data && !data.slug && data.title) {
          data.slug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
        }
        if (data?.status === 'published' && !data.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }
        return data
      },
    ],
  },
}
