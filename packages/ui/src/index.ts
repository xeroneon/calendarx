/**
 * @calendax/ui — Xeroneon Cloud design system (Linear look), Phase 0.3 (XER-74).
 *
 * Design tokens + core React components + light/dark themes, keyboard-first,
 * with 120–180ms motion. Shared by every module so the platform looks like one
 * product.
 *
 * Import the stylesheet once (e.g. in the root layout) to get the full theme +
 * component primitives:
 *
 *   import '@calendax/ui/tokens.css'
 */

// ── Design tokens ────────────────────────────────────────────────────────
export * from './tokens.js'

// ── Hooks ────────────────────────────────────────────────────────────────
export { useControllableState } from './hooks/useControllableState.js'
export { useHotkey } from './hooks/useHotkey.js'
export { useMediaQuery, usePrefersDark } from './hooks/useMediaQuery.js'
export { useListNavigation } from './hooks/useListNavigation.js'

// ── Primitives ───────────────────────────────────────────────────────────
export { Button } from './components/Button.js'
export type { ButtonProps } from './components/Button.js'
export { Icon } from './components/Icon.js'
export type { IconProps, IconName } from './components/Icon.js'
export { IconButton } from './components/IconButton.js'
export type { IconButtonProps } from './components/IconButton.js'
export { Kbd } from './components/Kbd.js'
export type { KbdProps } from './components/Kbd.js'
export { Badge, Avatar } from './components/Badge.js'
export type { BadgeProps, AvatarProps, BadgeTone } from './components/Badge.js'
export { TextField } from './components/TextField.js'
export type { TextFieldProps } from './components/TextField.js'
export { TextArea } from './components/TextArea.js'
export type { TextAreaProps } from './components/TextArea.js'
export { Select } from './components/Select.js'
export type { SelectProps } from './components/Select.js'
export { Checkbox } from './components/Checkbox.js'
export type { CheckboxProps } from './components/Checkbox.js'
export { Switch } from './components/Switch.js'
export type { SwitchProps } from './components/Switch.js'
export { Card, CardHeader, CardBody, CardFooter } from './components/Card.js'
export type { CardProps, CardHeaderProps, CardFooterProps } from './components/Card.js'
export { Separator } from './components/Separator.js'
export type { SeparatorProps } from './components/Separator.js'
export { Spinner, Skeleton } from './components/Spinner.js'
export type { SpinnerProps, SkeletonProps } from './components/Spinner.js'
export { Field } from './components/Field.js'
export type { FieldProps } from './components/Field.js'
export { Tooltip } from './components/Tooltip.js'
export type { TooltipProps } from './components/Tooltip.js'
export { Dialog, useDialog } from './components/Dialog.js'
export type { DialogProps } from './components/Dialog.js'
export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
} from './components/Menu.js'
export type { MenuProps, MenuItemProps } from './components/Menu.js'
export { CommandMenu, CommandPalette } from './components/CommandMenu.js'
export type { CommandMenuProps, CommandItem } from './components/CommandMenu.js'
export { Sidebar } from './components/Sidebar.js'
export type { SidebarProps } from './components/Sidebar.js'