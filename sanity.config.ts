'use client'

import { visionTool } from '@sanity/vision'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { apiVersion, dataset, projectId } from './src/sanity/marketing/env'
import { schema } from './src/sanity/marketing/schema'
import { Logo } from './src/components/logo'

export default defineConfig({
  name: 'Lucid',
  title: 'Lucid CMS',
  basePath: '/studio',
  projectId,
  dataset,
  schema,
  icon: Logo,
  plugins: [structureTool(), visionTool({ defaultApiVersion: apiVersion })],
})
