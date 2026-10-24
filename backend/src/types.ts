export type Primitive = string | number | boolean | null;
export type StoredValue = Primitive | StoredValue[] | { [key: string]: StoredValue };
export type StoredRecord = { id: string; [key: string]: StoredValue | undefined };

export interface ListOptions {
  limit?: number;
  orderBy?: string;
  direction?: 'asc' | 'desc';
}

export interface Store {
  get(collection: string, id: string): Promise<StoredRecord | null>;
  create(collection: string, id: string, value: StoredRecord): Promise<void>;
  set(collection: string, id: string, value: StoredRecord): Promise<void>;
  update(collection: string, id: string, patch: Partial<StoredRecord>): Promise<StoredRecord>;
  delete(collection: string, id: string): Promise<void>;
  list(
    collection: string,
    filters?: Record<string, Primitive>,
    options?: ListOptions
  ): Promise<StoredRecord[]>;
  deleteMany(collection: string, filters: Record<string, Primitive>): Promise<number>;
  ping(): Promise<void>;
}

export interface Identity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  role?: 'user' | 'admin';
}

export interface IdentityVerifier {
  verify(idToken: string): Promise<Identity>;
  deleteUser(uid: string): Promise<void>;
}

export interface AuthUser {
  id: string;
  sessionId: string;
  role: 'user' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
      validated?: { body?: unknown; params?: unknown; query?: unknown };
    }
  }
}
