export interface Author {
  _id: string
  name: string
  slug: {
    current: string
  }
  bio?: string
  avatar?: {
    asset: {
      _ref: string
    }
    alt?: string
  }
  socialLinks?: {
    twitter?: string
    linkedin?: string
    github?: string
  }
}

export interface Category {
  _id: string
  title: string
  slug: {
    current: string
  }
  description?: string
  color?: string
}

export interface Post {
  _id: string
  title: string
  slug: {
    current: string
  }
  excerpt: string
  content: Array<{
    _type: string
    _key: string
    [key: string]: unknown
  }> // Portable Text content
  mainImage?: {
    asset: {
      _ref: string
    }
    alt?: string
  }
  author: Author
  categories?: Category[]
  publishedAt: string
  featured?: boolean
}
