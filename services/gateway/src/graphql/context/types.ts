import type {
  AiAssistantClient,
  AuthClient,
  TestnetFaucetClient,
  RwaClient,
  FilesClient,
  SignersManagerClient,
  DocumentsClient,
  GalleryClient,
  QuestionsClient,
  FaqClient,
  BlogClient,
  CompanyClient,
  PortfolioClient,
  ChartsClient,
  ReactionsClient,
  LoyaltyClient,
  DaoClient,
  AiEvaluatorClient,
} from '../../clients/eden.clients';
import type { createPubSub } from 'graphql-yoga';
import { CacheService } from '../../services/cache.service';
import { OwnershipService } from '../../services/ownership.service';
import { ParentService } from '../../services/parent.service';
import { ValidationService } from '../../services/validation.service';
import type { Context } from '@opentelemetry/api';

export interface User {
  id: string;
  wallet: string;
}

export interface ServiceClients {
  aiAssistantClient: AiAssistantClient;
  authClient: AuthClient;
  testnetFaucetClient: TestnetFaucetClient;
  rwaClient: RwaClient;
  filesClient: FilesClient;
  signersManagerClient: SignersManagerClient;
  documentsClient: DocumentsClient;
  galleryClient: GalleryClient;
  questionsClient: QuestionsClient;
  faqClient: FaqClient;
  blogClient: BlogClient;
  portfolioClient: PortfolioClient;
  companyClient: CompanyClient;
  chartsClient: ChartsClient;
  reactionsClient: ReactionsClient;
  loyaltyClient: LoyaltyClient;
  daoClient: DaoClient;
  aiEvaluatorClient: AiEvaluatorClient;
}

export interface Services {
  cache: CacheService;
  ownership: OwnershipService;
  parent: ParentService;
  validation: ValidationService;
}

export type PubSubInstance = ReturnType<typeof createPubSub>;

export interface FileValidationConfig {
  DOCUMENTS_ALLOWED_MIME_TYPES: string[];
  GALLERY_ALLOWED_MIME_TYPES: string[];
}

export interface GraphQLContext {
  clients: ServiceClients;
  services: Services;
  user: User | null;
  token: string | null;
  pubSub: PubSubInstance;
  traceContext: Context;
  fileValidation: FileValidationConfig;
}

export interface RedisEvent {
  type: string;
  payload: any;
  metadata: {
    timestamp: number;
    service: string;
    version: string;
  };
}
