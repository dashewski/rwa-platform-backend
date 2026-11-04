import { gql } from "graphql-request";

// Business Queries
export const GET_BUSINESS = gql`
  query GetBusiness($id: ID!) {
    getBusiness(id: $id) {
      id
      chainId
      name
      ownerId
      ownerType
      ownerWallet
      tokenAddress
      description
      tags
      riskScore
      image
      imageUrl
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired
      country
      businessType
      socials {
        type
        url
      }
      paused
      createdAt
      updatedAt
    }
  }
`;

export const GET_BUSINESSES = gql`
  query GetBusinesses($input: FilterInput!) {
    getBusinesses(input: $input) {
      id
      chainId
      name
      ownerId
      ownerType
      ownerWallet
      tokenAddress
      description
      tags
      riskScore
      image
      imageUrl
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired
      country
      businessType
      socials {
        type
        url
      }
      paused
      createdAt
      updatedAt
    }
  }
`;

// Business Mutations
export const CREATE_BUSINESS_WITH_AI = gql`
  mutation CreateBusinessWithAI($input: CreateBusinessWithAIInput!) {
    createBusinessWithAI(input: $input) {
      id
      chainId
      name
      ownerId
      ownerType
      ownerWallet
      tokenAddress
      description
      tags
      riskScore
      image
      imageUrl
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired
      country
      businessType
      socials {
        type
        url
      }
      paused
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_BUSINESS = gql`
  mutation CreateBusiness($input: CreateBusinessInput!) {
    createBusiness(input: $input) {
      id
      chainId
      name
      ownerId
      ownerType
      ownerWallet
      tokenAddress
      description
      tags
      riskScore
      image
      imageUrl
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired
      country
      businessType
      socials {
        type
        url
      }
      paused
      createdAt
      updatedAt
    }
  }
`;

export const EDIT_BUSINESS = gql`
  mutation EditBusiness($input: EditBusinessInput!) {
    editBusiness(input: $input) {
      id
      chainId
      name
      ownerId
      ownerType
      ownerWallet
      tokenAddress
      description
      tags
      riskScore
      image
      imageUrl
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired
      country
      businessType
      socials {
        type
        url
      }
      paused
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_BUSINESS_RISK_SCORE = gql`
  mutation UpdateBusinessRiskScore($id: ID!) {
    updateBusinessRiskScore(id: $id)
  }
`;

export const REQUEST_BUSINESS_APPROVAL_SIGNATURES = gql`
  mutation RequestBusinessApprovalSignatures($input: RequestBusinessApprovalSignaturesInput!) {
    requestBusinessApprovalSignatures(input: $input) {
      taskId
    }
  }
`;

export const REJECT_BUSINESS_APPROVAL_SIGNATURES = gql`
  mutation RejectBusinessApprovalSignatures($id: ID!) {
    rejectBusinessApprovalSignatures(id: $id)
  }
`;

// Pool Queries
export const GET_POOL = gql`
  query GetPool($id: ID!) {
    getPool(id: $id) {
      id
      ownerId
      ownerType
      ownerWallet
      name
      businessId
      description
      chainId
      tags
      riskScore

      # Contract Addresses
      rwaAddress
      poolAddress
      holdToken
      tokenId
      image
      imageUrl

      # Pool Configuration
      entryFeePercent
      exitFeePercent
      expectedHoldAmount
      expectedRwaAmount
      expectedBonusAmount
      rewardPercent
      priceImpactPercent
      liquidityCoefficient

      # Pool Flags
      awaitCompletionExpired
      floatingOutTranchesTimestamps
      fixedSell
      allowEntryBurn
      paused

      # Time Periods
      entryPeriodStart
      entryPeriodExpired
      completionPeriodExpired
      floatingTimestampOffset
      fullReturnTimestamp

      # Pool State
      k
      realHoldReserve
      virtualHoldReserve
      virtualRwaReserve
      isTargetReached
      isFullyReturned

      # Amounts
      totalClaimedAmount
      totalReturnedAmount
      awaitingBonusAmount
      awaitingRwaAmount
      outgoingTranchesBalance

      # Tranches
      outgoingTranches {
        amount
        timestamp
        executedAmount
      }
      incomingTranches {
        amount
        expiredAt
        returnedAmount
      }
      lastCompletedIncomingTranche

      # Approval
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired

      # Timestamps
      createdAt
      updatedAt
    }
  }
`;

export const GET_POOLS = gql`
  query GetPools($input: FilterInput!) {
    getPools(input: $input) {
      id
      ownerId
      ownerType
      ownerWallet
      name
      businessId
      description
      chainId
      tags
      riskScore

      # Contract Addresses
      rwaAddress
      poolAddress
      holdToken
      tokenId
      image
      imageUrl

      # Pool Configuration
      entryFeePercent
      exitFeePercent
      expectedHoldAmount
      expectedRwaAmount
      expectedBonusAmount
      rewardPercent
      priceImpactPercent
      liquidityCoefficient

      # Pool Flags
      awaitCompletionExpired
      floatingOutTranchesTimestamps
      fixedSell
      allowEntryBurn
      paused

      # Time Periods
      entryPeriodStart
      entryPeriodExpired
      completionPeriodExpired
      floatingTimestampOffset
      fullReturnTimestamp

      # Pool State
      k
      realHoldReserve
      virtualHoldReserve
      virtualRwaReserve
      isTargetReached
      isFullyReturned

      # Amounts
      totalClaimedAmount
      totalReturnedAmount
      awaitingBonusAmount
      awaitingRwaAmount
      outgoingTranchesBalance

      # Tranches
      outgoingTranches {
        amount
        timestamp
        executedAmount
      }
      incomingTranches {
        amount
        expiredAt
        returnedAmount
      }
      lastCompletedIncomingTranche

      # Approval
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired

      # Timestamps
      createdAt
      updatedAt
    }
  }
`;

// Pool Mutations
export const CREATE_POOL_WITH_AI = gql`
  mutation CreatePoolWithAI($input: CreatePoolWithAIInput!) {
    createPoolWithAI(input: $input) {
      id
      ownerId
      ownerType
      ownerWallet
      name
      businessId
      description
      chainId
      tags
      riskScore

      # Contract Addresses
      rwaAddress
      poolAddress
      holdToken
      tokenId

      # Pool Configuration
      entryFeePercent
      exitFeePercent
      expectedHoldAmount
      expectedRwaAmount
      expectedBonusAmount
      rewardPercent
      priceImpactPercent
      liquidityCoefficient

      # Pool Flags
      awaitCompletionExpired
      floatingOutTranchesTimestamps
      fixedSell
      allowEntryBurn
      paused

      # Time Periods
      entryPeriodStart
      entryPeriodExpired
      completionPeriodExpired
      floatingTimestampOffset
      fullReturnTimestamp

      # Pool State
      k
      realHoldReserve
      virtualHoldReserve
      virtualRwaReserve
      isTargetReached
      isFullyReturned

      # Amounts
      totalClaimedAmount
      totalReturnedAmount
      awaitingBonusAmount
      awaitingRwaAmount
      outgoingTranchesBalance

      # Tranches
      outgoingTranches {
        amount
        timestamp
        executedAmount
      }
      incomingTranches {
        amount
        expiredAt
        returnedAmount
      }
      lastCompletedIncomingTranche

      # Approval
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired

      # Timestamps
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_POOL = gql`
  mutation CreatePool($input: CreatePoolInput!) {
    createPool(input: $input) {
      id
      ownerId
      ownerType
      ownerWallet
      name
      businessId
      description
      chainId
      tags
      riskScore

      # Contract Addresses
      rwaAddress
      poolAddress
      holdToken
      tokenId

      # Pool Configuration
      entryFeePercent
      exitFeePercent
      expectedHoldAmount
      expectedRwaAmount
      expectedBonusAmount
      rewardPercent
      priceImpactPercent
      liquidityCoefficient

      # Pool Flags
      awaitCompletionExpired
      floatingOutTranchesTimestamps
      fixedSell
      allowEntryBurn
      paused

      # Time Periods
      entryPeriodStart
      entryPeriodExpired
      completionPeriodExpired
      floatingTimestampOffset
      fullReturnTimestamp

      # Pool State
      k
      realHoldReserve
      virtualHoldReserve
      virtualRwaReserve
      isTargetReached
      isFullyReturned

      # Amounts
      totalClaimedAmount
      totalReturnedAmount
      awaitingBonusAmount
      awaitingRwaAmount
      outgoingTranchesBalance

      # Tranches
      outgoingTranches {
        amount
        timestamp
        executedAmount
      }
      incomingTranches {
        amount
        expiredAt
        returnedAmount
      }
      lastCompletedIncomingTranche

      # Approval
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired

      # Timestamps
      createdAt
      updatedAt
    }
  }
`;

export const EDIT_POOL = gql`
  mutation EditPool($input: EditPoolInput!) {
    editPool(input: $input) {
      id
      ownerId
      ownerType
      ownerWallet
      name
      businessId
      description
      chainId
      tags
      riskScore

      # Contract Addresses
      rwaAddress
      poolAddress
      holdToken
      tokenId

      # Pool Configuration
      entryFeePercent
      exitFeePercent
      expectedHoldAmount
      expectedRwaAmount
      expectedBonusAmount
      rewardPercent
      priceImpactPercent
      liquidityCoefficient

      # Pool Flags
      awaitCompletionExpired
      floatingOutTranchesTimestamps
      fixedSell
      allowEntryBurn
      paused

      # Time Periods
      entryPeriodStart
      entryPeriodExpired
      completionPeriodExpired
      floatingTimestampOffset
      fullReturnTimestamp

      # Pool State
      k
      realHoldReserve
      virtualHoldReserve
      virtualRwaReserve
      isTargetReached
      isFullyReturned

      # Amounts
      totalClaimedAmount
      totalReturnedAmount
      awaitingBonusAmount
      awaitingRwaAmount
      outgoingTranchesBalance

      # Tranches
      outgoingTranches {
        amount
        timestamp
        executedAmount
      }
      incomingTranches {
        amount
        expiredAt
        returnedAmount
      }
      lastCompletedIncomingTranche

      # Approval
      approvalSignaturesTaskId
      approvalSignaturesTaskExpired

      # Timestamps
      createdAt
      updatedAt
    }
  }
`;

export const UPDATE_POOL_RISK_SCORE = gql`
  mutation UpdatePoolRiskScore($id: ID!) {
    updatePoolRiskScore(id: $id)
  }
`;

export const REQUEST_POOL_APPROVAL_SIGNATURES = gql`
  mutation RequestPoolApprovalSignatures($input: RequestPoolApprovalSignaturesInput!) {
    requestPoolApprovalSignatures(input: $input) {
      taskId
    }
  }
`;

export const REJECT_POOL_APPROVAL_SIGNATURES = gql`
  mutation RejectPoolApprovalSignatures($id: ID!) {
    rejectPoolApprovalSignatures(id: $id)
  }
`;
