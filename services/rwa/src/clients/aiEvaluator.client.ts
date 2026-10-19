export type AiEvaluatorResponse<T> = {
  data: T | null;
  error: string | null;
  status: number;
};

export type CreateEvaluationRequest = {
  ownerId: string;
  ownerType: string;
};

export type CreatePoolEvaluationRequest = CreateEvaluationRequest & { poolId: string };
export type CreateBusinessEvaluationRequest = CreateEvaluationRequest & { businessId: string };

export type CreateEvaluationResponse = {
  jobId: string;
};

export class AiEvaluatorClient {
  constructor(private readonly baseUrl: string) {}

  readonly createPoolEvaluation = {
    post: async (body: CreatePoolEvaluationRequest) =>
      await this.post<CreateEvaluationResponse>('/createPoolEvaluation', body),
  };

  readonly createBusinessEvaluation = {
    post: async (body: CreateBusinessEvaluationRequest) =>
      await this.post<CreateEvaluationResponse>('/createBusinessEvaluation', body),
  };

  private async post<T>(path: string, body: unknown): Promise<AiEvaluatorResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return { data: null, error: await response.text(), status: response.status };
    }

    return { data: (await response.json()) as T, error: null, status: response.status };
  }
}
