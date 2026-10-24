import type { Firestore, Query } from 'firebase-admin/firestore';
import type { ListOptions, Primitive, Store, StoredRecord } from '../types.js';

export class FirestoreStore implements Store {
  constructor(private readonly db: Firestore) {}

  async get(collection: string, id: string): Promise<StoredRecord | null> {
    const snapshot = await this.db.collection(collection).doc(id).get();
    return snapshot.exists ? ({ id: snapshot.id, ...snapshot.data() } as StoredRecord) : null;
  }

  async create(collection: string, id: string, value: StoredRecord): Promise<void> {
    await this.db
      .collection(collection)
      .doc(id)
      .create({ ...value, id });
  }

  async set(collection: string, id: string, value: StoredRecord): Promise<void> {
    await this.db
      .collection(collection)
      .doc(id)
      .set({ ...value, id });
  }

  async update(collection: string, id: string, patch: Partial<StoredRecord>): Promise<StoredRecord> {
    const ref = this.db.collection(collection).doc(id);
    await ref.update(patch);
    const updated = await ref.get();
    if (!updated.exists) throw Object.assign(new Error('Record not found'), { code: 'NOT_FOUND' });
    return { id: updated.id, ...updated.data() } as StoredRecord;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }

  async list(
    collection: string,
    filters: Record<string, Primitive> = {},
    options: ListOptions = {}
  ): Promise<StoredRecord[]> {
    let query: Query = this.db.collection(collection);
    for (const [field, value] of Object.entries(filters)) query = query.where(field, '==', value);
    if (options.orderBy) query = query.orderBy(options.orderBy, options.direction ?? 'asc');
    query = query.limit(options.limit ?? 100);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as StoredRecord);
  }

  async deleteMany(collection: string, filters: Record<string, Primitive>): Promise<number> {
    const matches = await this.list(collection, filters, { limit: 500 });
    for (let offset = 0; offset < matches.length; offset += 400) {
      const batch = this.db.batch();
      for (const match of matches.slice(offset, offset + 400)) {
        batch.delete(this.db.collection(collection).doc(match.id));
      }
      await batch.commit();
    }
    return matches.length;
  }

  async ping(): Promise<void> {
    await this.db.collection('_health').doc('readiness').get();
  }
}
