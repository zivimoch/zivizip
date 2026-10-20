import { api } from './account';
import type { WorkspaceDB } from './storage';
export interface VisitorProfile {
  id: string;
  name: string;
  enabled: boolean;
}
export async function reportVisit(db: WorkspaceDB) {
  const profile = (await db.meta.get('visitor-profile'))?.value as
    | VisitorProfile
    | undefined;
  if (!profile?.enabled || !navigator.onLine) return;
  try {
    await api('/visits', 'POST', { id: profile.id, name: profile.name });
  } catch {
    /* Analytics never blocks local work. */
  }
}
export async function saveVisitor(
  db: WorkspaceDB,
  name: string,
  enabled: boolean,
) {
  const old = (await db.meta.get('visitor-profile'))?.value as
    | VisitorProfile
    | undefined;
  const profile = {
    id: old?.id || crypto.randomUUID(),
    name: name.trim().slice(0, 80),
    enabled,
  };
  if (!enabled && old?.enabled)
    await api('/visits', 'DELETE', { id: old.id, name: '' });
  await db.meta.put({ key: 'visitor-profile', value: profile });
  if (enabled) void reportVisit(db);
}
