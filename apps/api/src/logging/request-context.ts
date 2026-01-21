import { AsyncLocalStorage } from "async_hooks";

export type RequestContextStore = {
  requestId: string;
  userId?: string;
  orgId?: string;
};

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, callback: () => T) {
    return storage.run(store, callback);
  },
  get() {
    return storage.getStore();
  },
  setUserContext(userId?: string, orgId?: string) {
    const current = storage.getStore();
    if (current) {
      current.userId = userId;
      current.orgId = orgId;
    }
  },
};
