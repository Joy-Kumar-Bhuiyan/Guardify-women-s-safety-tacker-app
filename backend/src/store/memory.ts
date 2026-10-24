import type { ListOptions, Primitive, Store, StoredRecord } from '../types.js';

export class MemoryStore implements Store {
  private readonly collections = new Map<string, Map<string, StoredRecord>>();

  private bucket(name: string): Map<string, StoredRecord> {
    let bucket = this.collections.get(name);
    if (!bucket) {
      bucket = new Map();
      this.collections.set(name, bucket);
    }
    return bucket;
  }

  async get(collection: string, id: string): Promise<StoredRecord | null> {
    return structuredClone(this.bucket(collection).get(id) ?? null);
  }

  async create(collection: string, id: string, value: StoredRecord): Promise<void> {
    const bucket = this.bucket(collection);
    if (bucket.has(id)) throw Object.assign(new Error('Record already exists'), { code: 'ALREADY_EXISTS' });
    bucket.set(id, structuredClone({ ...value, id }));
  }

  async set(collection: string, id: string, value: StoredRecord): Promise<void> {
    this.bucket(collection).set(id, structuredClone({ ...value, id }));
  }

  async update(collection: string, id: string, patch: Partial<StoredRecord>): Promise<StoredRecord> {
    const current = this.bucket(collection).get(id);
    if (!current) throw Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    const updated = { ...current, ...structuredClone(patch), id } as StoredRecord;
    this.bucket(collection).set(id, updated);
    return structuredClone(updated);
  }

  async delete(collection: string, id: string): Promise<void> {
    this.bucket(collection).delete(id);
  }

  async list(
    collection: string,
    filters: Record<string, Primitive> = {},
    options: ListOptions = {}
  ): Promise<StoredRecord[]> {
    const values = [...this.bucket(collection).values()].filter((value) =>
      Object.entries(filters).every(([key, expected]) => value[key] === expected)
    );
    if (options.orderBy) {
      const field = options.orderBy;
      values.sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? '')));
      if (options.direction === 'desc') values.reverse();
    }
    return structuredClone(values.slice(0, options.limit ?? 100));
  }

  async deleteMany(collection: string, filters: Record<string, Primitive>): Promise<number> {
    const matches = await this.list(collection, filters, { limit: 10_000 });
    for (const match of matches) this.bucket(collection).delete(match.id);
    return matches.length;
  }

  async ping(): Promise<void> {
    return Promise.resolve();
  }
}
