export interface GenerationRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface GenerationResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
  retries: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class AIGenerationError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly retryable: boolean,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'AIGenerationError';
  }
}

export interface GenerationProvider {
  readonly name: string;
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
