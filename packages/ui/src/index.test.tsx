import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import {
  avatarColor,
  shadeFromSeed,
  tokens,
  preferMotion,
} from './index.js'
import { Button } from './components/Button.js'
import { Kbd } from './components/Kbd.js'
import { Badge, Avatar } from './components/Badge.js'
import { Card } from './components/Card.js'
import { Separator } from './components/Separator.js'
import { Spinner, Skeleton } from './components/Spinner.js'
import { Switch } from './components/Switch.js'
import { Checkbox } from './components/Checkbox.js'
import { Field } from './components/Field.js'
import { TextField } from './components/TextField.js'
import { Tooltip } from './components/Tooltip.js'
import { Menu, MenuTrigger, MenuContent, MenuItem } from './components/Menu.js'
import { Dialog } from './components/Dialog.js'
import { CommandMenu } from './components/CommandMenu.js'
import { Sidebar } from './components/Sidebar.js'
import { Icon } from './components/Icon.js'

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node as React.ReactElement<unknown>)
}

describe('@calendax/ui tokens', () => {
  it('has the canonical Linear indigo-violet accent', () => {
    expect(tokens.accent[500]).toBe('#6366f1')
  })

  it('generates a stable avatar color for a seed', () => {
    expect(avatarColor('u_1')).toBe(avatarColor('u_1'))
    expect(Object.values(tokens.accent)).toContain(avatarColor('u_1'))
  })

  it('keeps hairline borders thin on both themes', () => {
    expect(tokens.light.border).toBe('#e4e4e7')
    expect(tokens.dark.border).toBe('#26262a')
  })

  it('dark theme uses near-black surfaces, light uses crisp white', () => {
    expect(tokens.dark.background).toBe('#0a0a0b')
    expect(tokens.light.surface).toBe('#ffffff')
    expect(tokens.dark.text).toBe('#f4f4f5')
  })

  it('uses Inter for text and JetBrains Mono for identifiers', () => {
    expect(tokens.typography.fontFamily).toContain('Inter')
    expect(tokens.typography.fontMono).toContain('JetBrains Mono')
  })

  it('keeps motion in the 120–180ms Linear band and clamps requests', () => {
    expect(tokens.motion.fast).toBe(120)
    expect(tokens.motion.slow).toBe(180)
    expect(tokens.motion.base).toBe(150)
    expect(preferMotion(0)).toBe(120)
    expect(preferMotion(1000)).toBe(180)
    expect(preferMotion(150)).toBe(150)
  })

  it('defines a hairline (1px) border token set and full spacing ramp', () => {
    expect(tokens.spacing[2]).toBe(8)
    expect(tokens.spacing[96]).toBe(384)
    expect(tokens.borderRadius.md).toBe(10)
  })

  it('derives deterministic non-grey avatar shades', () => {
    expect(shadeFromSeed('a')).toBe(shadeFromSeed('a'))
    expect(shadeFromSeed('a')).not.toBe(shadeFromSeed('b'))
  })
})

describe('@calendax/ui primitives (SSR-safe)', () => {
  it('Button renders a button with type + focus class', () => {
    const html = render(<Button>Save</Button>)
    expect(html).toContain('type="button"')
    expect(html).toContain('cx-focus-visible')
    expect(html).toContain('>Save</button>')
  })

  it('Button primary variant uses the accent surface', () => {
    const html = render(<Button variant="primary">Go</Button>)
    expect(html).toContain('var(--cx-accent-600)')
  })

  it('Button loading is disabled and announces busy', () => {
    const html = render(<Button loading>Save</Button>)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
  })

  it('Kbd renders a JetBrains Mono keycap', () => {
    const html = render(<Kbd>⌘K</Kbd>)
    expect(html).toMatch(/<kbd[^>]*class="[^"]*cx-kbd/)
  })

  it('Badge mono renders with the mono font', () => {
    const html = render(<Badge mono>XER-74</Badge>)
    expect(html).toContain('cx-font-mono')
  })

  it('Avatar renders initials, is an image labelled by the person', () => {
    const html = render(<Avatar label="Ada Lovelace" />)
    expect(html).toContain('AL')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Ada Lovelace"')
  })

  it('Card renders children inside a surface panel', () => {
    const html = render(<Card>Hello</Card>)
    expect(html).toContain('var(--cx-surface)')
    expect(html).toContain('Hello')
  })

  it('Separator is a themed hairline divider', () => {
    const html = render(<Separator />)
    expect(html).toContain('role="separator"')
    expect(html).toContain('var(--cx-border)')
  })

  it('Spinner is a busy indicator', () => {
    const html = render(<Spinner />)
    expect(html).toContain('role="status"')
    expect(html).toContain('cx-spin')
  })

  it('Skeleton is aria-hidden placeholder', () => {
    const html = render(<Skeleton data-x />)
    expect(html).toContain('aria-hidden="true"')
  })

  it('Switch is a switch with checked state', () => {
    expect(render(<Switch />)).toContain('role="switch"')
    expect(render(<Switch defaultChecked />)).toContain('aria-checked="true"')
  })

  it('Checkbox reflects checked state on the hidden input', () => {
    const html = render(<Checkbox defaultChecked />)
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
  })

  it('Field wires the label htmlFor and hint', () => {
    const html = render(
      <Field label="Title" htmlFor="t" hint="Required" required>
        <input id="t" />
      </Field>,
    )
    expect(html).toContain('for="t"')
    expect(html).toContain('*')
    expect(html).toContain('Required')
  })

  it('TextField supports a mono (identifier) intent', () => {
    const html = render(<TextField mono defaultValue="abc-123" />)
    expect(html).toContain('var(--cx-font-mono)')
  })

  it('Icon renders a decorative currentColor svg by name', () => {
    const html = render(<Icon name="folder" />)
    expect(html).toContain('<svg')
    expect(html).toContain('fill="currentColor"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('<g')
  })

  it('Icon folder/file/markdown render distinct path sets', () => {
    const folder = render(<Icon name="folder" size={18} />)
    const file = render(<Icon name="file" size={18} />)
    const md = render(<Icon name="markdown" size={18} />)
    expect(folder).toMatch(/width="18"/)
    // Each glyph is unique: bodies differ (folder lacks the page rect).
    expect(folder).not.toBe(file)
    expect(file).not.toBe(md)
    expect(folder).not.toBe(md)
  })

  it('Icon with ariaLabel is a labelled image for assistive tech', () => {
    const html = render(<Icon name="file" ariaLabel="Markdown document" />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Markdown document"')
    expect(html).not.toContain('aria-hidden=')
  })
})

describe('@calendax/ui interactive composites', () => {
  it('Tooltip wires accessibility ids without a portal', () => {
    const html = render(
      <Tooltip label="New document">
        <button>+</button>
      </Tooltip>,
    )
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('aria-describedby')
  })

  it('Menu (closed) renders only the trigger', () => {
    const html = render(
      <Menu>
        <MenuTrigger>
          <button>⋮</button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem label="Rename" />
          <MenuItem label="Delete" destructive />
        </MenuContent>
      </Menu>,
    )
    expect(html).toContain('>⋮</button>')
    expect(html).not.toContain('role="menu"')
  })

  it('Menu (open) renders items and honours destructive tone', () => {
    const html = render(
      <Menu defaultOpen>
        <MenuTrigger>
          <button>⋮</button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem label="Rename" />
          <MenuItem label="Delete" destructive />
        </MenuContent>
      </Menu>,
    )
    expect(html).toContain('role="menu"')
    expect(html).toContain('data-label="Rename"')
    expect(html).toContain('data-label="Delete"')
    expect(html).toContain('var(--cx-danger)')
  })

  it('Menu side="top" anchors the content above the trigger', () => {
    const html = render(
      <Menu defaultOpen align="end" side="top">
        <MenuTrigger>
          <button>account</button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem label="Settings" />
        </MenuContent>
      </Menu>,
    )
    expect(html).toContain('bottom:calc(100% + 4px)')
    expect(html).toContain('right:0')
    expect(html).not.toContain('top:calc(100% + 4px)')
    expect(html).toContain('data-label="Settings"')
  })

  it('Dialog and CommandMenu render nothing on the server', () => {
    expect(render(<Dialog open title="Edit" />)).toBe('')
    expect(render(<CommandMenu open items={[]} />)).toBe('')
  })

  it('Sidebar renders a labelled aside with brand + content', () => {
    const html = render(
      <Sidebar ariaLabel="Main navigation" asideId="app-nav" brand="Xeroneon Cloud">
        <nav>Files</nav>
      </Sidebar>,
    )
    expect(html).toContain('aria-label="Main navigation"')
    expect(html).toContain('id="app-nav"')
    expect(html).toContain('Xeroneon Cloud')
    expect(html).toContain('cx-sidebar__topbar')
  })

  it('Sidebar is aria-hidden when the mobile drawer is closed', () => {
    const html = render(
      <Sidebar ariaLabel="Main navigation" brand="X">
        <nav>Home</nav>
      </Sidebar>,
    )
    // Server render: not a rail (breakpoint unknown), drawer closed → hidden.
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('data-cx-sidebar-rail')
    expect(html).not.toContain('cx-sidebar__backdrop')
  })

  it('Sidebar open renders a backdrop overlay', () => {
    const html = render(
      <Sidebar defaultOpen ariaLabel="Main navigation" brand="X">
        <nav>Home</nav>
      </Sidebar>,
    )
    expect(html).toContain('cx-sidebar__backdrop')
    expect(html).toContain('data-cx-sidebar-open="true"')
  })
})