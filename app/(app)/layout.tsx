import { AppShell } from '@/components/layout/app-shell'
import { AppAuthGate } from '@/features/auth/app-auth-gate'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppAuthGate><AppShell>{children}</AppShell></AppAuthGate>
}
