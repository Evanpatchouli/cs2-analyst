import type { ReactNode } from 'react';

function WindowIcon({ children }: { children: ReactNode }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">{children}</svg>;
}
export const MinimizeIcon = () => <WindowIcon><path d="M3 8.5h10" /></WindowIcon>;
export const MaximizeIcon = () => <WindowIcon><rect x="3.5" y="3.5" width="9" height="9" /></WindowIcon>;
export const RestoreIcon = () => <WindowIcon><path d="M5.5 5.5v-3h8v8h-3" /><rect x="2.5" y="5.5" width="8" height="8" /></WindowIcon>;
export const CloseIcon = () => <WindowIcon><path d="m3.5 3.5 9 9m0-9-9 9" /></WindowIcon>;
