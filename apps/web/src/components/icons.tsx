import type { SVGProps } from 'react'

/**
 * The site's icons, in one file.
 *
 * They were scattered as inline paths across the header, the footer, the cards
 * and the share row, which meant four different stroke weights, three viewBox
 * conventions and a brand mark that existed twice in slightly different shapes.
 * An icon set is a typeface: it only reads as one if it is drawn once.
 *
 * Every icon is `aria-hidden` and sized by `currentColor` and `1em`, so it
 * takes the colour and size of the text it sits in and never announces itself —
 * the accessible name belongs to the control, which knows what it does.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'> & {
  /** Overrides the default `1em` square. */
  size?: number | string
}

function Icon({ size = '1em', ...props }: IconProps & { children: React.ReactNode }) {
  const { children, ...rest } = props
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Filled marks — brand logos are drawn as solid shapes, not strokes. */
function Solid({ size = '1em', ...props }: IconProps & { children: React.ReactNode }) {
  const { children, ...rest } = props
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.9-3.9" />
    </Icon>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}

/** Points the way a section heading links. Flipped by CSS, never by a second icon. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5l7 7-7 7" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 9l7 7 7-7" />
    </Icon>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M8 5.5v13l11-6.5z" />
    </Solid>
  )
}

export function CameraIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M9 3l-1.8 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z" />
    </Solid>
  )
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13a4 4 0 0 0 5.7.4l3-3a4 4 0 1 0-5.7-5.7L11.6 6" />
      <path d="M14 11a4 4 0 0 0-5.7-.4l-3 3a4 4 0 1 0 5.7 5.7L12.4 18" />
    </Icon>
  )
}

export function FacebookIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z" />
    </Solid>
  )
}

export function XIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.3-5.7L6.4 21H3.3l7-8L2.5 3h6.2l3.9 5.2zm-1.1 16h1.7L7.7 4.7H5.9z" />
    </Solid>
  )
}

export function YouTubeIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.5 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.3.5-2.5.5-3.8s-.2-2.5-.5-3.8zM10 15V9l5.2 3z" />
    </Solid>
  )
}

export function InstagramIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9s.7.8.9 1.4c.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4s-.8.7-1.4.9c-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9s-.7-.8-.9-1.4c-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4s.8-.7 1.4-.9c.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11.1a1.5 1.5 0 1 1-1.6-1.6 1.5 1.5 0 0 1 1.6 1.6z" />
    </Solid>
  )
}

export function LinkedInIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M6.9 21H3.6V9.3h3.3zM5.2 7.9a1.9 1.9 0 1 1 1.9-1.9 1.9 1.9 0 0 1-1.9 1.9zM21 21h-3.3v-5.7c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.8H10.3V9.3h3.1v1.6h.1a3.5 3.5 0 0 1 3.1-1.7c3.3 0 3.9 2.2 3.9 5z" />
    </Solid>
  )
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4s-1.2.2-3.4-.7a12 12 0 0 1-5-4.4c-.4-.6-1-1.6-1-3a3.3 3.3 0 0 1 1-2.4.9.9 0 0 1 .7-.3h.5c.2 0 .4 0 .6.5l.9 2c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.2.3 0 .6a9 9 0 0 0 1.6 2 8 8 0 0 0 2.3 1.4c.3.2.5.1.6 0l1-1.1c.2-.2.3-.2.6-.1l2 1c.3.1.4.2.5.3a2 2 0 0 1-.2 1.1z" />
    </Solid>
  )
}

/** Every brand mark the site knows, so a platform string resolves in one place. */
export const SOCIAL_ICONS = {
  facebook: FacebookIcon,
  x: XIcon,
  youtube: YouTubeIcon,
  instagram: InstagramIcon,
  linkedin: LinkedInIcon,
  whatsapp: WhatsAppIcon,
} as const

export type SocialPlatform = keyof typeof SOCIAL_ICONS
