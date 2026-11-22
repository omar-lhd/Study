import {
  BellRing,
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Camera,
  Flag,
  GraduationCap,
  HandHelping,
  Languages,
  Lock,
  Moon,
  Palette,
  Smartphone,
  Sparkles,
  Swords,
  UserCog,
  UserRoundCheck,
  Users,
  UsersRound,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
import type { MessageKey } from '@/i18n/config'

export interface SectionDef {
  slug: string
  icon: LucideIcon
  titleKey: MessageKey
  descriptionKey: MessageKey
  /** Only sections marked implemented render real behaviour. Everything else is a placeholder. */
  implemented?: boolean
}

export const PLANNER_SECTIONS: SectionDef[] = [
  { slug: 'subjects', icon: GraduationCap, titleKey: 'planner.subjects', descriptionKey: 'planner.subjects.description' },
  { slug: 'lessons', icon: BookOpen, titleKey: 'planner.lessons', descriptionKey: 'planner.lessons.description' },
  { slug: 'tasks', icon: CalendarCheck, titleKey: 'planner.tasks', descriptionKey: 'planner.tasks.description' },
  { slug: 'exams', icon: Flag, titleKey: 'planner.exams', descriptionKey: 'planner.exams.description' },
  { slug: 'schedule', icon: CalendarClock, titleKey: 'planner.schedule', descriptionKey: 'planner.schedule.description' },
  { slug: 'calendar', icon: CalendarDays, titleKey: 'planner.calendar', descriptionKey: 'planner.calendar.description' },
  { slug: 'goals', icon: BookMarked, titleKey: 'planner.goals', descriptionKey: 'planner.goals.description' },
]

export const COMMUNITY_SECTIONS: SectionDef[] = [
  { slug: 'friends', icon: UserRoundCheck, titleKey: 'community.friends', descriptionKey: 'community.friends.description' },
  { slug: 'stories', icon: Camera, titleKey: 'community.stories', descriptionKey: 'community.stories.description' },
  { slug: 'activity', icon: Users, titleKey: 'community.activity', descriptionKey: 'community.activity.description' },
  { slug: 'challenges', icon: Swords, titleKey: 'community.challenges', descriptionKey: 'community.challenges.description' },
  { slug: 'help', icon: HandHelping, titleKey: 'community.help', descriptionKey: 'community.help.description' },
]

export const SETTINGS_SECTIONS: SectionDef[] = [
  { slug: 'language', icon: Languages, titleKey: 'settings.language', descriptionKey: 'settings.language.description', implemented: true },
  { slug: 'appearance', icon: Palette, titleKey: 'settings.appearance', descriptionKey: 'settings.appearance.description', implemented: true },
  { slug: 'account', icon: UserCog, titleKey: 'settings.account', descriptionKey: 'settings.account.description' },
  { slug: 'privacy', icon: Lock, titleKey: 'settings.privacy', descriptionKey: 'settings.privacy.description' },
  { slug: 'notifications', icon: BellRing, titleKey: 'settings.notifications', descriptionKey: 'settings.notifications.description' },
  { slug: 'sound', icon: Volume2, titleKey: 'settings.sound', descriptionKey: 'settings.sound.description' },
  { slug: 'devices', icon: Smartphone, titleKey: 'settings.devices', descriptionKey: 'settings.devices.description' },
  { slug: 'focus', icon: Moon, titleKey: 'settings.focus', descriptionKey: 'settings.focus.description' },
  { slug: 'groups', icon: UsersRound, titleKey: 'settings.groups', descriptionKey: 'settings.groups.description' },
]

export const PROFILE_SECTIONS: SectionDef[] = [
  { slug: 'identity', icon: UserCog, titleKey: 'profile.section.identity', descriptionKey: 'profile.section.identity.description' },
  { slug: 'academic', icon: GraduationCap, titleKey: 'profile.section.academic', descriptionKey: 'profile.section.academic.description' },
  { slug: 'xp', icon: Sparkles, titleKey: 'profile.section.xp', descriptionKey: 'profile.section.xp.description' },
  { slug: 'achievements', icon: Flag, titleKey: 'profile.section.achievements', descriptionKey: 'profile.section.achievements.description' },
  { slug: 'bonds', icon: UsersRound, titleKey: 'profile.section.bonds', descriptionKey: 'profile.section.bonds.description' },
  { slug: 'privacy', icon: Lock, titleKey: 'profile.section.privacy', descriptionKey: 'profile.section.privacy.description' },
]
