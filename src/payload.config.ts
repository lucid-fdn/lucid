import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { fileURLToPath } from 'url'
import path from 'path'
import sharp from 'sharp'

import { ContentItems } from './collections/content-items'
import { Channels } from './collections/channels'
import { Publications } from './collections/publications'
import { Categories } from './collections/categories'
import { Authors } from './collections/authors'
import { Media } from './collections/media'
import { Tenants } from './collections/tenants'
import { Users as PayloadUsers } from './collections/payload-users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'CHANGE-ME-IN-PRODUCTION',

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '',
    },
    schemaName: 'payload',
    push: process.env.NODE_ENV !== 'production',
  }),

  editor: lexicalEditor({}),

  collections: [
    PayloadUsers,
    Tenants,
    ContentItems,
    Channels,
    Publications,
    Categories,
    Authors,
    Media,
  ],

  admin: {
    user: 'payload-users',
    meta: {
      titleSuffix: '- Lucid Studio',
    },
    importMap: {
      baseDir: path.resolve(dirname),
      importMapFile: path.resolve(dirname, 'app', '(payload)', 'content-admin', 'importMap.js'),
    },
  },

  routes: {
    admin: '/content-admin',
    api: '/content-api',
  },

  plugins: [
    multiTenantPlugin({
      collections: {
        'content-items': {},
        channels: {},
        publications: {},
        categories: {},
        authors: {},
        media: {},
      },
      tenantsArrayField: {
        includeDefaultField: true,
        rowFields: [
          {
            name: 'roles',
            type: 'select',
            hasMany: true,
            options: ['admin', 'editor', 'viewer'],
          },
        ],
      },
    }),
    s3Storage({
      collections: {
        media: {
          generateFileURL: ({ filename: fname, prefix }) =>
            `${process.env.R2_PUBLIC_URL || ''}/${prefix || ''}${fname}`,
        },
      },
      clientUploads: true,
      bucket: process.env.R2_MEDIA_BUCKET_NAME || 'lucid-media',
      config: {
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID || ''}.r2.cloudflarestorage.com`,
      },
    }),
  ],

  sharp,

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
