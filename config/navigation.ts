import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  House,
  MessageCircle,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { MessageKey } from '@/i18n/config'

export interface NavItem {
  href: string
  labelKey: MessageKey
  icon: LucideIcon
}

/** Main product areas. Shown in the bottom bar (mobile), rail (tablet) and sidebar (desktop). */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/', labelKey: 'nav.home', icon: House },
  { href: '/chats', labelKey: 'nav.chats', icon: MessageCircle },
  { href: '/study', labelKey: 'nav.study', icon: BookOpenCheck },
  { href: '/planner', labelKey: 'nav.planner', icon: CalendarDays },
  { href: '/community', labelKey: 'nav.community', icon: Users },
]

/** Account-level areas. Shown in the mobile top bar and at the foot of the sidebar. */
export const ACCOUNT_NAV: NavItem[] = [
  { href: '/notifications', labelKey: 'nav.notifications', icon: Bell },
  { href: '/profile', labelKey: 'nav.profile', icon: UserRound },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
]

export function isActivePath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}
