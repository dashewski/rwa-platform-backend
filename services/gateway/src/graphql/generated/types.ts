import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { GraphQLContext } from '../context/types';
export type Maybe<T> = T | undefined;
export type InputMaybe<T> = T | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  JSON: { input: { [key: string]: any }; output: { [key: string]: any } };
};

export type AddMemberInput = {
  companyId: Scalars['ID']['input'];
  name: Scalars['String']['input'];
  userId: Scalars['String']['input'];
};

export type Answer = {
  __typename?: 'Answer';
  createdAt: Scalars['Float']['output'];
  text: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
  userId: Scalars['String']['output'];
};

export type ApiKey = {
  __typename?: 'ApiKey';
  createdAt: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  prefix: Scalars['String']['output'];
  updatedAt: Scalars['Int']['output'];
  userId: Scalars['String']['output'];
  wallet: Scalars['String']['output'];
};

export type ApprovalSignaturesResponse = {
  __typename?: 'ApprovalSignaturesResponse';
  taskId: Scalars['String']['output'];
};

export type Assistant = {
  __typename?: 'Assistant';
  contextPreferences: Array<AssistantContext>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  userId: Scalars['String']['output'];
};

export type AssistantContext = 'investor_base' | 'popular_pools' | 'product_owner_base' | 'user_portfolio';

export type AuthTokens = {
  __typename?: 'AuthTokens';
  accessToken: Scalars['String']['output'];
  refreshToken: Scalars['String']['output'];
  userId: Scalars['String']['output'];
  wallet: Scalars['String']['output'];
};

export type AuthenticateInput = {
  signature: Scalars['String']['input'];
  timestamp: Scalars['Int']['input'];
  wallet: Scalars['String']['input'];
};

export type Blog = {
  __typename?: 'Blog';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type BlogParentTypes = 'business' | 'pool';

export type Business = {
  __typename?: 'Business';
  approvalSignaturesTaskExpired?: Maybe<Scalars['Float']['output']>;
  approvalSignaturesTaskId?: Maybe<Scalars['String']['output']>;
  businessType?: Maybe<Scalars['String']['output']>;
  chainId: Scalars['String']['output'];
  country?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Float']['output'];
  description?: Maybe<Scalars['String']['output']>;
  fileId?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  image?: Maybe<Scalars['String']['output']>;
  imageUrl?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  ownerWallet?: Maybe<Scalars['String']['output']>;
  paused: Scalars['Boolean']['output'];
  riskScore?: Maybe<Scalars['Int']['output']>;
  riskScoreEvaluationProcess: Scalars['Boolean']['output'];
  socials: Array<SocialLink>;
  tags?: Maybe<Array<Scalars['String']['output']>>;
  tokenAddress?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['Float']['output'];
};

export type BusinessOwnerType = 'company';

export type BusinessType = 'franchise' | 'growth' | 'startup';

export type Company = {
  __typename?: 'Company';
  country?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Int']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  socials: Array<SocialLink>;
  updatedAt: Scalars['Int']['output'];
};

export type CompanyWithDetails = {
  __typename?: 'CompanyWithDetails';
  country?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Int']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  socials: Array<SocialLink>;
  updatedAt: Scalars['Int']['output'];
  users: Array<UserWithPermissions>;
};

export type CreateApiKeyInput = {
  name: Scalars['String']['input'];
};

export type CreateApiKeyResult = {
  __typename?: 'CreateApiKeyResult';
  createdAt: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  name: Scalars['String']['output'];
  prefix: Scalars['String']['output'];
};

export type CreateAssistantInput = {
  contextPreferences: Array<AssistantContext>;
  name: Scalars['String']['input'];
};

export type CreateBlogInput = {
  name: Scalars['String']['input'];
  parentId: Scalars['String']['input'];
  type: BlogParentTypes;
};

export type CreateBusinessInput = {
  businessType?: InputMaybe<BusinessType>;
  chainId: Scalars['String']['input'];
  country?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  ownerId: Scalars['String']['input'];
  ownerType: BusinessOwnerType;
  socials?: InputMaybe<Array<SocialLinkInput>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateBusinessWithAiInput = {
  chainId: Scalars['String']['input'];
  description: Scalars['String']['input'];
  ownerId: Scalars['String']['input'];
  ownerType: BusinessOwnerType;
};

export type CreateCompanyInput = {
  country?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['String']['input'];
  name: Scalars['String']['input'];
  socials?: InputMaybe<Array<SocialLinkInput>>;
};

export type CreateFaqAnswerInput = {
  answer: Scalars['String']['input'];
  order?: InputMaybe<Scalars['Int']['input']>;
  question: Scalars['String']['input'];
  topicId: Scalars['String']['input'];
};

export type CreateFaqTopicInput = {
  name: Scalars['String']['input'];
  parentId: Scalars['String']['input'];
  type: FaqParentTypes;
};

export type CreateFolderInput = {
  name: Scalars['String']['input'];
  parentId: Scalars['String']['input'];
  type: ParentTypes;
};

export type CreateGalleryInput = {
  name: Scalars['String']['input'];
  parentId: Scalars['String']['input'];
  type: GalleryParentTypes;
};

export type CreateMessageInput = {
  assistantId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};

export type CreatePoolInput = {
  allowEntryBurn?: InputMaybe<Scalars['Boolean']['input']>;
  awaitCompletionExpired?: InputMaybe<Scalars['Boolean']['input']>;
  businessId: Scalars['String']['input'];
  completionPeriodExpired?: InputMaybe<Scalars['Float']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  entryFeePercent?: InputMaybe<Scalars['String']['input']>;
  entryPeriodExpired?: InputMaybe<Scalars['Float']['input']>;
  entryPeriodStart?: InputMaybe<Scalars['Float']['input']>;
  exitFeePercent?: InputMaybe<Scalars['String']['input']>;
  expectedHoldAmount?: InputMaybe<Scalars['String']['input']>;
  expectedRwaAmount?: InputMaybe<Scalars['String']['input']>;
  fixedSell?: InputMaybe<Scalars['Boolean']['input']>;
  floatingOutTranchesTimestamps?: InputMaybe<Scalars['Boolean']['input']>;
  incomingTranches?: InputMaybe<Array<IncomingTrancheInput>>;
  name: Scalars['String']['input'];
  outgoingTranches?: InputMaybe<Array<OutgoingTrancheInput>>;
  priceImpactPercent?: InputMaybe<Scalars['String']['input']>;
  rewardPercent?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreatePoolWithAiInput = {
  businessId: Scalars['String']['input'];
  description: Scalars['String']['input'];
};

export type CreatePostInput = {
  blogId: Scalars['String']['input'];
  content: Scalars['String']['input'];
  documents?: InputMaybe<Array<Scalars['String']['input']>>;
  images?: InputMaybe<Array<Scalars['String']['input']>>;
  title: Scalars['String']['input'];
};

export type CreateQuestionAnswerInput = {
  id: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};

export type CreateQuestionInput = {
  text: Scalars['String']['input'];
  topicId: Scalars['String']['input'];
};

export type CreateReferrerWithdrawTaskInput = {
  amount: Scalars['String']['input'];
  chainId: Scalars['String']['input'];
  tokenAddress: Scalars['String']['input'];
};

export type CreateTopicInput = {
  name: Scalars['String']['input'];
  parentId: Scalars['String']['input'];
  type: ParentTypes;
};

export type CreateWebhookEndpointInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  events: Array<Scalars['String']['input']>;
  rateLimitPerMinute?: InputMaybe<Scalars['Int']['input']>;
  url: Scalars['String']['input'];
};

export type CreateWebhookEndpointResult = {
  __typename?: 'CreateWebhookEndpointResult';
  active: Scalars['Boolean']['output'];
  createdAt: Scalars['Float']['output'];
  description?: Maybe<Scalars['String']['output']>;
  events: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  rateLimitPerMinute: Scalars['Int']['output'];
  secret: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type Document = {
  __typename?: 'Document';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  fileId: Scalars['String']['output'];
  folderId: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Float']['output'];
  updatedAt: Scalars['Float']['output'];
  url: Scalars['String']['output'];
};

export type EditBusinessDataInput = {
  businessType?: InputMaybe<BusinessType>;
  chainId?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  socials?: InputMaybe<Array<SocialLinkInput>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type EditBusinessInput = {
  id: Scalars['ID']['input'];
  updateData: EditBusinessDataInput;
};

export type EditPoolDataInput = {
  allowEntryBurn?: InputMaybe<Scalars['Boolean']['input']>;
  awaitCompletionExpired?: InputMaybe<Scalars['Boolean']['input']>;
  chainId?: InputMaybe<Scalars['String']['input']>;
  completionPeriodExpired?: InputMaybe<Scalars['Float']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  entryFeePercent?: InputMaybe<Scalars['String']['input']>;
  entryPeriodExpired?: InputMaybe<Scalars['Float']['input']>;
  entryPeriodStart?: InputMaybe<Scalars['Float']['input']>;
  exitFeePercent?: InputMaybe<Scalars['String']['input']>;
  expectedHoldAmount?: InputMaybe<Scalars['String']['input']>;
  expectedRwaAmount?: InputMaybe<Scalars['String']['input']>;
  fixedSell?: InputMaybe<Scalars['Boolean']['input']>;
  floatingOutTranchesTimestamps?: InputMaybe<Scalars['Boolean']['input']>;
  incomingTranches?: InputMaybe<Array<IncomingTrancheInput>>;
  name?: InputMaybe<Scalars['String']['input']>;
  outgoingTranches?: InputMaybe<Array<OutgoingTrancheInput>>;
  priceImpactPercent?: InputMaybe<Scalars['String']['input']>;
  rewardPercent?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type EditPoolInput = {
  id: Scalars['ID']['input'];
  updateData: EditPoolDataInput;
};

export type EntityReactionsResponse = {
  __typename?: 'EntityReactionsResponse';
  reactions: Scalars['JSON']['output'];
  userReactions: Array<Scalars['String']['output']>;
};

export type Evaluation = {
  __typename?: 'Evaluation';
  createdAt: Scalars['Float']['output'];
  entityType: EvaluationEntityType;
  evaluatedDocuments: Array<EvaluationDocumentRef>;
  evaluatedImages: Array<EvaluationImageRef>;
  factors: Array<EvaluationFactor>;
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  modelUsed?: Maybe<Scalars['String']['output']>;
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  reasoning?: Maybe<Scalars['String']['output']>;
  riskScore?: Maybe<Scalars['Int']['output']>;
  stage1Response?: Maybe<Scalars['String']['output']>;
  stage2Response?: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type EvaluationDocumentRef = {
  __typename?: 'EvaluationDocumentRef';
  id: Scalars['String']['output'];
  mimeType: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type EvaluationEntityType = 'business' | 'pool';

export type EvaluationFactor = {
  __typename?: 'EvaluationFactor';
  detail: Scalars['String']['output'];
  impact: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type EvaluationFilterInput = {
  entityType?: InputMaybe<EvaluationEntityType>;
  grandParentId?: InputMaybe<Scalars['String']['input']>;
  ownerId?: InputMaybe<Scalars['String']['input']>;
  parentId?: InputMaybe<Scalars['String']['input']>;
};

export type EvaluationImageRef = {
  __typename?: 'EvaluationImageRef';
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type EvaluationSortInput = {
  createdAt?: InputMaybe<Scalars['String']['input']>;
  riskScore?: InputMaybe<Scalars['String']['input']>;
};

export type FaqAnswer = {
  __typename?: 'FaqAnswer';
  answer: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  order: Scalars['Int']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  question: Scalars['String']['output'];
  topicId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type FaqParentTypes = 'business' | 'pool';

export type FaqTopic = {
  __typename?: 'FaqTopic';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type FaucetRequest = {
  __typename?: 'FaucetRequest';
  amount: Scalars['Float']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  tokenType: FaucetTokenType;
  transactionHash: Scalars['String']['output'];
  userId: Scalars['String']['output'];
  wallet: Scalars['String']['output'];
};

export type FaucetTokenType = 'gas' | 'hold' | 'platform';

export type Fees = {
  __typename?: 'Fees';
  buyCommissionAmount: Scalars['String']['output'];
  buyCommissionCount: Scalars['Int']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  poolCreationCommissionAmount: Scalars['String']['output'];
  poolCreationCommissionCount: Scalars['Int']['output'];
  referralRewardAmount: Scalars['String']['output'];
  referralRewardCount: Scalars['Int']['output'];
  sellCommissionAmount: Scalars['String']['output'];
  sellCommissionCount: Scalars['Int']['output'];
  tokenAddress: Scalars['String']['output'];
  tokenCreationCommissionAmount: Scalars['String']['output'];
  tokenCreationCommissionCount: Scalars['Int']['output'];
  updatedAt: Scalars['Float']['output'];
  userId: Scalars['String']['output'];
  userWallet: Scalars['String']['output'];
};

export type FilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type Folder = {
  __typename?: 'Folder';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type Gallery = {
  __typename?: 'Gallery';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type GalleryParentTypes = 'business' | 'pool' | 'user';

export type GetBalancesInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetBlogsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetCompaniesInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetDocumentsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetEvaluationsInput = {
  filter?: InputMaybe<EvaluationFilterInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<EvaluationSortInput>;
};

export type GetFaqAnswersFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetFaqTopicsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetFeesFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetFoldersFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetGalleriesFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetImagesFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetOhlcPriceDataInput = {
  endTime: Scalars['Float']['input'];
  interval: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  poolAddress: Scalars['String']['input'];
  startTime: Scalars['Float']['input'];
};

export type GetPoolTransactionsInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetPostsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetProposalsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetQuestionsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetRawPriceDataInput = {
  endTime: Scalars['Float']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  poolAddress: Scalars['String']['input'];
  sort?: InputMaybe<Scalars['JSON']['input']>;
  startTime: Scalars['Float']['input'];
};

export type GetReactionsFilterInput = {
  filter: Scalars['JSON']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetReferralsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetReferrerClaimHistoryFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetReferrerWithdrawsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetSignatureTaskInput = {
  taskId: Scalars['String']['input'];
};

export type GetStakingFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetStakingHistoryFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetTimelockTasksFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetTopicsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetTransactionsInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetTreasuryWithdrawsFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GetVolumeDataInput = {
  endTime: Scalars['Float']['input'];
  interval: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  poolAddress: Scalars['String']['input'];
  startTime: Scalars['Float']['input'];
};

export type GetVotesFilterInput = {
  filter?: InputMaybe<Scalars['JSON']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<Scalars['JSON']['input']>;
};

export type GrantPermissionInput = {
  companyId: Scalars['ID']['input'];
  entity: Scalars['String']['input'];
  memberId: Scalars['ID']['input'];
  permission: Scalars['String']['input'];
  userId: Scalars['String']['input'];
};

export type IdResponse = {
  __typename?: 'IdResponse';
  id: Scalars['ID']['output'];
};

export type Image = {
  __typename?: 'Image';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  description: Scalars['String']['output'];
  fileId: Scalars['String']['output'];
  galleryId: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  mimeType: Scalars['String']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Float']['output'];
  updatedAt: Scalars['Float']['output'];
  url: Scalars['String']['output'];
};

export type IncomingTranche = {
  __typename?: 'IncomingTranche';
  amount: Scalars['String']['output'];
  expiredAt: Scalars['Float']['output'];
  returnedAmount: Scalars['String']['output'];
};

export type IncomingTrancheInput = {
  amount: Scalars['String']['input'];
  expiredAt: Scalars['Float']['input'];
  returnedAmount: Scalars['String']['input'];
};

export type Member = {
  __typename?: 'Member';
  createdAt: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  updatedAt: Scalars['Int']['output'];
  userId: Scalars['String']['output'];
};

export type Message = {
  __typename?: 'Message';
  assistantId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  sender: MessageSender;
  text: Scalars['String']['output'];
};

export type MessageSender = 'assistant' | 'user';

export type Mutation = {
  __typename?: 'Mutation';
  _?: Maybe<Scalars['Boolean']['output']>;
  addMember: Member;
  authenticate: AuthTokens;
  createApiKey: CreateApiKeyResult;
  createAssistant: Assistant;
  createBlog: Blog;
  createBusiness: Business;
  createBusinessWithAI: Business;
  createCompany: Company;
  createFaqAnswer: FaqAnswer;
  createFaqTopic: FaqTopic;
  createFolder: Folder;
  createGallery: Gallery;
  createMessage: Array<Message>;
  createPool: Pool;
  createPoolWithAI: Pool;
  createPost: Post;
  createQuestion: Question;
  createQuestionAnswer: Question;
  createReferrerWithdrawTask: ReferrerWithdraw;
  createTopic: Topic;
  createWebhookEndpoint: CreateWebhookEndpointResult;
  deleteApiKey: Scalars['ID']['output'];
  deleteAssistant: IdResponse;
  deleteBlog: Scalars['ID']['output'];
  deleteCompany: Scalars['ID']['output'];
  deleteDocument: Scalars['ID']['output'];
  deleteFaqAnswer: Scalars['ID']['output'];
  deleteFaqTopic: Scalars['ID']['output'];
  deleteFolder: Scalars['ID']['output'];
  deleteGallery: Scalars['ID']['output'];
  deleteImage: Scalars['ID']['output'];
  deleteMessage: IdResponse;
  deletePost: Scalars['ID']['output'];
  deleteQuestion: Scalars['ID']['output'];
  deleteTopic: Scalars['ID']['output'];
  deleteWebhookEndpoint: Scalars['ID']['output'];
  editBusiness: Business;
  editPool: Pool;
  grantPermission: Permission;
  refreshToken: AuthTokens;
  registerReferral: Referral;
  rejectBusinessApprovalSignatures: Scalars['Boolean']['output'];
  rejectPoolApprovalSignatures: Scalars['Boolean']['output'];
  removeMember: Scalars['ID']['output'];
  requestBusinessApprovalSignatures: ApprovalSignaturesResponse;
  requestGas: FaucetRequest;
  requestHold: FaucetRequest;
  requestPlatform: FaucetRequest;
  requestPoolApprovalSignatures: ApprovalSignaturesResponse;
  resetReaction?: Maybe<Reaction>;
  revokePermission: Scalars['ID']['output'];
  revokeTokens: RevokeTokensResult;
  setReaction: Reaction;
  toggleQuestionLike: Scalars['Boolean']['output'];
  updateApiKey: ApiKey;
  updateAssistant: Assistant;
  updateBlog: Blog;
  updateBusinessRiskScore: Business;
  updateCompany: Company;
  updateDocument: Document;
  updateFaqAnswer: FaqAnswer;
  updateFaqTopic: FaqTopic;
  updateFolder: Folder;
  updateGallery: Gallery;
  updateImage: Image;
  updateMessage: Message;
  updatePoolRiskScore: Pool;
  updatePost: Post;
  updateQuestionAnswer: Question;
  updateQuestionText: Question;
  updateTopic: Topic;
  updateWebhookEndpoint: WebhookEndpoint;
};

export type MutationAddMemberArgs = {
  input: AddMemberInput;
};

export type MutationAuthenticateArgs = {
  input: AuthenticateInput;
};

export type MutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};

export type MutationCreateAssistantArgs = {
  input: CreateAssistantInput;
};

export type MutationCreateBlogArgs = {
  input: CreateBlogInput;
};

export type MutationCreateBusinessArgs = {
  input: CreateBusinessInput;
};

export type MutationCreateBusinessWithAiArgs = {
  input: CreateBusinessWithAiInput;
};

export type MutationCreateCompanyArgs = {
  input: CreateCompanyInput;
};

export type MutationCreateFaqAnswerArgs = {
  input: CreateFaqAnswerInput;
};

export type MutationCreateFaqTopicArgs = {
  input: CreateFaqTopicInput;
};

export type MutationCreateFolderArgs = {
  input: CreateFolderInput;
};

export type MutationCreateGalleryArgs = {
  input: CreateGalleryInput;
};

export type MutationCreateMessageArgs = {
  input: CreateMessageInput;
};

export type MutationCreatePoolArgs = {
  input: CreatePoolInput;
};

export type MutationCreatePoolWithAiArgs = {
  input: CreatePoolWithAiInput;
};

export type MutationCreatePostArgs = {
  input: CreatePostInput;
};

export type MutationCreateQuestionArgs = {
  input: CreateQuestionInput;
};

export type MutationCreateQuestionAnswerArgs = {
  input: CreateQuestionAnswerInput;
};

export type MutationCreateReferrerWithdrawTaskArgs = {
  input: CreateReferrerWithdrawTaskInput;
};

export type MutationCreateTopicArgs = {
  input: CreateTopicInput;
};

export type MutationCreateWebhookEndpointArgs = {
  input: CreateWebhookEndpointInput;
};

export type MutationDeleteApiKeyArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteAssistantArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteBlogArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteCompanyArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteDocumentArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteFaqAnswerArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteFaqTopicArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteFolderArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteGalleryArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteImageArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteMessageArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeletePostArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteQuestionArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteTopicArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeleteWebhookEndpointArgs = {
  id: Scalars['ID']['input'];
};

export type MutationEditBusinessArgs = {
  input: EditBusinessInput;
};

export type MutationEditPoolArgs = {
  input: EditPoolInput;
};

export type MutationGrantPermissionArgs = {
  input: GrantPermissionInput;
};

export type MutationRefreshTokenArgs = {
  input: RefreshTokenInput;
};

export type MutationRegisterReferralArgs = {
  input: RegisterReferralInput;
};

export type MutationRejectBusinessApprovalSignaturesArgs = {
  id: Scalars['ID']['input'];
};

export type MutationRejectPoolApprovalSignaturesArgs = {
  id: Scalars['ID']['input'];
};

export type MutationRemoveMemberArgs = {
  input: RemoveMemberInput;
};

export type MutationRequestBusinessApprovalSignaturesArgs = {
  input: RequestBusinessApprovalSignaturesInput;
};

export type MutationRequestGasArgs = {
  input: RequestTokenInput;
};

export type MutationRequestHoldArgs = {
  input: RequestTokenInput;
};

export type MutationRequestPlatformArgs = {
  input: RequestTokenInput;
};

export type MutationRequestPoolApprovalSignaturesArgs = {
  input: RequestPoolApprovalSignaturesInput;
};

export type MutationResetReactionArgs = {
  input: SetReactionInput;
};

export type MutationRevokePermissionArgs = {
  input: RevokePermissionInput;
};

export type MutationRevokeTokensArgs = {
  input: RevokeTokensInput;
};

export type MutationSetReactionArgs = {
  input: SetReactionInput;
};

export type MutationToggleQuestionLikeArgs = {
  questionId: Scalars['ID']['input'];
};

export type MutationUpdateApiKeyArgs = {
  input: UpdateApiKeyInput;
};

export type MutationUpdateAssistantArgs = {
  input: UpdateAssistantInput;
};

export type MutationUpdateBlogArgs = {
  input: UpdateBlogInput;
};

export type MutationUpdateBusinessRiskScoreArgs = {
  id: Scalars['ID']['input'];
};

export type MutationUpdateCompanyArgs = {
  input: UpdateCompanyInput;
};

export type MutationUpdateDocumentArgs = {
  input: UpdateDocumentInput;
};

export type MutationUpdateFaqAnswerArgs = {
  input: UpdateFaqAnswerInput;
};

export type MutationUpdateFaqTopicArgs = {
  input: UpdateFaqTopicInput;
};

export type MutationUpdateFolderArgs = {
  input: UpdateFolderInput;
};

export type MutationUpdateGalleryArgs = {
  input: UpdateGalleryInput;
};

export type MutationUpdateImageArgs = {
  input: UpdateImageInput;
};

export type MutationUpdateMessageArgs = {
  input: UpdateMessageInput;
};

export type MutationUpdatePoolRiskScoreArgs = {
  id: Scalars['ID']['input'];
};

export type MutationUpdatePostArgs = {
  input: UpdatePostInput;
};

export type MutationUpdateQuestionAnswerArgs = {
  input: UpdateQuestionAnswerInput;
};

export type MutationUpdateQuestionTextArgs = {
  input: UpdateQuestionTextInput;
};

export type MutationUpdateTopicArgs = {
  input: UpdateTopicInput;
};

export type MutationUpdateWebhookEndpointArgs = {
  input: UpdateWebhookEndpointInput;
};

export type OhlcData = {
  __typename?: 'OhlcData';
  close: Scalars['String']['output'];
  high: Scalars['String']['output'];
  low: Scalars['String']['output'];
  open: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
};

export type OutgoingTranche = {
  __typename?: 'OutgoingTranche';
  amount: Scalars['String']['output'];
  executedAmount: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
};

export type OutgoingTrancheInput = {
  amount: Scalars['String']['input'];
  executedAmount: Scalars['String']['input'];
  timestamp: Scalars['Float']['input'];
};

export type PaginationInput = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  sort?: InputMaybe<SortFieldInput>;
};

export type ParentType = 'blog' | 'business' | 'company' | 'document' | 'image' | 'pool' | 'post';

export type ParentTypes = 'business' | 'pool';

export type Permission = {
  __typename?: 'Permission';
  createdAt: Scalars['Int']['output'];
  entity?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  permission: Scalars['String']['output'];
  updatedAt: Scalars['Int']['output'];
};

export type Pool = {
  __typename?: 'Pool';
  allowEntryBurn: Scalars['Boolean']['output'];
  approvalSignaturesTaskExpired?: Maybe<Scalars['Float']['output']>;
  approvalSignaturesTaskId?: Maybe<Scalars['String']['output']>;
  awaitCompletionExpired: Scalars['Boolean']['output'];
  awaitingBonusAmount?: Maybe<Scalars['String']['output']>;
  awaitingRwaAmount?: Maybe<Scalars['String']['output']>;
  businessId: Scalars['String']['output'];
  chainId: Scalars['String']['output'];
  completionPeriodExpired?: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['Float']['output'];
  description?: Maybe<Scalars['String']['output']>;
  entryFeePercent?: Maybe<Scalars['String']['output']>;
  entryPeriodExpired?: Maybe<Scalars['Float']['output']>;
  entryPeriodStart?: Maybe<Scalars['Float']['output']>;
  exitFeePercent?: Maybe<Scalars['String']['output']>;
  expectedBonusAmount?: Maybe<Scalars['String']['output']>;
  expectedHoldAmount?: Maybe<Scalars['String']['output']>;
  expectedRwaAmount?: Maybe<Scalars['String']['output']>;
  fileId?: Maybe<Scalars['String']['output']>;
  fixedSell: Scalars['Boolean']['output'];
  floatingOutTranchesTimestamps: Scalars['Boolean']['output'];
  floatingTimestampOffset: Scalars['Float']['output'];
  fullReturnTimestamp?: Maybe<Scalars['Float']['output']>;
  holdToken?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  image?: Maybe<Scalars['String']['output']>;
  imageUrl?: Maybe<Scalars['String']['output']>;
  incomingTranches: Array<IncomingTranche>;
  isFullyReturned: Scalars['Boolean']['output'];
  isTargetReached: Scalars['Boolean']['output'];
  k?: Maybe<Scalars['String']['output']>;
  lastCompletedIncomingTranche: Scalars['Int']['output'];
  liquidityCoefficient?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  outgoingTranches: Array<OutgoingTranche>;
  outgoingTranchesBalance?: Maybe<Scalars['String']['output']>;
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  ownerWallet?: Maybe<Scalars['String']['output']>;
  paused: Scalars['Boolean']['output'];
  poolAddress?: Maybe<Scalars['String']['output']>;
  priceImpactPercent?: Maybe<Scalars['String']['output']>;
  realHoldReserve?: Maybe<Scalars['String']['output']>;
  rewardPercent?: Maybe<Scalars['String']['output']>;
  riskScore?: Maybe<Scalars['Int']['output']>;
  riskScoreEvaluationProcess: Scalars['Boolean']['output'];
  rwaAddress: Scalars['String']['output'];
  tags?: Maybe<Array<Scalars['String']['output']>>;
  tokenId?: Maybe<Scalars['String']['output']>;
  totalClaimedAmount?: Maybe<Scalars['String']['output']>;
  totalReturnedAmount?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['Float']['output'];
  virtualHoldReserve?: Maybe<Scalars['String']['output']>;
  virtualRwaReserve?: Maybe<Scalars['String']['output']>;
};

export type PoolTransaction = {
  __typename?: 'PoolTransaction';
  bonusAmount: Scalars['String']['output'];
  bonusFee: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  holdAmount: Scalars['String']['output'];
  holdFee: Scalars['String']['output'];
  id: Scalars['String']['output'];
  poolAddress: Scalars['String']['output'];
  rwaAmount: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
  transactionType: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
  userAddress: Scalars['String']['output'];
};

export type Post = {
  __typename?: 'Post';
  blogId: Scalars['String']['output'];
  content: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  documents: Array<Scalars['String']['output']>;
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  images: Array<Scalars['String']['output']>;
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  title: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type PriceData = {
  __typename?: 'PriceData';
  blockNumber: Scalars['Float']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['String']['output'];
  poolAddress: Scalars['String']['output'];
  price: Scalars['String']['output'];
  realHoldReserve: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
  updatedAt: Scalars['Float']['output'];
  virtualHoldReserve: Scalars['String']['output'];
  virtualRwaReserve: Scalars['String']['output'];
};

export type PriceUpdateEvent = {
  __typename?: 'PriceUpdateEvent';
  poolAddress: Scalars['String']['output'];
  price: Scalars['String']['output'];
  realHoldReserve: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
  virtualHoldReserve: Scalars['String']['output'];
  virtualRwaReserve: Scalars['String']['output'];
};

export type Proposal = {
  __typename?: 'Proposal';
  canceller?: Maybe<Scalars['String']['output']>;
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  creationTime: Scalars['Float']['output'];
  data: Scalars['String']['output'];
  description: Scalars['String']['output'];
  endTime: Scalars['Float']['output'];
  executor?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  logIndex: Scalars['Float']['output'];
  proposalId: Scalars['String']['output'];
  proposer: Scalars['String']['output'];
  state: Scalars['String']['output'];
  target: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type Query = {
  __typename?: 'Query';
  _?: Maybe<Scalars['Boolean']['output']>;
  getApiKey: ApiKey;
  getApiKeys: Array<ApiKey>;
  getAssistant: Assistant;
  getBalances: Array<TokenBalance>;
  getBlog: Blog;
  getBlogs: Array<Blog>;
  getBusiness: Business;
  getBusinesses: Array<Business>;
  getCompanies: Array<Company>;
  getCompany: CompanyWithDetails;
  getDocument: Document;
  getDocuments: Array<Document>;
  getEntityReactions: EntityReactionsResponse;
  getEvaluation: Evaluation;
  getEvaluations: Array<Evaluation>;
  getFaqAnswer: FaqAnswer;
  getFaqAnswers: Array<FaqAnswer>;
  getFaqTopic: FaqTopic;
  getFaqTopics: Array<FaqTopic>;
  getFees: Array<Fees>;
  getFolder: Folder;
  getFolders: Array<Folder>;
  getGalleries: Array<Gallery>;
  getGallery: Gallery;
  getHistory: Array<FaucetRequest>;
  getImage: Image;
  getImages: Array<Image>;
  getMessage: Message;
  getMessageHistory: Array<Message>;
  getOhlcPriceData: Array<OhlcData>;
  getPool: Pool;
  getPoolTransactions: Array<PoolTransaction>;
  getPools: Array<Pool>;
  getPost: Post;
  getPosts: Array<Post>;
  getProposals: Array<Proposal>;
  getQuestion: Question;
  getQuestions: Array<Question>;
  getRawPriceData: Array<PriceData>;
  getReactions: Array<Reaction>;
  getReferrals: Array<Referral>;
  getReferrerClaimHistory: Array<ReferrerClaimHistory>;
  getReferrerWithdraws: Array<ReferrerWithdraw>;
  getSignatureTask: SignatureTask;
  getStaking: Array<Staking>;
  getStakingHistory: Array<StakingHistory>;
  getTimelockTasks: Array<TimelockTask>;
  getTopic: Topic;
  getTopics: Array<Topic>;
  getTransactions: Array<Transaction>;
  getTreasuryWithdraws: Array<TreasuryWithdraw>;
  getUnlockTime: UnlockTimeResponse;
  getUserAssistants: Array<Assistant>;
  getUserTokens: Array<RefreshToken>;
  getVolumeData: Array<VolumeData>;
  getVotes: Array<Vote>;
  getWebhookEndpoint: WebhookEndpoint;
  getWebhookEndpoints: Array<WebhookEndpoint>;
};

export type QueryGetApiKeyArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetAssistantArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetBalancesArgs = {
  input: GetBalancesInput;
};

export type QueryGetBlogArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetBlogsArgs = {
  input?: InputMaybe<GetBlogsFilterInput>;
};

export type QueryGetBusinessArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetBusinessesArgs = {
  input: FilterInput;
};

export type QueryGetCompaniesArgs = {
  input?: InputMaybe<GetCompaniesInput>;
};

export type QueryGetCompanyArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetDocumentArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetDocumentsArgs = {
  input?: InputMaybe<GetDocumentsFilterInput>;
};

export type QueryGetEntityReactionsArgs = {
  parentId: Scalars['String']['input'];
  parentType: Scalars['String']['input'];
};

export type QueryGetEvaluationArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetEvaluationsArgs = {
  input?: InputMaybe<GetEvaluationsInput>;
};

export type QueryGetFaqAnswerArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetFaqAnswersArgs = {
  input?: InputMaybe<GetFaqAnswersFilterInput>;
};

export type QueryGetFaqTopicArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetFaqTopicsArgs = {
  input?: InputMaybe<GetFaqTopicsFilterInput>;
};

export type QueryGetFeesArgs = {
  input?: InputMaybe<GetFeesFilterInput>;
};

export type QueryGetFolderArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetFoldersArgs = {
  input?: InputMaybe<GetFoldersFilterInput>;
};

export type QueryGetGalleriesArgs = {
  input?: InputMaybe<GetGalleriesFilterInput>;
};

export type QueryGetGalleryArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetHistoryArgs = {
  pagination?: InputMaybe<PaginationInput>;
};

export type QueryGetImageArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetImagesArgs = {
  input?: InputMaybe<GetImagesFilterInput>;
};

export type QueryGetMessageArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetMessageHistoryArgs = {
  assistantId: Scalars['ID']['input'];
  pagination?: InputMaybe<PaginationInput>;
};

export type QueryGetOhlcPriceDataArgs = {
  input: GetOhlcPriceDataInput;
};

export type QueryGetPoolArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetPoolTransactionsArgs = {
  input: GetPoolTransactionsInput;
};

export type QueryGetPoolsArgs = {
  input: FilterInput;
};

export type QueryGetPostArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetPostsArgs = {
  input?: InputMaybe<GetPostsFilterInput>;
};

export type QueryGetProposalsArgs = {
  input?: InputMaybe<GetProposalsFilterInput>;
};

export type QueryGetQuestionArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetQuestionsArgs = {
  input?: InputMaybe<GetQuestionsFilterInput>;
};

export type QueryGetRawPriceDataArgs = {
  input: GetRawPriceDataInput;
};

export type QueryGetReactionsArgs = {
  input: GetReactionsFilterInput;
};

export type QueryGetReferralsArgs = {
  input?: InputMaybe<GetReferralsFilterInput>;
};

export type QueryGetReferrerClaimHistoryArgs = {
  input?: InputMaybe<GetReferrerClaimHistoryFilterInput>;
};

export type QueryGetReferrerWithdrawsArgs = {
  input?: InputMaybe<GetReferrerWithdrawsFilterInput>;
};

export type QueryGetSignatureTaskArgs = {
  input: GetSignatureTaskInput;
};

export type QueryGetStakingArgs = {
  input?: InputMaybe<GetStakingFilterInput>;
};

export type QueryGetStakingHistoryArgs = {
  input?: InputMaybe<GetStakingHistoryFilterInput>;
};

export type QueryGetTimelockTasksArgs = {
  input?: InputMaybe<GetTimelockTasksFilterInput>;
};

export type QueryGetTopicArgs = {
  id: Scalars['ID']['input'];
};

export type QueryGetTopicsArgs = {
  input?: InputMaybe<GetTopicsFilterInput>;
};

export type QueryGetTransactionsArgs = {
  input: GetTransactionsInput;
};

export type QueryGetTreasuryWithdrawsArgs = {
  input?: InputMaybe<GetTreasuryWithdrawsFilterInput>;
};

export type QueryGetUserAssistantsArgs = {
  pagination?: InputMaybe<PaginationInput>;
};

export type QueryGetVolumeDataArgs = {
  input: GetVolumeDataInput;
};

export type QueryGetVotesArgs = {
  input?: InputMaybe<GetVotesFilterInput>;
};

export type QueryGetWebhookEndpointArgs = {
  id: Scalars['ID']['input'];
};

export type Question = {
  __typename?: 'Question';
  answer?: Maybe<Answer>;
  answered: Scalars['Boolean']['output'];
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  likesCount: Scalars['Int']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  text: Scalars['String']['output'];
  topicId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type Reaction = {
  __typename?: 'Reaction';
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  parentId: Scalars['String']['output'];
  parentType: Scalars['String']['output'];
  reaction: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
  userId: Scalars['String']['output'];
};

export type ReactionType = 'angry' | 'dislike' | 'haha' | 'like' | 'love' | 'sad' | 'wow';

export type Referral = {
  __typename?: 'Referral';
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  referrerId?: Maybe<Scalars['String']['output']>;
  referrerWallet?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['Float']['output'];
  userId: Scalars['String']['output'];
  userWallet: Scalars['String']['output'];
};

export type ReferrerClaimHistory = {
  __typename?: 'ReferrerClaimHistory';
  amount: Scalars['String']['output'];
  blockNumber: Scalars['Int']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  logIndex: Scalars['Int']['output'];
  referralWallet: Scalars['String']['output'];
  referrerId: Scalars['String']['output'];
  referrerWallet: Scalars['String']['output'];
  tokenAddress: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type ReferrerWithdraw = {
  __typename?: 'ReferrerWithdraw';
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  referrerId: Scalars['String']['output'];
  referrerWallet: Scalars['String']['output'];
  taskCooldown?: Maybe<Scalars['Float']['output']>;
  taskExpiredAt?: Maybe<Scalars['Float']['output']>;
  taskId?: Maybe<Scalars['String']['output']>;
  tokenAddress: Scalars['String']['output'];
  totalWithdrawnAmount: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type RefreshToken = {
  __typename?: 'RefreshToken';
  createdAt: Scalars['Int']['output'];
  expiresAt: Scalars['Int']['output'];
  tokenHash: Scalars['String']['output'];
  tokenId: Scalars['String']['output'];
  updatedAt: Scalars['Int']['output'];
  userId: Scalars['String']['output'];
};

export type RefreshTokenInput = {
  refreshToken: Scalars['String']['input'];
};

export type RegisterReferralInput = {
  referrerId?: InputMaybe<Scalars['String']['input']>;
};

export type RemoveMemberInput = {
  companyId: Scalars['ID']['input'];
  id: Scalars['ID']['input'];
};

export type RequestBusinessApprovalSignaturesInput = {
  createRWAFee: Scalars['String']['input'];
  /** @deprecated Ignored: the deployer wallet is derived server-side from the authenticated user */
  deployerWallet?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  /** @deprecated Ignored: the owner wallet is derived server-side from the entity owner */
  ownerWallet?: InputMaybe<Scalars['String']['input']>;
};

export type RequestPoolApprovalSignaturesInput = {
  createPoolFeeRatio: Scalars['String']['input'];
  /** @deprecated Ignored: the deployer wallet is derived server-side from the authenticated user */
  deployerWallet?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  /** @deprecated Ignored: the owner wallet is derived server-side from the entity owner */
  ownerWallet?: InputMaybe<Scalars['String']['input']>;
};

export type RequestTokenInput = {
  amount: Scalars['Float']['input'];
};

export type RevokePermissionInput = {
  companyId: Scalars['ID']['input'];
  id: Scalars['ID']['input'];
};

export type RevokeTokensInput = {
  tokenHashes: Array<Scalars['String']['input']>;
};

export type RevokeTokensResult = {
  __typename?: 'RevokeTokensResult';
  revokedCount: Scalars['Int']['output'];
};

export type SetReactionInput = {
  parentId: Scalars['String']['input'];
  parentType: ParentType;
  reaction: ReactionType;
};

export type Signature = {
  __typename?: 'Signature';
  signature: Scalars['String']['output'];
  signer: Scalars['String']['output'];
};

export type SignatureTask = {
  __typename?: 'SignatureTask';
  completed: Scalars['Boolean']['output'];
  expired: Scalars['Float']['output'];
  hash: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  requiredSignatures: Scalars['Int']['output'];
  signatures?: Maybe<Array<Signature>>;
};

export type SocialLink = {
  __typename?: 'SocialLink';
  type: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type SocialLinkInput = {
  type: Scalars['String']['input'];
  url: Scalars['String']['input'];
};

export type SortDirection = 'asc' | 'desc';

export type SortFieldInput = {
  direction: SortDirection;
  field: Scalars['String']['input'];
};

export type Staking = {
  __typename?: 'Staking';
  amount: Scalars['String']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  lastStakeTimestamp: Scalars['Float']['output'];
  staker: Scalars['String']['output'];
  unlockTimestamp: Scalars['Float']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type StakingHistory = {
  __typename?: 'StakingHistory';
  amount: Scalars['String']['output'];
  blockNumber?: Maybe<Scalars['Float']['output']>;
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  logIndex: Scalars['Float']['output'];
  operation: Scalars['String']['output'];
  rewards: Scalars['String']['output'];
  staker: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  _?: Maybe<Scalars['Boolean']['output']>;
  poolDeployed: Pool;
  priceUpdates: PriceUpdateEvent;
  transactionUpdates: TransactionEvent;
};

export type SubscriptionPriceUpdatesArgs = {
  poolAddress: Scalars['String']['input'];
};

export type SubscriptionTransactionUpdatesArgs = {
  poolAddress: Scalars['String']['input'];
};

export type TimelockTask = {
  __typename?: 'TimelockTask';
  blockNumber?: Maybe<Scalars['Float']['output']>;
  cancelled: Scalars['Boolean']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  data: Scalars['String']['output'];
  eta: Scalars['Float']['output'];
  executed: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  logIndex?: Maybe<Scalars['Float']['output']>;
  target: Scalars['String']['output'];
  transactionHash?: Maybe<Scalars['String']['output']>;
  txHash: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type TokenBalance = {
  __typename?: 'TokenBalance';
  balance: Scalars['Int']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  lastUpdateBlock: Scalars['Int']['output'];
  owner: Scalars['String']['output'];
  poolAddress: Scalars['String']['output'];
  tokenAddress: Scalars['String']['output'];
  tokenId: Scalars['String']['output'];
  updatedAt: Scalars['Int']['output'];
};

export type Topic = {
  __typename?: 'Topic';
  createdAt: Scalars['Float']['output'];
  creator: Scalars['String']['output'];
  grandParentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  ownerType: Scalars['String']['output'];
  parentId: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type Transaction = {
  __typename?: 'Transaction';
  amount: Scalars['Int']['output'];
  blockNumber: Scalars['Int']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Int']['output'];
  from: Scalars['String']['output'];
  id: Scalars['String']['output'];
  poolAddress: Scalars['String']['output'];
  to: Scalars['String']['output'];
  tokenAddress: Scalars['String']['output'];
  tokenId: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  updatedAt: Scalars['Int']['output'];
};

export type TransactionEvent = {
  __typename?: 'TransactionEvent';
  bonusAmount?: Maybe<Scalars['String']['output']>;
  bonusFee?: Maybe<Scalars['String']['output']>;
  holdAmount: Scalars['String']['output'];
  holdFee: Scalars['String']['output'];
  poolAddress: Scalars['String']['output'];
  rwaAmount: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
  transactionType: Scalars['String']['output'];
  userAddress: Scalars['String']['output'];
};

export type TreasuryWithdraw = {
  __typename?: 'TreasuryWithdraw';
  amount: Scalars['String']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  id: Scalars['ID']['output'];
  isNative: Scalars['Boolean']['output'];
  logIndex: Scalars['Float']['output'];
  recipient: Scalars['String']['output'];
  token: Scalars['String']['output'];
  transactionHash: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
};

export type UnlockTimeResponse = {
  __typename?: 'UnlockTimeResponse';
  gasUnlockTime: Scalars['Float']['output'];
  holdUnlockTime: Scalars['Float']['output'];
  platformUnlockTime: Scalars['Float']['output'];
};

export type UpdateApiKeyInput = {
  id: Scalars['ID']['input'];
  name: Scalars['String']['input'];
};

export type UpdateAssistantInput = {
  contextPreferences?: InputMaybe<Array<AssistantContext>>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateBlogDataInput = {
  name: Scalars['String']['input'];
};

export type UpdateBlogInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateBlogDataInput;
};

export type UpdateCompanyDataInput = {
  country?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  socials?: InputMaybe<Array<SocialLinkInput>>;
};

export type UpdateCompanyInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateCompanyDataInput;
};

export type UpdateDocumentDataInput = {
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateDocumentInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateDocumentDataInput;
};

export type UpdateFaqAnswerDataInput = {
  answer?: InputMaybe<Scalars['String']['input']>;
  order?: InputMaybe<Scalars['Int']['input']>;
  question?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateFaqAnswerInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateFaqAnswerDataInput;
};

export type UpdateFaqTopicDataInput = {
  name: Scalars['String']['input'];
};

export type UpdateFaqTopicInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateFaqTopicDataInput;
};

export type UpdateFolderDataInput = {
  name: Scalars['String']['input'];
};

export type UpdateFolderInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateFolderDataInput;
};

export type UpdateGalleryDataInput = {
  name: Scalars['String']['input'];
};

export type UpdateGalleryInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateGalleryDataInput;
};

export type UpdateImageDataInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateImageInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateImageDataInput;
};

export type UpdateMessageInput = {
  id: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};

export type UpdatePostDataInput = {
  content?: InputMaybe<Scalars['String']['input']>;
  documents?: InputMaybe<Array<Scalars['String']['input']>>;
  images?: InputMaybe<Array<Scalars['String']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type UpdatePostInput = {
  id: Scalars['ID']['input'];
  updateData: UpdatePostDataInput;
};

export type UpdateQuestionAnswerDataInput = {
  text: Scalars['String']['input'];
};

export type UpdateQuestionAnswerInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateQuestionAnswerDataInput;
};

export type UpdateQuestionTextDataInput = {
  text: Scalars['String']['input'];
};

export type UpdateQuestionTextInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateQuestionTextDataInput;
};

export type UpdateTopicDataInput = {
  name: Scalars['String']['input'];
};

export type UpdateTopicInput = {
  id: Scalars['ID']['input'];
  updateData: UpdateTopicDataInput;
};

export type UpdateWebhookEndpointInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  events?: InputMaybe<Array<Scalars['String']['input']>>;
  id: Scalars['ID']['input'];
  rateLimitPerMinute?: InputMaybe<Scalars['Int']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  createdAt: Scalars['Int']['output'];
  updatedAt: Scalars['Int']['output'];
  userId: Scalars['String']['output'];
  wallet: Scalars['String']['output'];
};

export type UserPermission = {
  __typename?: 'UserPermission';
  entity?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  permission: Scalars['String']['output'];
};

export type UserWithPermissions = {
  __typename?: 'UserWithPermissions';
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  permissions: Array<UserPermission>;
  userId: Scalars['String']['output'];
};

export type VolumeData = {
  __typename?: 'VolumeData';
  burnVolume: Scalars['String']['output'];
  mintVolume: Scalars['String']['output'];
  timestamp: Scalars['Float']['output'];
};

export type Vote = {
  __typename?: 'Vote';
  blockNumber: Scalars['Float']['output'];
  chainId: Scalars['String']['output'];
  createdAt: Scalars['Float']['output'];
  governanceAddress: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  logIndex: Scalars['Float']['output'];
  proposalId: Scalars['String']['output'];
  reason: Scalars['String']['output'];
  support: Scalars['Boolean']['output'];
  transactionHash: Scalars['String']['output'];
  updatedAt: Scalars['Float']['output'];
  voterWallet: Scalars['String']['output'];
  weight: Scalars['String']['output'];
};

export type WebhookEndpoint = {
  __typename?: 'WebhookEndpoint';
  active: Scalars['Boolean']['output'];
  createdAt: Scalars['Float']['output'];
  description?: Maybe<Scalars['String']['output']>;
  events: Array<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  rateLimitPerMinute: Scalars['Int']['output'];
  updatedAt: Scalars['Float']['output'];
  url: Scalars['String']['output'];
  userId: Scalars['String']['output'];
};

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  AddMemberInput: AddMemberInput;
  Answer: ResolverTypeWrapper<Answer>;
  ApiKey: ResolverTypeWrapper<ApiKey>;
  ApprovalSignaturesResponse: ResolverTypeWrapper<ApprovalSignaturesResponse>;
  Assistant: ResolverTypeWrapper<Assistant>;
  AssistantContext: AssistantContext;
  AuthTokens: ResolverTypeWrapper<AuthTokens>;
  AuthenticateInput: AuthenticateInput;
  Blog: ResolverTypeWrapper<Blog>;
  BlogParentTypes: BlogParentTypes;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Business: ResolverTypeWrapper<Business>;
  BusinessOwnerType: BusinessOwnerType;
  BusinessType: BusinessType;
  Company: ResolverTypeWrapper<Company>;
  CompanyWithDetails: ResolverTypeWrapper<CompanyWithDetails>;
  CreateApiKeyInput: CreateApiKeyInput;
  CreateApiKeyResult: ResolverTypeWrapper<CreateApiKeyResult>;
  CreateAssistantInput: CreateAssistantInput;
  CreateBlogInput: CreateBlogInput;
  CreateBusinessInput: CreateBusinessInput;
  CreateBusinessWithAIInput: CreateBusinessWithAiInput;
  CreateCompanyInput: CreateCompanyInput;
  CreateFaqAnswerInput: CreateFaqAnswerInput;
  CreateFaqTopicInput: CreateFaqTopicInput;
  CreateFolderInput: CreateFolderInput;
  CreateGalleryInput: CreateGalleryInput;
  CreateMessageInput: CreateMessageInput;
  CreatePoolInput: CreatePoolInput;
  CreatePoolWithAIInput: CreatePoolWithAiInput;
  CreatePostInput: CreatePostInput;
  CreateQuestionAnswerInput: CreateQuestionAnswerInput;
  CreateQuestionInput: CreateQuestionInput;
  CreateReferrerWithdrawTaskInput: CreateReferrerWithdrawTaskInput;
  CreateTopicInput: CreateTopicInput;
  CreateWebhookEndpointInput: CreateWebhookEndpointInput;
  CreateWebhookEndpointResult: ResolverTypeWrapper<CreateWebhookEndpointResult>;
  Document: ResolverTypeWrapper<Document>;
  EditBusinessDataInput: EditBusinessDataInput;
  EditBusinessInput: EditBusinessInput;
  EditPoolDataInput: EditPoolDataInput;
  EditPoolInput: EditPoolInput;
  EntityReactionsResponse: ResolverTypeWrapper<EntityReactionsResponse>;
  Evaluation: ResolverTypeWrapper<Evaluation>;
  EvaluationDocumentRef: ResolverTypeWrapper<EvaluationDocumentRef>;
  EvaluationEntityType: EvaluationEntityType;
  EvaluationFactor: ResolverTypeWrapper<EvaluationFactor>;
  EvaluationFilterInput: EvaluationFilterInput;
  EvaluationImageRef: ResolverTypeWrapper<EvaluationImageRef>;
  EvaluationSortInput: EvaluationSortInput;
  FaqAnswer: ResolverTypeWrapper<FaqAnswer>;
  FaqParentTypes: FaqParentTypes;
  FaqTopic: ResolverTypeWrapper<FaqTopic>;
  FaucetRequest: ResolverTypeWrapper<FaucetRequest>;
  FaucetTokenType: FaucetTokenType;
  Fees: ResolverTypeWrapper<Fees>;
  FilterInput: FilterInput;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  Folder: ResolverTypeWrapper<Folder>;
  Gallery: ResolverTypeWrapper<Gallery>;
  GalleryParentTypes: GalleryParentTypes;
  GetBalancesInput: GetBalancesInput;
  GetBlogsFilterInput: GetBlogsFilterInput;
  GetCompaniesInput: GetCompaniesInput;
  GetDocumentsFilterInput: GetDocumentsFilterInput;
  GetEvaluationsInput: GetEvaluationsInput;
  GetFaqAnswersFilterInput: GetFaqAnswersFilterInput;
  GetFaqTopicsFilterInput: GetFaqTopicsFilterInput;
  GetFeesFilterInput: GetFeesFilterInput;
  GetFoldersFilterInput: GetFoldersFilterInput;
  GetGalleriesFilterInput: GetGalleriesFilterInput;
  GetImagesFilterInput: GetImagesFilterInput;
  GetOhlcPriceDataInput: GetOhlcPriceDataInput;
  GetPoolTransactionsInput: GetPoolTransactionsInput;
  GetPostsFilterInput: GetPostsFilterInput;
  GetProposalsFilterInput: GetProposalsFilterInput;
  GetQuestionsFilterInput: GetQuestionsFilterInput;
  GetRawPriceDataInput: GetRawPriceDataInput;
  GetReactionsFilterInput: GetReactionsFilterInput;
  GetReferralsFilterInput: GetReferralsFilterInput;
  GetReferrerClaimHistoryFilterInput: GetReferrerClaimHistoryFilterInput;
  GetReferrerWithdrawsFilterInput: GetReferrerWithdrawsFilterInput;
  GetSignatureTaskInput: GetSignatureTaskInput;
  GetStakingFilterInput: GetStakingFilterInput;
  GetStakingHistoryFilterInput: GetStakingHistoryFilterInput;
  GetTimelockTasksFilterInput: GetTimelockTasksFilterInput;
  GetTopicsFilterInput: GetTopicsFilterInput;
  GetTransactionsInput: GetTransactionsInput;
  GetTreasuryWithdrawsFilterInput: GetTreasuryWithdrawsFilterInput;
  GetVolumeDataInput: GetVolumeDataInput;
  GetVotesFilterInput: GetVotesFilterInput;
  GrantPermissionInput: GrantPermissionInput;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  IdResponse: ResolverTypeWrapper<IdResponse>;
  Image: ResolverTypeWrapper<Image>;
  IncomingTranche: ResolverTypeWrapper<IncomingTranche>;
  IncomingTrancheInput: IncomingTrancheInput;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Member: ResolverTypeWrapper<Member>;
  Message: ResolverTypeWrapper<Message>;
  MessageSender: MessageSender;
  Mutation: ResolverTypeWrapper<{}>;
  OhlcData: ResolverTypeWrapper<OhlcData>;
  OutgoingTranche: ResolverTypeWrapper<OutgoingTranche>;
  OutgoingTrancheInput: OutgoingTrancheInput;
  PaginationInput: PaginationInput;
  ParentType: ParentType;
  ParentTypes: ParentTypes;
  Permission: ResolverTypeWrapper<Permission>;
  Pool: ResolverTypeWrapper<Pool>;
  PoolTransaction: ResolverTypeWrapper<PoolTransaction>;
  Post: ResolverTypeWrapper<Post>;
  PriceData: ResolverTypeWrapper<PriceData>;
  PriceUpdateEvent: ResolverTypeWrapper<PriceUpdateEvent>;
  Proposal: ResolverTypeWrapper<Proposal>;
  Query: ResolverTypeWrapper<{}>;
  Question: ResolverTypeWrapper<Question>;
  Reaction: ResolverTypeWrapper<Reaction>;
  ReactionType: ReactionType;
  Referral: ResolverTypeWrapper<Referral>;
  ReferrerClaimHistory: ResolverTypeWrapper<ReferrerClaimHistory>;
  ReferrerWithdraw: ResolverTypeWrapper<ReferrerWithdraw>;
  RefreshToken: ResolverTypeWrapper<RefreshToken>;
  RefreshTokenInput: RefreshTokenInput;
  RegisterReferralInput: RegisterReferralInput;
  RemoveMemberInput: RemoveMemberInput;
  RequestBusinessApprovalSignaturesInput: RequestBusinessApprovalSignaturesInput;
  RequestPoolApprovalSignaturesInput: RequestPoolApprovalSignaturesInput;
  RequestTokenInput: RequestTokenInput;
  RevokePermissionInput: RevokePermissionInput;
  RevokeTokensInput: RevokeTokensInput;
  RevokeTokensResult: ResolverTypeWrapper<RevokeTokensResult>;
  SetReactionInput: SetReactionInput;
  Signature: ResolverTypeWrapper<Signature>;
  SignatureTask: ResolverTypeWrapper<SignatureTask>;
  SocialLink: ResolverTypeWrapper<SocialLink>;
  SocialLinkInput: SocialLinkInput;
  SortDirection: SortDirection;
  SortFieldInput: SortFieldInput;
  Staking: ResolverTypeWrapper<Staking>;
  StakingHistory: ResolverTypeWrapper<StakingHistory>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Subscription: ResolverTypeWrapper<{}>;
  TimelockTask: ResolverTypeWrapper<TimelockTask>;
  TokenBalance: ResolverTypeWrapper<TokenBalance>;
  Topic: ResolverTypeWrapper<Topic>;
  Transaction: ResolverTypeWrapper<Transaction>;
  TransactionEvent: ResolverTypeWrapper<TransactionEvent>;
  TreasuryWithdraw: ResolverTypeWrapper<TreasuryWithdraw>;
  UnlockTimeResponse: ResolverTypeWrapper<UnlockTimeResponse>;
  UpdateApiKeyInput: UpdateApiKeyInput;
  UpdateAssistantInput: UpdateAssistantInput;
  UpdateBlogDataInput: UpdateBlogDataInput;
  UpdateBlogInput: UpdateBlogInput;
  UpdateCompanyDataInput: UpdateCompanyDataInput;
  UpdateCompanyInput: UpdateCompanyInput;
  UpdateDocumentDataInput: UpdateDocumentDataInput;
  UpdateDocumentInput: UpdateDocumentInput;
  UpdateFaqAnswerDataInput: UpdateFaqAnswerDataInput;
  UpdateFaqAnswerInput: UpdateFaqAnswerInput;
  UpdateFaqTopicDataInput: UpdateFaqTopicDataInput;
  UpdateFaqTopicInput: UpdateFaqTopicInput;
  UpdateFolderDataInput: UpdateFolderDataInput;
  UpdateFolderInput: UpdateFolderInput;
  UpdateGalleryDataInput: UpdateGalleryDataInput;
  UpdateGalleryInput: UpdateGalleryInput;
  UpdateImageDataInput: UpdateImageDataInput;
  UpdateImageInput: UpdateImageInput;
  UpdateMessageInput: UpdateMessageInput;
  UpdatePostDataInput: UpdatePostDataInput;
  UpdatePostInput: UpdatePostInput;
  UpdateQuestionAnswerDataInput: UpdateQuestionAnswerDataInput;
  UpdateQuestionAnswerInput: UpdateQuestionAnswerInput;
  UpdateQuestionTextDataInput: UpdateQuestionTextDataInput;
  UpdateQuestionTextInput: UpdateQuestionTextInput;
  UpdateTopicDataInput: UpdateTopicDataInput;
  UpdateTopicInput: UpdateTopicInput;
  UpdateWebhookEndpointInput: UpdateWebhookEndpointInput;
  User: ResolverTypeWrapper<User>;
  UserPermission: ResolverTypeWrapper<UserPermission>;
  UserWithPermissions: ResolverTypeWrapper<UserWithPermissions>;
  VolumeData: ResolverTypeWrapper<VolumeData>;
  Vote: ResolverTypeWrapper<Vote>;
  WebhookEndpoint: ResolverTypeWrapper<WebhookEndpoint>;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  AddMemberInput: AddMemberInput;
  Answer: Answer;
  ApiKey: ApiKey;
  ApprovalSignaturesResponse: ApprovalSignaturesResponse;
  Assistant: Assistant;
  AuthTokens: AuthTokens;
  AuthenticateInput: AuthenticateInput;
  Blog: Blog;
  Boolean: Scalars['Boolean']['output'];
  Business: Business;
  Company: Company;
  CompanyWithDetails: CompanyWithDetails;
  CreateApiKeyInput: CreateApiKeyInput;
  CreateApiKeyResult: CreateApiKeyResult;
  CreateAssistantInput: CreateAssistantInput;
  CreateBlogInput: CreateBlogInput;
  CreateBusinessInput: CreateBusinessInput;
  CreateBusinessWithAIInput: CreateBusinessWithAiInput;
  CreateCompanyInput: CreateCompanyInput;
  CreateFaqAnswerInput: CreateFaqAnswerInput;
  CreateFaqTopicInput: CreateFaqTopicInput;
  CreateFolderInput: CreateFolderInput;
  CreateGalleryInput: CreateGalleryInput;
  CreateMessageInput: CreateMessageInput;
  CreatePoolInput: CreatePoolInput;
  CreatePoolWithAIInput: CreatePoolWithAiInput;
  CreatePostInput: CreatePostInput;
  CreateQuestionAnswerInput: CreateQuestionAnswerInput;
  CreateQuestionInput: CreateQuestionInput;
  CreateReferrerWithdrawTaskInput: CreateReferrerWithdrawTaskInput;
  CreateTopicInput: CreateTopicInput;
  CreateWebhookEndpointInput: CreateWebhookEndpointInput;
  CreateWebhookEndpointResult: CreateWebhookEndpointResult;
  Document: Document;
  EditBusinessDataInput: EditBusinessDataInput;
  EditBusinessInput: EditBusinessInput;
  EditPoolDataInput: EditPoolDataInput;
  EditPoolInput: EditPoolInput;
  EntityReactionsResponse: EntityReactionsResponse;
  Evaluation: Evaluation;
  EvaluationDocumentRef: EvaluationDocumentRef;
  EvaluationFactor: EvaluationFactor;
  EvaluationFilterInput: EvaluationFilterInput;
  EvaluationImageRef: EvaluationImageRef;
  EvaluationSortInput: EvaluationSortInput;
  FaqAnswer: FaqAnswer;
  FaqTopic: FaqTopic;
  FaucetRequest: FaucetRequest;
  Fees: Fees;
  FilterInput: FilterInput;
  Float: Scalars['Float']['output'];
  Folder: Folder;
  Gallery: Gallery;
  GetBalancesInput: GetBalancesInput;
  GetBlogsFilterInput: GetBlogsFilterInput;
  GetCompaniesInput: GetCompaniesInput;
  GetDocumentsFilterInput: GetDocumentsFilterInput;
  GetEvaluationsInput: GetEvaluationsInput;
  GetFaqAnswersFilterInput: GetFaqAnswersFilterInput;
  GetFaqTopicsFilterInput: GetFaqTopicsFilterInput;
  GetFeesFilterInput: GetFeesFilterInput;
  GetFoldersFilterInput: GetFoldersFilterInput;
  GetGalleriesFilterInput: GetGalleriesFilterInput;
  GetImagesFilterInput: GetImagesFilterInput;
  GetOhlcPriceDataInput: GetOhlcPriceDataInput;
  GetPoolTransactionsInput: GetPoolTransactionsInput;
  GetPostsFilterInput: GetPostsFilterInput;
  GetProposalsFilterInput: GetProposalsFilterInput;
  GetQuestionsFilterInput: GetQuestionsFilterInput;
  GetRawPriceDataInput: GetRawPriceDataInput;
  GetReactionsFilterInput: GetReactionsFilterInput;
  GetReferralsFilterInput: GetReferralsFilterInput;
  GetReferrerClaimHistoryFilterInput: GetReferrerClaimHistoryFilterInput;
  GetReferrerWithdrawsFilterInput: GetReferrerWithdrawsFilterInput;
  GetSignatureTaskInput: GetSignatureTaskInput;
  GetStakingFilterInput: GetStakingFilterInput;
  GetStakingHistoryFilterInput: GetStakingHistoryFilterInput;
  GetTimelockTasksFilterInput: GetTimelockTasksFilterInput;
  GetTopicsFilterInput: GetTopicsFilterInput;
  GetTransactionsInput: GetTransactionsInput;
  GetTreasuryWithdrawsFilterInput: GetTreasuryWithdrawsFilterInput;
  GetVolumeDataInput: GetVolumeDataInput;
  GetVotesFilterInput: GetVotesFilterInput;
  GrantPermissionInput: GrantPermissionInput;
  ID: Scalars['ID']['output'];
  IdResponse: IdResponse;
  Image: Image;
  IncomingTranche: IncomingTranche;
  IncomingTrancheInput: IncomingTrancheInput;
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Member: Member;
  Message: Message;
  Mutation: {};
  OhlcData: OhlcData;
  OutgoingTranche: OutgoingTranche;
  OutgoingTrancheInput: OutgoingTrancheInput;
  PaginationInput: PaginationInput;
  Permission: Permission;
  Pool: Pool;
  PoolTransaction: PoolTransaction;
  Post: Post;
  PriceData: PriceData;
  PriceUpdateEvent: PriceUpdateEvent;
  Proposal: Proposal;
  Query: {};
  Question: Question;
  Reaction: Reaction;
  Referral: Referral;
  ReferrerClaimHistory: ReferrerClaimHistory;
  ReferrerWithdraw: ReferrerWithdraw;
  RefreshToken: RefreshToken;
  RefreshTokenInput: RefreshTokenInput;
  RegisterReferralInput: RegisterReferralInput;
  RemoveMemberInput: RemoveMemberInput;
  RequestBusinessApprovalSignaturesInput: RequestBusinessApprovalSignaturesInput;
  RequestPoolApprovalSignaturesInput: RequestPoolApprovalSignaturesInput;
  RequestTokenInput: RequestTokenInput;
  RevokePermissionInput: RevokePermissionInput;
  RevokeTokensInput: RevokeTokensInput;
  RevokeTokensResult: RevokeTokensResult;
  SetReactionInput: SetReactionInput;
  Signature: Signature;
  SignatureTask: SignatureTask;
  SocialLink: SocialLink;
  SocialLinkInput: SocialLinkInput;
  SortFieldInput: SortFieldInput;
  Staking: Staking;
  StakingHistory: StakingHistory;
  String: Scalars['String']['output'];
  Subscription: {};
  TimelockTask: TimelockTask;
  TokenBalance: TokenBalance;
  Topic: Topic;
  Transaction: Transaction;
  TransactionEvent: TransactionEvent;
  TreasuryWithdraw: TreasuryWithdraw;
  UnlockTimeResponse: UnlockTimeResponse;
  UpdateApiKeyInput: UpdateApiKeyInput;
  UpdateAssistantInput: UpdateAssistantInput;
  UpdateBlogDataInput: UpdateBlogDataInput;
  UpdateBlogInput: UpdateBlogInput;
  UpdateCompanyDataInput: UpdateCompanyDataInput;
  UpdateCompanyInput: UpdateCompanyInput;
  UpdateDocumentDataInput: UpdateDocumentDataInput;
  UpdateDocumentInput: UpdateDocumentInput;
  UpdateFaqAnswerDataInput: UpdateFaqAnswerDataInput;
  UpdateFaqAnswerInput: UpdateFaqAnswerInput;
  UpdateFaqTopicDataInput: UpdateFaqTopicDataInput;
  UpdateFaqTopicInput: UpdateFaqTopicInput;
  UpdateFolderDataInput: UpdateFolderDataInput;
  UpdateFolderInput: UpdateFolderInput;
  UpdateGalleryDataInput: UpdateGalleryDataInput;
  UpdateGalleryInput: UpdateGalleryInput;
  UpdateImageDataInput: UpdateImageDataInput;
  UpdateImageInput: UpdateImageInput;
  UpdateMessageInput: UpdateMessageInput;
  UpdatePostDataInput: UpdatePostDataInput;
  UpdatePostInput: UpdatePostInput;
  UpdateQuestionAnswerDataInput: UpdateQuestionAnswerDataInput;
  UpdateQuestionAnswerInput: UpdateQuestionAnswerInput;
  UpdateQuestionTextDataInput: UpdateQuestionTextDataInput;
  UpdateQuestionTextInput: UpdateQuestionTextInput;
  UpdateTopicDataInput: UpdateTopicDataInput;
  UpdateTopicInput: UpdateTopicInput;
  UpdateWebhookEndpointInput: UpdateWebhookEndpointInput;
  User: User;
  UserPermission: UserPermission;
  UserWithPermissions: UserWithPermissions;
  VolumeData: VolumeData;
  Vote: Vote;
  WebhookEndpoint: WebhookEndpoint;
}>;

export type AnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Answer'] = ResolversParentTypes['Answer'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ApiKeyResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['ApiKey'] = ResolversParentTypes['ApiKey'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  prefix?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  wallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ApprovalSignaturesResponseResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['ApprovalSignaturesResponse'] =
    ResolversParentTypes['ApprovalSignaturesResponse'],
> = ResolversObject<{
  taskId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AssistantResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Assistant'] = ResolversParentTypes['Assistant'],
> = ResolversObject<{
  contextPreferences?: Resolver<Array<ResolversTypes['AssistantContext']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type AuthTokensResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['AuthTokens'] = ResolversParentTypes['AuthTokens'],
> = ResolversObject<{
  accessToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  refreshToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  wallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type BlogResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Blog'] = ResolversParentTypes['Blog'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type BusinessResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Business'] = ResolversParentTypes['Business'],
> = ResolversObject<{
  approvalSignaturesTaskExpired?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  approvalSignaturesTaskId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  businessType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  country?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fileId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerWallet?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  paused?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  riskScore?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  riskScoreEvaluationProcess?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  socials?: Resolver<Array<ResolversTypes['SocialLink']>, ParentType, ContextType>;
  tags?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  tokenAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CompanyResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Company'] = ResolversParentTypes['Company'],
> = ResolversObject<{
  country?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  socials?: Resolver<Array<ResolversTypes['SocialLink']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CompanyWithDetailsResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['CompanyWithDetails'] = ResolversParentTypes['CompanyWithDetails'],
> = ResolversObject<{
  country?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  socials?: Resolver<Array<ResolversTypes['SocialLink']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  users?: Resolver<Array<ResolversTypes['UserWithPermissions']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CreateApiKeyResultResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['CreateApiKeyResult'] = ResolversParentTypes['CreateApiKeyResult'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  prefix?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type CreateWebhookEndpointResultResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['CreateWebhookEndpointResult'] =
    ResolversParentTypes['CreateWebhookEndpointResult'],
> = ResolversObject<{
  active?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  events?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  rateLimitPerMinute?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  secret?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type DocumentResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Document'] = ResolversParentTypes['Document'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fileId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  folderId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  mimeType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  path?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  size?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EntityReactionsResponseResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['EntityReactionsResponse'] = ResolversParentTypes['EntityReactionsResponse'],
> = ResolversObject<{
  reactions?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  userReactions?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EvaluationResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Evaluation'] = ResolversParentTypes['Evaluation'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  entityType?: Resolver<ResolversTypes['EvaluationEntityType'], ParentType, ContextType>;
  evaluatedDocuments?: Resolver<Array<ResolversTypes['EvaluationDocumentRef']>, ParentType, ContextType>;
  evaluatedImages?: Resolver<Array<ResolversTypes['EvaluationImageRef']>, ParentType, ContextType>;
  factors?: Resolver<Array<ResolversTypes['EvaluationFactor']>, ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  modelUsed?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  reasoning?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  riskScore?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  stage1Response?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  stage2Response?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EvaluationDocumentRefResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['EvaluationDocumentRef'] = ResolversParentTypes['EvaluationDocumentRef'],
> = ResolversObject<{
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  mimeType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EvaluationFactorResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['EvaluationFactor'] = ResolversParentTypes['EvaluationFactor'],
> = ResolversObject<{
  detail?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  impact?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type EvaluationImageRefResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['EvaluationImageRef'] = ResolversParentTypes['EvaluationImageRef'],
> = ResolversObject<{
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FaqAnswerResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['FaqAnswer'] = ResolversParentTypes['FaqAnswer'],
> = ResolversObject<{
  answer?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  order?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  question?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  topicId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FaqTopicResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['FaqTopic'] = ResolversParentTypes['FaqTopic'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FaucetRequestResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['FaucetRequest'] = ResolversParentTypes['FaucetRequest'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  tokenType?: Resolver<ResolversTypes['FaucetTokenType'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  wallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FeesResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Fees'] = ResolversParentTypes['Fees'],
> = ResolversObject<{
  buyCommissionAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  buyCommissionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  poolCreationCommissionAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  poolCreationCommissionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  referralRewardAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  referralRewardCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sellCommissionAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sellCommissionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tokenAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenCreationCommissionAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenCreationCommissionCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userWallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FolderResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Folder'] = ResolversParentTypes['Folder'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type GalleryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Gallery'] = ResolversParentTypes['Gallery'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type IdResponseResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['IdResponse'] = ResolversParentTypes['IdResponse'],
> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ImageResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Image'] = ResolversParentTypes['Image'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fileId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  galleryId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  mimeType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  path?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  size?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type IncomingTrancheResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['IncomingTranche'] = ResolversParentTypes['IncomingTranche'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiredAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  returnedAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MemberResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Member'] = ResolversParentTypes['Member'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MessageResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Message'] = ResolversParentTypes['Message'],
> = ResolversObject<{
  assistantId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  sender?: Resolver<ResolversTypes['MessageSender'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type MutationResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation'],
> = ResolversObject<{
  _?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  addMember?: Resolver<
    ResolversTypes['Member'],
    ParentType,
    ContextType,
    RequireFields<MutationAddMemberArgs, 'input'>
  >;
  authenticate?: Resolver<
    ResolversTypes['AuthTokens'],
    ParentType,
    ContextType,
    RequireFields<MutationAuthenticateArgs, 'input'>
  >;
  createApiKey?: Resolver<
    ResolversTypes['CreateApiKeyResult'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateApiKeyArgs, 'input'>
  >;
  createAssistant?: Resolver<
    ResolversTypes['Assistant'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateAssistantArgs, 'input'>
  >;
  createBlog?: Resolver<
    ResolversTypes['Blog'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateBlogArgs, 'input'>
  >;
  createBusiness?: Resolver<
    ResolversTypes['Business'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateBusinessArgs, 'input'>
  >;
  createBusinessWithAI?: Resolver<
    ResolversTypes['Business'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateBusinessWithAiArgs, 'input'>
  >;
  createCompany?: Resolver<
    ResolversTypes['Company'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateCompanyArgs, 'input'>
  >;
  createFaqAnswer?: Resolver<
    ResolversTypes['FaqAnswer'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateFaqAnswerArgs, 'input'>
  >;
  createFaqTopic?: Resolver<
    ResolversTypes['FaqTopic'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateFaqTopicArgs, 'input'>
  >;
  createFolder?: Resolver<
    ResolversTypes['Folder'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateFolderArgs, 'input'>
  >;
  createGallery?: Resolver<
    ResolversTypes['Gallery'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateGalleryArgs, 'input'>
  >;
  createMessage?: Resolver<
    Array<ResolversTypes['Message']>,
    ParentType,
    ContextType,
    RequireFields<MutationCreateMessageArgs, 'input'>
  >;
  createPool?: Resolver<
    ResolversTypes['Pool'],
    ParentType,
    ContextType,
    RequireFields<MutationCreatePoolArgs, 'input'>
  >;
  createPoolWithAI?: Resolver<
    ResolversTypes['Pool'],
    ParentType,
    ContextType,
    RequireFields<MutationCreatePoolWithAiArgs, 'input'>
  >;
  createPost?: Resolver<
    ResolversTypes['Post'],
    ParentType,
    ContextType,
    RequireFields<MutationCreatePostArgs, 'input'>
  >;
  createQuestion?: Resolver<
    ResolversTypes['Question'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateQuestionArgs, 'input'>
  >;
  createQuestionAnswer?: Resolver<
    ResolversTypes['Question'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateQuestionAnswerArgs, 'input'>
  >;
  createReferrerWithdrawTask?: Resolver<
    ResolversTypes['ReferrerWithdraw'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateReferrerWithdrawTaskArgs, 'input'>
  >;
  createTopic?: Resolver<
    ResolversTypes['Topic'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateTopicArgs, 'input'>
  >;
  createWebhookEndpoint?: Resolver<
    ResolversTypes['CreateWebhookEndpointResult'],
    ParentType,
    ContextType,
    RequireFields<MutationCreateWebhookEndpointArgs, 'input'>
  >;
  deleteApiKey?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeleteApiKeyArgs, 'id'>>;
  deleteAssistant?: Resolver<
    ResolversTypes['IdResponse'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteAssistantArgs, 'id'>
  >;
  deleteBlog?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeleteBlogArgs, 'id'>>;
  deleteCompany?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteCompanyArgs, 'id'>
  >;
  deleteDocument?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteDocumentArgs, 'id'>
  >;
  deleteFaqAnswer?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteFaqAnswerArgs, 'id'>
  >;
  deleteFaqTopic?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteFaqTopicArgs, 'id'>
  >;
  deleteFolder?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeleteFolderArgs, 'id'>>;
  deleteGallery?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteGalleryArgs, 'id'>
  >;
  deleteImage?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeleteImageArgs, 'id'>>;
  deleteMessage?: Resolver<
    ResolversTypes['IdResponse'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteMessageArgs, 'id'>
  >;
  deletePost?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeletePostArgs, 'id'>>;
  deleteQuestion?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteQuestionArgs, 'id'>
  >;
  deleteTopic?: Resolver<ResolversTypes['ID'], ParentType, ContextType, RequireFields<MutationDeleteTopicArgs, 'id'>>;
  deleteWebhookEndpoint?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationDeleteWebhookEndpointArgs, 'id'>
  >;
  editBusiness?: Resolver<
    ResolversTypes['Business'],
    ParentType,
    ContextType,
    RequireFields<MutationEditBusinessArgs, 'input'>
  >;
  editPool?: Resolver<ResolversTypes['Pool'], ParentType, ContextType, RequireFields<MutationEditPoolArgs, 'input'>>;
  grantPermission?: Resolver<
    ResolversTypes['Permission'],
    ParentType,
    ContextType,
    RequireFields<MutationGrantPermissionArgs, 'input'>
  >;
  refreshToken?: Resolver<
    ResolversTypes['AuthTokens'],
    ParentType,
    ContextType,
    RequireFields<MutationRefreshTokenArgs, 'input'>
  >;
  registerReferral?: Resolver<
    ResolversTypes['Referral'],
    ParentType,
    ContextType,
    RequireFields<MutationRegisterReferralArgs, 'input'>
  >;
  rejectBusinessApprovalSignatures?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationRejectBusinessApprovalSignaturesArgs, 'id'>
  >;
  rejectPoolApprovalSignatures?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationRejectPoolApprovalSignaturesArgs, 'id'>
  >;
  removeMember?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationRemoveMemberArgs, 'input'>
  >;
  requestBusinessApprovalSignatures?: Resolver<
    ResolversTypes['ApprovalSignaturesResponse'],
    ParentType,
    ContextType,
    RequireFields<MutationRequestBusinessApprovalSignaturesArgs, 'input'>
  >;
  requestGas?: Resolver<
    ResolversTypes['FaucetRequest'],
    ParentType,
    ContextType,
    RequireFields<MutationRequestGasArgs, 'input'>
  >;
  requestHold?: Resolver<
    ResolversTypes['FaucetRequest'],
    ParentType,
    ContextType,
    RequireFields<MutationRequestHoldArgs, 'input'>
  >;
  requestPlatform?: Resolver<
    ResolversTypes['FaucetRequest'],
    ParentType,
    ContextType,
    RequireFields<MutationRequestPlatformArgs, 'input'>
  >;
  requestPoolApprovalSignatures?: Resolver<
    ResolversTypes['ApprovalSignaturesResponse'],
    ParentType,
    ContextType,
    RequireFields<MutationRequestPoolApprovalSignaturesArgs, 'input'>
  >;
  resetReaction?: Resolver<
    Maybe<ResolversTypes['Reaction']>,
    ParentType,
    ContextType,
    RequireFields<MutationResetReactionArgs, 'input'>
  >;
  revokePermission?: Resolver<
    ResolversTypes['ID'],
    ParentType,
    ContextType,
    RequireFields<MutationRevokePermissionArgs, 'input'>
  >;
  revokeTokens?: Resolver<
    ResolversTypes['RevokeTokensResult'],
    ParentType,
    ContextType,
    RequireFields<MutationRevokeTokensArgs, 'input'>
  >;
  setReaction?: Resolver<
    ResolversTypes['Reaction'],
    ParentType,
    ContextType,
    RequireFields<MutationSetReactionArgs, 'input'>
  >;
  toggleQuestionLike?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationToggleQuestionLikeArgs, 'questionId'>
  >;
  updateApiKey?: Resolver<
    ResolversTypes['ApiKey'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateApiKeyArgs, 'input'>
  >;
  updateAssistant?: Resolver<
    ResolversTypes['Assistant'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateAssistantArgs, 'input'>
  >;
  updateBlog?: Resolver<
    ResolversTypes['Blog'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateBlogArgs, 'input'>
  >;
  updateBusinessRiskScore?: Resolver<
    ResolversTypes['Business'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateBusinessRiskScoreArgs, 'id'>
  >;
  updateCompany?: Resolver<
    ResolversTypes['Company'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateCompanyArgs, 'input'>
  >;
  updateDocument?: Resolver<
    ResolversTypes['Document'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateDocumentArgs, 'input'>
  >;
  updateFaqAnswer?: Resolver<
    ResolversTypes['FaqAnswer'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateFaqAnswerArgs, 'input'>
  >;
  updateFaqTopic?: Resolver<
    ResolversTypes['FaqTopic'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateFaqTopicArgs, 'input'>
  >;
  updateFolder?: Resolver<
    ResolversTypes['Folder'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateFolderArgs, 'input'>
  >;
  updateGallery?: Resolver<
    ResolversTypes['Gallery'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateGalleryArgs, 'input'>
  >;
  updateImage?: Resolver<
    ResolversTypes['Image'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateImageArgs, 'input'>
  >;
  updateMessage?: Resolver<
    ResolversTypes['Message'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateMessageArgs, 'input'>
  >;
  updatePoolRiskScore?: Resolver<
    ResolversTypes['Pool'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdatePoolRiskScoreArgs, 'id'>
  >;
  updatePost?: Resolver<
    ResolversTypes['Post'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdatePostArgs, 'input'>
  >;
  updateQuestionAnswer?: Resolver<
    ResolversTypes['Question'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateQuestionAnswerArgs, 'input'>
  >;
  updateQuestionText?: Resolver<
    ResolversTypes['Question'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateQuestionTextArgs, 'input'>
  >;
  updateTopic?: Resolver<
    ResolversTypes['Topic'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateTopicArgs, 'input'>
  >;
  updateWebhookEndpoint?: Resolver<
    ResolversTypes['WebhookEndpoint'],
    ParentType,
    ContextType,
    RequireFields<MutationUpdateWebhookEndpointArgs, 'input'>
  >;
}>;

export type OhlcDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['OhlcData'] = ResolversParentTypes['OhlcData'],
> = ResolversObject<{
  close?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  high?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  low?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  open?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type OutgoingTrancheResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['OutgoingTranche'] = ResolversParentTypes['OutgoingTranche'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  executedAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PermissionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Permission'] = ResolversParentTypes['Permission'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  entity?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  permission?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PoolResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Pool'] = ResolversParentTypes['Pool'],
> = ResolversObject<{
  allowEntryBurn?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  approvalSignaturesTaskExpired?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  approvalSignaturesTaskId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  awaitCompletionExpired?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  awaitingBonusAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  awaitingRwaAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  businessId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  completionPeriodExpired?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  entryFeePercent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  entryPeriodExpired?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  entryPeriodStart?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  exitFeePercent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  expectedBonusAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  expectedHoldAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  expectedRwaAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fileId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fixedSell?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  floatingOutTranchesTimestamps?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  floatingTimestampOffset?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  fullReturnTimestamp?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  holdToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  incomingTranches?: Resolver<Array<ResolversTypes['IncomingTranche']>, ParentType, ContextType>;
  isFullyReturned?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  isTargetReached?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  k?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastCompletedIncomingTranche?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  liquidityCoefficient?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outgoingTranches?: Resolver<Array<ResolversTypes['OutgoingTranche']>, ParentType, ContextType>;
  outgoingTranchesBalance?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerWallet?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  paused?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  poolAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  priceImpactPercent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  realHoldReserve?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rewardPercent?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  riskScore?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  riskScoreEvaluationProcess?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  rwaAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tags?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  tokenId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  totalClaimedAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  totalReturnedAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  virtualHoldReserve?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  virtualRwaReserve?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PoolTransactionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['PoolTransaction'] = ResolversParentTypes['PoolTransaction'],
> = ResolversObject<{
  bonusAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  bonusFee?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  holdAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  holdFee?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  poolAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  rwaAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  transactionType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  userAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PostResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Post'] = ResolversParentTypes['Post'],
> = ResolversObject<{
  blogId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  content?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  documents?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  images?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PriceDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['PriceData'] = ResolversParentTypes['PriceData'],
> = ResolversObject<{
  blockNumber?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  poolAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  realHoldReserve?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  virtualHoldReserve?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  virtualRwaReserve?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PriceUpdateEventResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['PriceUpdateEvent'] = ResolversParentTypes['PriceUpdateEvent'],
> = ResolversObject<{
  poolAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  realHoldReserve?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  virtualHoldReserve?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  virtualRwaReserve?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ProposalResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Proposal'] = ResolversParentTypes['Proposal'],
> = ResolversObject<{
  canceller?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creationTime?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  endTime?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  executor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  proposalId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  proposer?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  target?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = ResolversObject<{
  _?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  getApiKey?: Resolver<ResolversTypes['ApiKey'], ParentType, ContextType, RequireFields<QueryGetApiKeyArgs, 'id'>>;
  getApiKeys?: Resolver<Array<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  getAssistant?: Resolver<
    ResolversTypes['Assistant'],
    ParentType,
    ContextType,
    RequireFields<QueryGetAssistantArgs, 'id'>
  >;
  getBalances?: Resolver<
    Array<ResolversTypes['TokenBalance']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetBalancesArgs, 'input'>
  >;
  getBlog?: Resolver<ResolversTypes['Blog'], ParentType, ContextType, RequireFields<QueryGetBlogArgs, 'id'>>;
  getBlogs?: Resolver<Array<ResolversTypes['Blog']>, ParentType, ContextType, Partial<QueryGetBlogsArgs>>;
  getBusiness?: Resolver<
    ResolversTypes['Business'],
    ParentType,
    ContextType,
    RequireFields<QueryGetBusinessArgs, 'id'>
  >;
  getBusinesses?: Resolver<
    Array<ResolversTypes['Business']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetBusinessesArgs, 'input'>
  >;
  getCompanies?: Resolver<Array<ResolversTypes['Company']>, ParentType, ContextType, Partial<QueryGetCompaniesArgs>>;
  getCompany?: Resolver<
    ResolversTypes['CompanyWithDetails'],
    ParentType,
    ContextType,
    RequireFields<QueryGetCompanyArgs, 'id'>
  >;
  getDocument?: Resolver<
    ResolversTypes['Document'],
    ParentType,
    ContextType,
    RequireFields<QueryGetDocumentArgs, 'id'>
  >;
  getDocuments?: Resolver<Array<ResolversTypes['Document']>, ParentType, ContextType, Partial<QueryGetDocumentsArgs>>;
  getEntityReactions?: Resolver<
    ResolversTypes['EntityReactionsResponse'],
    ParentType,
    ContextType,
    RequireFields<QueryGetEntityReactionsArgs, 'parentId' | 'parentType'>
  >;
  getEvaluation?: Resolver<
    ResolversTypes['Evaluation'],
    ParentType,
    ContextType,
    RequireFields<QueryGetEvaluationArgs, 'id'>
  >;
  getEvaluations?: Resolver<
    Array<ResolversTypes['Evaluation']>,
    ParentType,
    ContextType,
    Partial<QueryGetEvaluationsArgs>
  >;
  getFaqAnswer?: Resolver<
    ResolversTypes['FaqAnswer'],
    ParentType,
    ContextType,
    RequireFields<QueryGetFaqAnswerArgs, 'id'>
  >;
  getFaqAnswers?: Resolver<
    Array<ResolversTypes['FaqAnswer']>,
    ParentType,
    ContextType,
    Partial<QueryGetFaqAnswersArgs>
  >;
  getFaqTopic?: Resolver<
    ResolversTypes['FaqTopic'],
    ParentType,
    ContextType,
    RequireFields<QueryGetFaqTopicArgs, 'id'>
  >;
  getFaqTopics?: Resolver<Array<ResolversTypes['FaqTopic']>, ParentType, ContextType, Partial<QueryGetFaqTopicsArgs>>;
  getFees?: Resolver<Array<ResolversTypes['Fees']>, ParentType, ContextType, Partial<QueryGetFeesArgs>>;
  getFolder?: Resolver<ResolversTypes['Folder'], ParentType, ContextType, RequireFields<QueryGetFolderArgs, 'id'>>;
  getFolders?: Resolver<Array<ResolversTypes['Folder']>, ParentType, ContextType, Partial<QueryGetFoldersArgs>>;
  getGalleries?: Resolver<Array<ResolversTypes['Gallery']>, ParentType, ContextType, Partial<QueryGetGalleriesArgs>>;
  getGallery?: Resolver<ResolversTypes['Gallery'], ParentType, ContextType, RequireFields<QueryGetGalleryArgs, 'id'>>;
  getHistory?: Resolver<Array<ResolversTypes['FaucetRequest']>, ParentType, ContextType, Partial<QueryGetHistoryArgs>>;
  getImage?: Resolver<ResolversTypes['Image'], ParentType, ContextType, RequireFields<QueryGetImageArgs, 'id'>>;
  getImages?: Resolver<Array<ResolversTypes['Image']>, ParentType, ContextType, Partial<QueryGetImagesArgs>>;
  getMessage?: Resolver<ResolversTypes['Message'], ParentType, ContextType, RequireFields<QueryGetMessageArgs, 'id'>>;
  getMessageHistory?: Resolver<
    Array<ResolversTypes['Message']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetMessageHistoryArgs, 'assistantId'>
  >;
  getOhlcPriceData?: Resolver<
    Array<ResolversTypes['OhlcData']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetOhlcPriceDataArgs, 'input'>
  >;
  getPool?: Resolver<ResolversTypes['Pool'], ParentType, ContextType, RequireFields<QueryGetPoolArgs, 'id'>>;
  getPoolTransactions?: Resolver<
    Array<ResolversTypes['PoolTransaction']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetPoolTransactionsArgs, 'input'>
  >;
  getPools?: Resolver<
    Array<ResolversTypes['Pool']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetPoolsArgs, 'input'>
  >;
  getPost?: Resolver<ResolversTypes['Post'], ParentType, ContextType, RequireFields<QueryGetPostArgs, 'id'>>;
  getPosts?: Resolver<Array<ResolversTypes['Post']>, ParentType, ContextType, Partial<QueryGetPostsArgs>>;
  getProposals?: Resolver<Array<ResolversTypes['Proposal']>, ParentType, ContextType, Partial<QueryGetProposalsArgs>>;
  getQuestion?: Resolver<
    ResolversTypes['Question'],
    ParentType,
    ContextType,
    RequireFields<QueryGetQuestionArgs, 'id'>
  >;
  getQuestions?: Resolver<Array<ResolversTypes['Question']>, ParentType, ContextType, Partial<QueryGetQuestionsArgs>>;
  getRawPriceData?: Resolver<
    Array<ResolversTypes['PriceData']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetRawPriceDataArgs, 'input'>
  >;
  getReactions?: Resolver<
    Array<ResolversTypes['Reaction']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetReactionsArgs, 'input'>
  >;
  getReferrals?: Resolver<Array<ResolversTypes['Referral']>, ParentType, ContextType, Partial<QueryGetReferralsArgs>>;
  getReferrerClaimHistory?: Resolver<
    Array<ResolversTypes['ReferrerClaimHistory']>,
    ParentType,
    ContextType,
    Partial<QueryGetReferrerClaimHistoryArgs>
  >;
  getReferrerWithdraws?: Resolver<
    Array<ResolversTypes['ReferrerWithdraw']>,
    ParentType,
    ContextType,
    Partial<QueryGetReferrerWithdrawsArgs>
  >;
  getSignatureTask?: Resolver<
    ResolversTypes['SignatureTask'],
    ParentType,
    ContextType,
    RequireFields<QueryGetSignatureTaskArgs, 'input'>
  >;
  getStaking?: Resolver<Array<ResolversTypes['Staking']>, ParentType, ContextType, Partial<QueryGetStakingArgs>>;
  getStakingHistory?: Resolver<
    Array<ResolversTypes['StakingHistory']>,
    ParentType,
    ContextType,
    Partial<QueryGetStakingHistoryArgs>
  >;
  getTimelockTasks?: Resolver<
    Array<ResolversTypes['TimelockTask']>,
    ParentType,
    ContextType,
    Partial<QueryGetTimelockTasksArgs>
  >;
  getTopic?: Resolver<ResolversTypes['Topic'], ParentType, ContextType, RequireFields<QueryGetTopicArgs, 'id'>>;
  getTopics?: Resolver<Array<ResolversTypes['Topic']>, ParentType, ContextType, Partial<QueryGetTopicsArgs>>;
  getTransactions?: Resolver<
    Array<ResolversTypes['Transaction']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetTransactionsArgs, 'input'>
  >;
  getTreasuryWithdraws?: Resolver<
    Array<ResolversTypes['TreasuryWithdraw']>,
    ParentType,
    ContextType,
    Partial<QueryGetTreasuryWithdrawsArgs>
  >;
  getUnlockTime?: Resolver<ResolversTypes['UnlockTimeResponse'], ParentType, ContextType>;
  getUserAssistants?: Resolver<
    Array<ResolversTypes['Assistant']>,
    ParentType,
    ContextType,
    Partial<QueryGetUserAssistantsArgs>
  >;
  getUserTokens?: Resolver<Array<ResolversTypes['RefreshToken']>, ParentType, ContextType>;
  getVolumeData?: Resolver<
    Array<ResolversTypes['VolumeData']>,
    ParentType,
    ContextType,
    RequireFields<QueryGetVolumeDataArgs, 'input'>
  >;
  getVotes?: Resolver<Array<ResolversTypes['Vote']>, ParentType, ContextType, Partial<QueryGetVotesArgs>>;
  getWebhookEndpoint?: Resolver<
    ResolversTypes['WebhookEndpoint'],
    ParentType,
    ContextType,
    RequireFields<QueryGetWebhookEndpointArgs, 'id'>
  >;
  getWebhookEndpoints?: Resolver<Array<ResolversTypes['WebhookEndpoint']>, ParentType, ContextType>;
}>;

export type QuestionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Question'] = ResolversParentTypes['Question'],
> = ResolversObject<{
  answer?: Resolver<Maybe<ResolversTypes['Answer']>, ParentType, ContextType>;
  answered?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  likesCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  topicId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ReactionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Reaction'] = ResolversParentTypes['Reaction'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  reaction?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ReferralResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Referral'] = ResolversParentTypes['Referral'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  referrerId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  referrerWallet?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userWallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ReferrerClaimHistoryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['ReferrerClaimHistory'] = ResolversParentTypes['ReferrerClaimHistory'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  referralWallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  referrerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  referrerWallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ReferrerWithdrawResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['ReferrerWithdraw'] = ResolversParentTypes['ReferrerWithdraw'],
> = ResolversObject<{
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  referrerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  referrerWallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  taskCooldown?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  taskExpiredAt?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  taskId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  tokenAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  totalWithdrawnAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type RefreshTokenResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['RefreshToken'] = ResolversParentTypes['RefreshToken'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tokenHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type RevokeTokensResultResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['RevokeTokensResult'] = ResolversParentTypes['RevokeTokensResult'],
> = ResolversObject<{
  revokedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SignatureResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Signature'] = ResolversParentTypes['Signature'],
> = ResolversObject<{
  signature?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  signer?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SignatureTaskResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['SignatureTask'] = ResolversParentTypes['SignatureTask'],
> = ResolversObject<{
  completed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  expired?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  hash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  requiredSignatures?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  signatures?: Resolver<Maybe<Array<ResolversTypes['Signature']>>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SocialLinkResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['SocialLink'] = ResolversParentTypes['SocialLink'],
> = ResolversObject<{
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type StakingResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Staking'] = ResolversParentTypes['Staking'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lastStakeTimestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  staker?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  unlockTimestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type StakingHistoryResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['StakingHistory'] = ResolversParentTypes['StakingHistory'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  blockNumber?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  operation?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  rewards?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  staker?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SubscriptionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription'],
> = ResolversObject<{
  _?: SubscriptionResolver<Maybe<ResolversTypes['Boolean']>, '_', ParentType, ContextType>;
  poolDeployed?: SubscriptionResolver<ResolversTypes['Pool'], 'poolDeployed', ParentType, ContextType>;
  priceUpdates?: SubscriptionResolver<
    ResolversTypes['PriceUpdateEvent'],
    'priceUpdates',
    ParentType,
    ContextType,
    RequireFields<SubscriptionPriceUpdatesArgs, 'poolAddress'>
  >;
  transactionUpdates?: SubscriptionResolver<
    ResolversTypes['TransactionEvent'],
    'transactionUpdates',
    ParentType,
    ContextType,
    RequireFields<SubscriptionTransactionUpdatesArgs, 'poolAddress'>
  >;
}>;

export type TimelockTaskResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['TimelockTask'] = ResolversParentTypes['TimelockTask'],
> = ResolversObject<{
  blockNumber?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  cancelled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  eta?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  executed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logIndex?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  target?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactionHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  txHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TokenBalanceResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['TokenBalance'] = ResolversParentTypes['TokenBalance'],
> = ResolversObject<{
  balance?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdateBlock?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  poolAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TopicResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Topic'] = ResolversParentTypes['Topic'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  creator?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grandParentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ownerType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  parentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Transaction'] = ResolversParentTypes['Transaction'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  from?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  poolAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  to?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tokenId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TransactionEventResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['TransactionEvent'] = ResolversParentTypes['TransactionEvent'],
> = ResolversObject<{
  bonusAmount?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  bonusFee?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  holdAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  holdFee?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  poolAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  rwaAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  transactionType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type TreasuryWithdrawResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['TreasuryWithdraw'] = ResolversParentTypes['TreasuryWithdraw'],
> = ResolversObject<{
  amount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isNative?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  recipient?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UnlockTimeResponseResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['UnlockTimeResponse'] = ResolversParentTypes['UnlockTimeResponse'],
> = ResolversObject<{
  gasUnlockTime?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  holdUnlockTime?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  platformUnlockTime?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UserResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User'],
> = ResolversObject<{
  createdAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  wallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UserPermissionResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['UserPermission'] = ResolversParentTypes['UserPermission'],
> = ResolversObject<{
  entity?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  permission?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type UserWithPermissionsResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['UserWithPermissions'] = ResolversParentTypes['UserWithPermissions'],
> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  permissions?: Resolver<Array<ResolversTypes['UserPermission']>, ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type VolumeDataResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['VolumeData'] = ResolversParentTypes['VolumeData'],
> = ResolversObject<{
  burnVolume?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  mintVolume?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  timestamp?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type VoteResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['Vote'] = ResolversParentTypes['Vote'],
> = ResolversObject<{
  blockNumber?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  chainId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  governanceAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  logIndex?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  proposalId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  reason?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  support?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  voterWallet?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  weight?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type WebhookEndpointResolvers<
  ContextType = GraphQLContext,
  ParentType extends ResolversParentTypes['WebhookEndpoint'] = ResolversParentTypes['WebhookEndpoint'],
> = ResolversObject<{
  active?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  events?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  rateLimitPerMinute?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  userId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = GraphQLContext> = ResolversObject<{
  Answer?: AnswerResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  ApprovalSignaturesResponse?: ApprovalSignaturesResponseResolvers<ContextType>;
  Assistant?: AssistantResolvers<ContextType>;
  AuthTokens?: AuthTokensResolvers<ContextType>;
  Blog?: BlogResolvers<ContextType>;
  Business?: BusinessResolvers<ContextType>;
  Company?: CompanyResolvers<ContextType>;
  CompanyWithDetails?: CompanyWithDetailsResolvers<ContextType>;
  CreateApiKeyResult?: CreateApiKeyResultResolvers<ContextType>;
  CreateWebhookEndpointResult?: CreateWebhookEndpointResultResolvers<ContextType>;
  Document?: DocumentResolvers<ContextType>;
  EntityReactionsResponse?: EntityReactionsResponseResolvers<ContextType>;
  Evaluation?: EvaluationResolvers<ContextType>;
  EvaluationDocumentRef?: EvaluationDocumentRefResolvers<ContextType>;
  EvaluationFactor?: EvaluationFactorResolvers<ContextType>;
  EvaluationImageRef?: EvaluationImageRefResolvers<ContextType>;
  FaqAnswer?: FaqAnswerResolvers<ContextType>;
  FaqTopic?: FaqTopicResolvers<ContextType>;
  FaucetRequest?: FaucetRequestResolvers<ContextType>;
  Fees?: FeesResolvers<ContextType>;
  Folder?: FolderResolvers<ContextType>;
  Gallery?: GalleryResolvers<ContextType>;
  IdResponse?: IdResponseResolvers<ContextType>;
  Image?: ImageResolvers<ContextType>;
  IncomingTranche?: IncomingTrancheResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  Member?: MemberResolvers<ContextType>;
  Message?: MessageResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OhlcData?: OhlcDataResolvers<ContextType>;
  OutgoingTranche?: OutgoingTrancheResolvers<ContextType>;
  Permission?: PermissionResolvers<ContextType>;
  Pool?: PoolResolvers<ContextType>;
  PoolTransaction?: PoolTransactionResolvers<ContextType>;
  Post?: PostResolvers<ContextType>;
  PriceData?: PriceDataResolvers<ContextType>;
  PriceUpdateEvent?: PriceUpdateEventResolvers<ContextType>;
  Proposal?: ProposalResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Question?: QuestionResolvers<ContextType>;
  Reaction?: ReactionResolvers<ContextType>;
  Referral?: ReferralResolvers<ContextType>;
  ReferrerClaimHistory?: ReferrerClaimHistoryResolvers<ContextType>;
  ReferrerWithdraw?: ReferrerWithdrawResolvers<ContextType>;
  RefreshToken?: RefreshTokenResolvers<ContextType>;
  RevokeTokensResult?: RevokeTokensResultResolvers<ContextType>;
  Signature?: SignatureResolvers<ContextType>;
  SignatureTask?: SignatureTaskResolvers<ContextType>;
  SocialLink?: SocialLinkResolvers<ContextType>;
  Staking?: StakingResolvers<ContextType>;
  StakingHistory?: StakingHistoryResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
  TimelockTask?: TimelockTaskResolvers<ContextType>;
  TokenBalance?: TokenBalanceResolvers<ContextType>;
  Topic?: TopicResolvers<ContextType>;
  Transaction?: TransactionResolvers<ContextType>;
  TransactionEvent?: TransactionEventResolvers<ContextType>;
  TreasuryWithdraw?: TreasuryWithdrawResolvers<ContextType>;
  UnlockTimeResponse?: UnlockTimeResponseResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserPermission?: UserPermissionResolvers<ContextType>;
  UserWithPermissions?: UserWithPermissionsResolvers<ContextType>;
  VolumeData?: VolumeDataResolvers<ContextType>;
  Vote?: VoteResolvers<ContextType>;
  WebhookEndpoint?: WebhookEndpointResolvers<ContextType>;
}>;
