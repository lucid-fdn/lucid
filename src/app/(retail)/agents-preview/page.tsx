import React from 'react'

import { RetailHero } from '@/components/retail/landing/hero'
import { RetailPricingStrip } from '@/components/retail/landing/pricing-strip'
import { RetailTemplateGallery } from '@/components/retail/landing/template-gallery'

export default function RetailLandingPage() {
  return (
    <main>
      <RetailHero />
      <RetailTemplateGallery />
      <RetailPricingStrip />
    </main>
  )
}
