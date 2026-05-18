import { getProfileByHandle } from '@/ports/db'
import { notFound } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Globe, Github, Twitter, Linkedin } from 'lucide-react'

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await getProfileByHandle(handle)
  
  if (!profile) {
    return {
      title: 'User Not Found',
    }
  }

  return {
    title: `${profile.name} (@${profile.handle})`,
    description: profile.bio || `View ${profile.name}'s profile`,
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const profile = await getProfileByHandle(handle)

  if (!profile) {
    notFound()
  }

  // Check if profile is public (feature flag + user setting)
  const ENABLE_PUBLIC_PROFILES = true // Feature flag - set to false to disable
  const isProfilePublic = profile.profile_public !== false // Default to true

  if (!ENABLE_PUBLIC_PROFILES || !isProfilePublic) {
    return (
      <div className="container max-w-2xl py-24 text-center">
        <h1 className="text-2xl font-bold">Profile Not Available</h1>
        <p className="text-muted-foreground mt-2">
          This profile is private or public profiles are disabled.
        </p>
      </div>
    )
  }

  // Get initials for avatar fallback
  const initials = profile.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || '?'

  return (
    <div className="container max-w-4xl py-12">
      {/* Profile Header */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <Avatar className="h-32 w-32">
                {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.name || ''} />}
                <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
              </Avatar>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold">{profile.name}</h1>
              <p className="text-muted-foreground text-lg mt-1">@{profile.handle}</p>

              {profile.bio && (
                <p className="mt-4 text-foreground">{profile.bio}</p>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-3 mt-4">
                {profile.homepage && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={profile.homepage} target="_blank" rel="noopener noreferrer">
                      <Globe className="h-4 w-4 mr-2" />
                      Website
                    </a>
                  </Button>
                )}
                {profile.github_username && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://github.com/${profile.github_username}`} target="_blank" rel="noopener noreferrer">
                      <Github className="h-4 w-4 mr-2" />
                      GitHub
                    </a>
                  </Button>
                )}
                {profile.twitter_username && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://twitter.com/${profile.twitter_username}`} target="_blank" rel="noopener noreferrer">
                      <Twitter className="h-4 w-4 mr-2" />
                      Twitter
                    </a>
                  </Button>
                )}
                {profile.linkedin_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer">
                      <Linkedin className="h-4 w-4 mr-2" />
                      LinkedIn
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interests */}
      {profile.interests && profile.interests.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Interests</h2>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest: string) => (
                <Badge key={interest} variant="secondary">
                  {interest}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
