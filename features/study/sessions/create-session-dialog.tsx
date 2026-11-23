'use client'

import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/field'
import { OptionGroup } from '@/components/ui/option-group'
import { useT } from '@/components/providers/preferences-provider'
import {
  LIMITS,
  hasErrors,
  toTimestamp,
  validateSessionForm,
  type FieldName,
  type FormErrors,
  type SessionFormValues,
} from '@/lib/sessions/validation'
import type { SessionMode, SessionVisibility, StudySession } from '@/lib/sessions/types'
import { cn } from '@/lib/utils'
import { sessionsStore } from './use-sessions'

const DURATION_PRESETS = [25, 45, 60, 90]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function defaultValues(): SessionFormValues {
  const soon = new Date(Date.now() + 60 * 60_000)
  return {
    title: '',
    subject: '',
    description: '',
    duration: '45',
    mode: 'instant',
    date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
    time: `${pad(soon.getHours())}:00`,
    visibility: 'private',
    goals: [],
  }
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null
  return (
    <p id={id} className="mt-1.5 text-sm text-danger">
      {error}
    </p>
  )
}

interface FormProps {
  onClose: () => void
  onCreated: (session: StudySession) => void
}

function CreateSessionForm({ onClose, onCreated }: FormProps) {
  const t = useT()
  const uid = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<SessionFormValues>(defaultValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [goalDraft, setGoalDraft] = useState('')

  const fieldId = (name: FieldName) => `${uid}-${name}`
  const errorId = (name: FieldName) => `${uid}-${name}-error`
  const errorText = (name: FieldName) => {
    const code = errors[name]
    return code ? t(`sessions.fieldError.${code}`) : undefined
  }
  const aria = (name: FieldName) => ({
    id: fieldId(name),
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? errorId(name) : undefined,
  })

  const update = <K extends keyof SessionFormValues>(key: K, value: SessionFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const addGoal = () => {
    const text = goalDraft.trim()
    if (!text) return
    if (values.goals.length >= LIMITS.goalsMax) {
      setErrors((current) => ({ ...current, goals: 'goalsTooMany' }))
      return
    }
    if (text.length > LIMITS.goalMax) {
      setErrors((current) => ({ ...current, goals: 'goalLong' }))
      return
    }
    setErrors((current) => ({ ...current, goals: undefined }))
    update('goals', [...values.goals, text])
    setGoalDraft('')
  }

  const onGoalKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    addGoal()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const pendingGoal = goalDraft.trim()
    const next = pendingGoal ? { ...values, goals: [...values.goals, pendingGoal] } : values
    const found = validateSessionForm(next, Date.now())
    setErrors(found)
    if (hasErrors(found)) {
      const first = (['title', 'subject', 'description', 'duration', 'date', 'time', 'goals'] as const).find(
        (name) => found[name],
      )
      if (first) formRef.current?.querySelector<HTMLElement>(`[id="${fieldId(first)}"]`)?.focus()
      return
    }

    const session = sessionsStore.create({
      title: next.title.trim(),
      subject: next.subject.trim(),
      description: next.description.trim(),
      durationMinutes: Number(next.duration),
      visibility: next.visibility,
      mode: next.mode,
      scheduledFor: next.mode === 'scheduled' ? toTimestamp(next.date, next.time) : null,
      goals: next.goals.map((goal) => goal.trim()).filter(Boolean),
    })
    toast.success(t(next.mode === 'instant' ? 'sessions.form.toast.instant' : 'sessions.form.toast.scheduled'))
    onCreated(session)
    onClose()
  }

  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  })()

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
      {hasErrors(errors) ? (
        <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
          {t('sessions.form.invalid')}
        </p>
      ) : null}

      <div>
        <Label>{t('sessions.form.mode')}</Label>
        <OptionGroup<SessionMode>
          label={t('sessions.form.mode')}
          value={values.mode}
          onChange={(mode) => update('mode', mode)}
          options={[
            { value: 'instant', label: t('sessions.form.mode.instant') },
            { value: 'scheduled', label: t('sessions.form.mode.scheduled') },
          ]}
        />
      </div>

      <div>
        <Label htmlFor={fieldId('title')}>{t('sessions.form.field.title')}</Label>
        <Input
          {...aria('title')}
          value={values.title}
          maxLength={LIMITS.titleMax + 20}
          placeholder={t('sessions.form.field.title.placeholder')}
          onChange={(event) => update('title', event.target.value)}
          autoComplete="off"
        />
        <FieldError id={errorId('title')} error={errorText('title')} />
      </div>

      <div>
        <Label htmlFor={fieldId('subject')}>{t('sessions.form.field.subject')}</Label>
        <Input
          {...aria('subject')}
          value={values.subject}
          placeholder={t('sessions.form.field.subject.placeholder')}
          onChange={(event) => update('subject', event.target.value)}
          autoComplete="off"
        />
        <FieldError id={errorId('subject')} error={errorText('subject')} />
      </div>

      <div>
        <Label htmlFor={fieldId('duration')}>{t('sessions.form.field.duration')}</Label>
        <Input
          {...aria('duration')}
          type="number"
          inputMode="numeric"
          dir="ltr"
          min={LIMITS.durationMin}
          max={LIMITS.durationMax}
          step={1}
          value={values.duration}
          onChange={(event) => update('duration', event.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {DURATION_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={values.duration === String(minutes)}
              onClick={() => update('duration', String(minutes))}
              className={cn(
                'h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
                values.duration === String(minutes)
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border-strong text-muted-foreground hover:text-foreground',
              )}
            >
              {minutes}
            </button>
          ))}
        </div>
        <FieldError id={errorId('duration')} error={errorText('duration')} />
      </div>

      {values.mode === 'scheduled' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={fieldId('date')}>{t('sessions.form.field.date')}</Label>
            <Input
              {...aria('date')}
              type="date"
              dir="ltr"
              min={today}
              value={values.date}
              onChange={(event) => update('date', event.target.value)}
            />
            <FieldError id={errorId('date')} error={errorText('date')} />
          </div>
          <div>
            <Label htmlFor={fieldId('time')}>{t('sessions.form.field.time')}</Label>
            <Input
              {...aria('time')}
              type="time"
              dir="ltr"
              value={values.time}
              onChange={(event) => update('time', event.target.value)}
            />
            <FieldError id={errorId('time')} error={errorText('time')} />
          </div>
        </div>
      ) : null}

      <div>
        <Label htmlFor={fieldId('description')}>{t('sessions.form.field.note')}</Label>
        <Textarea
          {...aria('description')}
          value={values.description}
          onChange={(event) => update('description', event.target.value)}
        />
        <FieldError id={errorId('description')} error={errorText('description')} />
      </div>

      <div>
        <Label htmlFor={fieldId('goals')}>{t('sessions.form.field.goals')}</Label>
        <div className="flex gap-2">
          <Input
            {...aria('goals')}
            value={goalDraft}
            placeholder={t('sessions.form.goals.placeholder')}
            onChange={(event) => setGoalDraft(event.target.value)}
            onKeyDown={onGoalKeyDown}
            autoComplete="off"
          />
          <Button variant="secondary" onClick={addGoal} aria-label={t('sessions.form.goals.add')}>
            <Plus aria-hidden="true" />
            <span className="hidden sm:inline">{t('sessions.form.goals.add')}</span>
          </Button>
        </div>
        <FieldError id={errorId('goals')} error={errorText('goals')} />
        {values.goals.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {values.goals.map((goal, index) => (
              <li
                key={`${goal}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"
              >
                <span dir="auto" className="min-w-0 break-words">
                  {goal}
                </span>
                <button
                  type="button"
                  aria-label={t('sessions.form.goals.remove', { goal })}
                  onClick={() => update('goals', values.goals.filter((_, i) => i !== index))}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <Label>{t('sessions.visibility.label')}</Label>
        <OptionGroup<SessionVisibility>
          label={t('sessions.visibility.label')}
          value={values.visibility}
          onChange={(visibility) => update('visibility', visibility)}
          options={[
            { value: 'private', label: t('sessions.visibility.private') },
            { value: 'friends', label: t('sessions.visibility.friends') },
            { value: 'open', label: t('sessions.visibility.open') },
          ]}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{t('sessions.visibility.note')}</p>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit">
          {t(values.mode === 'instant' ? 'sessions.form.submit.instant' : 'sessions.form.submit.scheduled')}
        </Button>
      </div>
    </form>
  )
}

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (session: StudySession) => void
  trigger?: ReactNode
}

export function CreateSessionDialog({ open, onOpenChange, onCreated, trigger }: DialogProps) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{t('sessions.form.title')}</DialogTitle>
        <DialogDescription>{t('sessions.form.description')}</DialogDescription>
        <CreateSessionForm onClose={() => onOpenChange(false)} onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  )
}
