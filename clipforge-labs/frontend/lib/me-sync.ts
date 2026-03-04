export type MeSyncPayload = {
  name?: string | null;
  email: string;
  plan: string;
  credits: number;
} | null;

const ME_SYNC_EVENT = "clipforge-labs:me-sync";

function isBrowser() {
  return typeof window !== "undefined";
}

export function emitMeSync(payload: MeSyncPayload) {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent<MeSyncPayload>(ME_SYNC_EVENT, { detail: payload }));
}

export function subscribeMeSync(listener: (payload: MeSyncPayload) => void) {
  if (!isBrowser()) return () => {};

  const handler = (event: Event) => {
    const custom = event as CustomEvent<MeSyncPayload>;
    listener(custom.detail ?? null);
  };

  window.addEventListener(ME_SYNC_EVENT, handler as EventListener);
  return () => window.removeEventListener(ME_SYNC_EVENT, handler as EventListener);
}
