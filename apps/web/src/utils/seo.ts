interface SeoInput {
  title: string
  description?: string
  image?: string
}

export const seo = ({ title, description, image }: SeoInput) => {
  const tags = [
    { title },
    { name: 'description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'og:type', content: 'website' },
    { name: 'og:title', content: title },
    { name: 'og:description', content: description },
    ...(image
      ? [{ name: 'twitter:image', content: image }, { name: 'og:image', content: image }]
      : []),
  ]
  return tags
}