export const GET_EVALUATION = `
  query GetEvaluation($id: ID!) {
    getEvaluation(id: $id) {
      id
      entityType
      parentId
      grandParentId
      ownerId
      ownerType
      riskScore
      reasoning
      factors {
        name
        impact
        detail
      }
      stage1Response
      stage2Response
      evaluatedDocuments {
        id
        name
        mimeType
      }
      evaluatedImages {
        id
        name
      }
      modelUsed
      createdAt
      updatedAt
    }
  }
`;

export const GET_EVALUATIONS = `
  query GetEvaluations($input: GetEvaluationsInput) {
    getEvaluations(input: $input) {
      id
      entityType
      parentId
      riskScore
      reasoning
      factors {
        name
        impact
        detail
      }
      stage1Response
      stage2Response
      evaluatedDocuments {
        id
        name
        mimeType
      }
      evaluatedImages {
        id
        name
      }
      modelUsed
      createdAt
      updatedAt
    }
  }
`;
