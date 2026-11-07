/**
 * In-memory fakes of the six eden (Elysia treaty) clients for unit tests.
 *
 * The real clients are built by createEdenTreatyClient() in
 * src/clients/eden.clients.ts and talk HTTP to the rwa, documents, gallery,
 * reactions, questions and portfolio services. Tests use these fakes to keep
 * the service layer isolated: no network, deterministic responses.
 *
 * Only the `.post` routes actually called by src/services/evaluation.service.ts
 * are implemented, with the eden result shape ({ data, error }) that the service
 * reads: `error` is null on success, `data` is null when the upstream call fails.
 * Every route is wrapped in bun:test mock() so payloads can be asserted.
 */
import { mock } from 'bun:test';

/** Result shape of an eden treaty call. */
export type EdenResponse<T> = {
  data: T | null;
  error: any;
};

export type FakePool = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  entryFeePercent?: number;
  exitFeePercent?: number;
  expectedHoldAmount?: number;
  expectedRwaAmount?: number;
  rewardPercent?: number;
  businessId: string;
  poolAddress?: string | null;
  riskScore?: number;
};

export type FakeBusiness = {
  id: string;
  name: string;
  businessType?: string;
  country?: string;
  tags?: string[];
  tokenAddress?: string;
};

export type FakeDocumentFile = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
};

export type FakeGalleryImage = {
  id: string;
  name: string;
  url: string;
};

export type FakeReactionsResponse = {
  reactions: Record<string, number>;
};

export type FakeQuestion = {
  id: string;
  answered: boolean;
};

export function edenOk<T>(data: T): EdenResponse<T> {
  return { data, error: null };
}

/** Eden resolves upstream errors instead of throwing: `error` carries the parsed error body. */
export function edenError(status = 500, value: unknown = { code: 'UPSTREAM_ERROR' }): EdenResponse<never> {
  return { data: null, error: { status, value } };
}

function createFakeEndpoint<T>(defaultResponse: EdenResponse<T>) {
  const queuedResponses: EdenResponse<T>[] = [];
  let fallbackResponse = defaultResponse;

  const post = mock(async (_body: Record<string, any>): Promise<EdenResponse<T>> => {
    const queued = queuedResponses.shift();
    return queued ?? fallbackResponse;
  });

  return {
    post,

    /** Queues a response for the next call; queued responses are consumed first, in FIFO order. */
    queueResponse(response: EdenResponse<T>) {
      queuedResponses.push(response);
    },

    /** Replaces the response used once the queue is empty. */
    setDefaultResponse(response: EdenResponse<T>) {
      fallbackResponse = response;
    },
  };
}

export function createFakeRwaClient() {
  return {
    getPool: createFakeEndpoint<FakePool>(edenError()),
    getBusiness: createFakeEndpoint<FakeBusiness>(edenError()),
    getPools: createFakeEndpoint<FakePool[]>(edenOk<FakePool[]>([])),
  };
}

export function createFakeDocumentsClient() {
  return {
    getDocuments: createFakeEndpoint<FakeDocumentFile[]>(edenOk<FakeDocumentFile[]>([])),
  };
}

export function createFakeGalleryClient() {
  return {
    getImages: createFakeEndpoint<FakeGalleryImage[]>(edenOk<FakeGalleryImage[]>([])),
  };
}

export function createFakeReactionsClient() {
  return {
    getEntityReactions: createFakeEndpoint<FakeReactionsResponse>(edenOk<FakeReactionsResponse>({ reactions: {} })),
  };
}

export function createFakeQuestionsClient() {
  return {
    getQuestions: createFakeEndpoint<FakeQuestion[]>(edenOk<FakeQuestion[]>([])),
  };
}

export function createFakePortfolioClient() {
  return {
    getBalances: createFakeEndpoint<Record<string, unknown>[]>(edenOk<Record<string, unknown>[]>([])),
  };
}

export function createFakeEdenClients() {
  return {
    rwaClient: createFakeRwaClient(),
    documentsClient: createFakeDocumentsClient(),
    galleryClient: createFakeGalleryClient(),
    reactionsClient: createFakeReactionsClient(),
    questionsClient: createFakeQuestionsClient(),
    portfolioClient: createFakePortfolioClient(),
  };
}

export type FakeRwaClient = ReturnType<typeof createFakeRwaClient>;
export type FakeDocumentsClient = ReturnType<typeof createFakeDocumentsClient>;
export type FakeGalleryClient = ReturnType<typeof createFakeGalleryClient>;
export type FakeReactionsClient = ReturnType<typeof createFakeReactionsClient>;
export type FakeQuestionsClient = ReturnType<typeof createFakeQuestionsClient>;
export type FakePortfolioClient = ReturnType<typeof createFakePortfolioClient>;
export type FakeEdenClients = ReturnType<typeof createFakeEdenClients>;
