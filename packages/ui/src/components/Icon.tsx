import * as React from 'react'

/**
 * @calendax/ui — Icon
 *
 * A tiny set of Linear-flavoured glyphs used across modules. Icons are drawn
 * from a 16-unit viewBox and fill with `currentColor`, so the surrounding
 * CSS (e.g. a `.fs-folder` color rule) tints them. Decorative by default —
 * pass `ariaLabel` when the icon carries meaning on its own.
 *
 *   import { Icon } from '@calendax/ui'
 *   <Icon name="folder" />       // indigo via .fs-folder { color: ... }
 *   <Icon name="file" size={18} />
 *   <Icon name="markdown" ariaLabel="Markdown document" />
 */

export type IconName = 'folder' | 'file' | 'markdown'

export interface IconProps {
  /** Which glyph to render. */
  name: IconName
  /** Pixel width/height of the rendered box (scaled from the 16-unit viewBox). */
  size?: number
  className?: string
  /** When set, the icon is exposed to assistive tech with this label. */
  ariaLabel?: string
}

const ICONS: Record<IconName, React.ReactNode> = {
  // A folder: a small top tab above a body. Clear folder silhouette.
  folder: (
    <>
      <path d="M2.5 2.5h3v2.5h-3z" />
      <path d="M3 5h10v9h-10z" />
    </>
  ),
  // A document/file: a page with short text lines fading toward the bottom.
  file: (
    <>
      <path d="M2.5 3h11v10h-11z" />
      <path d="M4.5 7h3v1h-3z" />
      <path d="M4.5 9h4.5v1h-4.5z" />
      <path d="M4.5 11h3v1h-3z" />
    </>
  ),
  // Markdown: a document with a dog-eared corner + a text line, so it reads
  // as a special file alongside the plain `file` glyph.
  markdown: (
    <>
      <path d="M2.5 3h11v10h-11z" />
      <path d="M4.5 7h3v1h-3z" />
      <path d="M4.5 9h5v1h-5z" />
      <path d="M11 12.5l2.5 1.5l1 -2.5z" />
    </>
  ),
}

export function Icon({ name, size = 16, className, ariaLabel }: IconProps): React.ReactElement {
  const decorative = ariaLabel === undefined
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={ariaLabel}
    >
      {ICONS[name]}
    </svg>
  )
}