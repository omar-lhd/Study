import type { SessionMode, SessionVisibility } from './types'

export const LIMITS = {
  titleMin: 2,
  titleMax: 80,
  subjectMax: 40,
  descriptionMax: 500,
  goalMax: 120,
  goalsMax: 10,
  durationMin: 5,
  durationMax: 480,
  notesMax: 5000,
} as const

export type FieldErrorCode =
  | 'titleRequired'
  | 'titleShort'
  | 'titleLong'
  | 'subjectLong'
  | 'descriptionLong'
  | 'durationInvalid'
  | 'durationRange'
  | 'dateRequired'
  | 'timeRequired'
  | 'datePast'
  | 'goalsTooMany'
  | 'goalLong'

export type FieldName = 'title' | 'subject' | 'description' | 'duration' | 'date' | 'time' | 'goals'

export interface SessionFormValues {
  title: string
  subject: string
  description: string
  duration: string
  mode: SessionMode
  date: string
  time: string
  visibility: SessionVisibility
  goals: string[]
}

export type FormErrors = Partial<Record<FieldName, FieldErrorCode>>

/** Combines local date (YYYY-MM-DD) and time (HH:mm) into epoch ms, or null if invalid. */
export function toTimestamp(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return null
  const [, year, month, day] = dateMatch.map(Number) as [number, number, number, number]
  const [, hours, minutes] = timeMatch.map(Number) as [number, number, number]
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hours ||
    result.getMinutes() !== minutes
  ) {
    return null
  }
  return result.getTime()
}

export function validateSessionForm(values: SessionFormValues, now: number): FormErrors {
  const errors: FormErrors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'titleRequired'
  else if (title.length < LIMITS.titleMin) errors.title = 'titleShort'
  else if (title.length > LIMITS.titleMax) errors.title = 'titleLong'

  if (values.subject.trim().length > LIMITS.subjectMax) errors.subject = 'subjectLong'
  if (values.description.trim().length > LIMITS.descriptionMax) errors.description = 'descriptionLong'

  const duration = Number(values.duration)
  if (!values.duration.trim() || !Number.isInteger(duration)) errors.duration = 'durationInvalid'
  else if (duration < LIMITS.durationMin || duration > LIMITS.durationMax) errors.duration = 'durationRange'

  if (values.mode === 'scheduled') {
    if (!values.date) errors.date = 'dateRequired'
    if (!values.time) errors.time = 'timeRequired'
    if (values.date && values.time) {
      const timestamp = toTimestamp(values.date, values.time)
      if (timestamp === null) errors.date = 'dateRequired'
      else if (timestamp < now) errors.time = 'datePast'
    }
  }

  const goals = values.goals.map((goal) => goal.trim()).filter(Boolean)
  if (goals.length > LIMITS.goalsMax) errors.goals = 'goalsTooMany'
  else if (goals.some((goal) => goal.length > LIMITS.goalMax)) errors.goals = 'goalLong'

  return errors
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0
}
