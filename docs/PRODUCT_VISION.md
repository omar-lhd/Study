# Product Vision

This file is the complete vision. It is NOT a status report. Deferring a feature does not remove it from here. See `IMPLEMENTATION_STATUS.md` for what exists.

## Concept

A private social learning platform for a small group of friends (about 10 initially; never hardcode a member limit). It should make students want to return because their friends, progress and shared study activity are there, while the app itself stays focused and never becomes a distraction. Scope is a Broad MVP delivered through packages A to E.

## Major areas

1. **Home / Today**: greeting and date, today's progress, upcoming and overdue tasks, current and upcoming sessions, quick-start actions, group activity, important notifications, goals.
2. **Chats**: private and group conversations, history, replies and forwarding, reactions, typing indicators, online and last-seen (privacy permitting), pinned messages, search, image/file/voice attachments.
3. **Study**: private sessions, scheduled group sessions, open rooms, current/upcoming sessions, history, goals and attendance. A real collaborative workspace, not a chat with a timer.
4. **Planner / Academic**: subjects, stages and sections, lessons and chapters, tasks and homework, exams and deadlines, weekly schedule, calendar, goals and reminders.
5. **Social / Community**: friends, stories, group activity, study partners, teams and challenges, Homework Help.
6. **Profile**: avatar or customizable character, display name and username, personal and academic info, subjects and progress, XP and levels, achievements, friends and Study Bonds, streaks, privacy.
7. **Notifications**: private/group messages, study-room activity, calls, stories, study reminders, achievements, prayer.
8. **Settings**: account/profile, privacy, language, appearance, notification preferences, sound and ringtones, connected devices, focus and Do Not Disturb, group preferences.

## Agreed study-session governance

- Any group member can create a session.
- The creator and moderators can edit or cancel it.
- All participants can contribute and interact.
- Any present participant can request a pause.
- Pause approval uses the majority of participants currently present.
- Duplicate votes must be prevented.
- The creator leaving must not destroy the session.
- Participants have independent microphone and camera preferences.

## Prayer-aware sessions

- Five daily prayer times; manual city selection or location with permission.
- Group-wide prayer-time configuration; reminders with customizable sounds.
- Automatic shared-timer pause when the configured prayer time begins, a visible group notification, and a request-to-resume flow.
- Paused time is excluded from study duration.
- Honest limitation: a web app cannot forcibly lock the device screen or guarantee an exact three-second blocking system notification. Use platform-supported behavior when implemented.

## Real-time and multi-device

Future: real-time messaging, presence and typing, live study-room membership, shared timer, live attendance, shared notes and session state, multi-device access, reconnection after network loss. The architecture must not be local-only.

## Whiteboard and media

Collaborative whiteboard, screen sharing, camera/video presentation and participant video layout are separate capabilities. A whiteboard is not screen sharing.

## Gamification integrity

XP, streaks, levels and rewards come from validated events, never solely from client claims. Duplicate reward events (including across devices) must be prevented. XP and achievement logic stays separate from presentation.

## Privacy and security

Private academic information is not exposed to friends or groups by default; users control sharing. Backend operations rely on database authorization and Row Level Security, never on hiding UI.

## Delivery target

Final deliverable is an Android APK (Capacitor wrapper around the web app) with PWA compatibility. Custom SMTP and a purchased domain are explicitly deferred.
