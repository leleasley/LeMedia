/**
 * Standalone layout — no sidebar, no top nav.
 * Used for full-viewport experiences like the watch party room.
 */
export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
