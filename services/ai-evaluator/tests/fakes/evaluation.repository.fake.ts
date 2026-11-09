/**
 * In-memory fake of EvaluationRepository for unit tests.
 *
 * The real repository talks to MongoDB. Tests use this fake to keep the service
 * layer isolated: no database, no network, deterministic results. The public API
 * mirrors src/repositories/evaluation.repository.ts, and every method is wrapped
 * in bun:test mock() so interactions can be asserted.
 *
 * fill* methods mimic the real CAS: they only write when the step marker is
 * still empty and return null otherwise, so step-conflict paths are testable.
 */
import { mock } from 'bun:test';
import { Types } from 'mongoose';
import { AppError } from '@shared/errors/app-errors';

export type FakeEntityType = 'pool' | 'business';

export type FakeFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
};

export type FakeEvaluationSource = {
  type: string;
  id: string;
  name: string;
  mimeType: string;
};

export type FakeEvaluationRisk = {
  score: number | null;
  pros: string[];
  cons: string[];
};

export type FakeEvaluationDoc = {
  _id: Types.ObjectId;
  entityType: FakeEntityType;
  parentId: string;
  grandParentId: string | null;
  ownerId: string | null;
  ownerType: string | null;
  context: { text: string; files: FakeFileMeta[] } | null;
  selection: { files: FakeFileMeta[] } | null;
  risk: FakeEvaluationRisk;
  summary: string | null;
  sources: FakeEvaluationSource[];
  modelUsed?: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
};

/** Same shape the real repository accepts: everything but the mongo-managed fields. */
export type CreateEvaluationInput = Partial<Omit<FakeEvaluationDoc, '_id' | 'createdAt' | 'updatedAt'>> &
  Pick<FakeEvaluationDoc, 'entityType' | 'parentId'> & {
    _id?: Types.ObjectId;
  };

function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  // Equality matching is enough for the filters used by tests ({ parentId }, { entityType }, ...).
  return Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
}

export function createFakeEvaluationRepository() {
  const store = new Map<string, FakeEvaluationDoc>();

  const notFound = (id: string) =>
    new AppError({ message: `Evaluation ${id} not found`, statusCode: 404, code: 'NOT_FOUND' });

  const touch = (doc: FakeEvaluationDoc) => {
    doc.updatedAt = Math.floor(Date.now() / 1000);
    return doc;
  };

  const repository = {
    store,

    create: mock(async (data: CreateEvaluationInput) => {
      const now = Math.floor(Date.now() / 1000);
      const doc: FakeEvaluationDoc = {
        grandParentId: null,
        ownerId: null,
        ownerType: null,
        context: null,
        selection: null,
        summary: null,
        sources: [],
        completed: false,
        ...data,
        _id: data._id ?? new Types.ObjectId(),
        risk: data.risk ?? { score: null, pros: [], cons: [] },
        createdAt: now,
        updatedAt: now,
      };
      store.set(doc._id.toString(), doc);
      return doc;
    }),

    fillContext: mock(
      async (
        id: string,
        data: { text: string; files: FakeFileMeta[]; ownerId: string; ownerType: string; grandParentId: string },
      ) => {
        const doc = store.get(id);
        if (!doc) throw notFound(id);
        if (doc.context !== null) return null;

        doc.context = { text: data.text, files: data.files };
        doc.ownerId = data.ownerId;
        doc.ownerType = data.ownerType;
        doc.grandParentId = data.grandParentId;

        return touch(doc);
      },
    ),

    fillSelection: mock(async (id: string, files: FakeFileMeta[]) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);
      if (doc.selection !== null) return null;

      doc.selection = { files };

      return touch(doc);
    }),

    fillSummary: mock(async (id: string, summary: string) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);
      if (doc.summary !== null) return null;

      doc.summary = summary;

      return touch(doc);
    }),

    fillRisk: mock(async (id: string, risk: FakeEvaluationRisk) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);
      if (doc.risk.score !== null) return null;

      doc.risk = risk;

      return touch(doc);
    }),

    finalize: mock(
      async (id: string, data: { sources: FakeEvaluationSource[]; modelUsed: string }) => {
        const doc = store.get(id);
        if (!doc) throw notFound(id);
        if (doc.completed) return null;

        doc.sources = data.sources;
        doc.modelUsed = data.modelUsed;
        doc.completed = true;

        return touch(doc);
      },
    ),

    updateById: mock(async (id: string, data: Partial<FakeEvaluationDoc>) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      Object.assign(doc, data);

      return touch(doc);
    }),

    findById: mock(async (id: string) => {
      const doc = store.get(id);
      if (!doc) throw notFound(id);

      return doc;
    }),

    findAll: mock(
      async (
        filter: Record<string, unknown> = {},
        _sort: Record<string, 'asc' | 'desc'> = { createdAt: 'asc' },
        limit = 100,
        offset = 0,
      ) => {
        return Array.from(store.values())
          .filter((doc) => matchesFilter(doc, filter))
          .slice(offset, offset + limit);
      },
    ),
  };

  return repository;
}

export type FakeEvaluationRepository = ReturnType<typeof createFakeEvaluationRepository>;
