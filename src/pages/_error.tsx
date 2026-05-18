import React from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'

function Error({ statusCode }: { statusCode?: number }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">
          {statusCode ? `Error ${statusCode}` : 'An error occurred'}
        </h1>
        <p className="text-muted-foreground mb-6">
          {statusCode === 404 ? 'Page not found' : 'Something went wrong'}
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md no-underline hover:bg-primary/90 transition-colors"
        >
          Go back home
        </Link>
      </div>
    </div>
  )
}

Error.getInitialProps = async (contextData: { res?: { statusCode: number }; err?: { statusCode: number } }) => {
  // Capture error on Sentry
  await Sentry.captureUnderscoreErrorException(contextData as any)
  
  // Get status code
  const statusCode = contextData.res 
    ? contextData.res.statusCode 
    : contextData.err 
    ? contextData.err.statusCode 
    : 404
    
  return { statusCode }
}

export default Error
