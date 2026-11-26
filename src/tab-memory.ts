/**
 * What the tracker remembers about this browser tab across a hard reload.
 *
 * A reload (a session that expired, a logout that ends in `location.href = '/login'`) loses
 * every in-memory variable but not Matomo's visitor cookie or its open visit. Without this
 * memory the next person to sign in on the tab would be stamped onto the previous person's
 * visit.
 */
export interface TabMemory {
  readUserId(): string | null;
  writeUserId(userId: string): void;
  forgetUserId(): void;
  readNewVisitPending(): boolean;
  writeNewVisitPending(pending: boolean): void;
}

export function createTabMemory(siteId: number): TabMemory {
  const userKey = `nanoco-matomo:${siteId}:user`;
  const newVisitKey = `nanoco-matomo:${siteId}:new-visit`;

  return {
    readUserId: () => attempt(() => window.sessionStorage.getItem(userKey)) ?? null,
    writeUserId: (userId) => void attempt(() => window.sessionStorage.setItem(userKey, userId)),
    forgetUserId: () => void attempt(() => window.sessionStorage.removeItem(userKey)),
    readNewVisitPending: () => attempt(() => window.sessionStorage.getItem(newVisitKey)) === '1',
    writeNewVisitPending: (pending) =>
      void attempt(() =>
        pending ? window.sessionStorage.setItem(newVisitKey, '1') : window.sessionStorage.removeItem(newVisitKey),
      ),
  };
}

/** Storage can be blocked (private mode, cookie settings): the tracker then works from memory only. */
function attempt<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}
