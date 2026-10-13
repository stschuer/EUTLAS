import { AsyncLocalStorage } from 'async_hooks';

interface RequestContextStore {
  /** Authenticated with a platform:admin API key of an active global admin. */
  platformAdmin: boolean;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/**
 * Per-request state that deep service code (e.g. OrgsService.checkAccess)
 * needs without threading the request through every call. Outside an HTTP
 * request (jobs, crons) there is no store and everything defaults to off.
 */
export const RequestContext = {
  run<T>(fn: () => T): T {
    return storage.run({ platformAdmin: false }, fn);
  },

  markPlatformAdmin(): void {
    const store = storage.getStore();
    if (store) store.platformAdmin = true;
  },

  isPlatformAdmin(): boolean {
    return storage.getStore()?.platformAdmin === true;
  },
};
