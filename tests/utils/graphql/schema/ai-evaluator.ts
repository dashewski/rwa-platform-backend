export const GET_EVALUATION = `
  query GetEvaluation($id: ID!) {
    getEvaluation(id: $id) {
      id
      entityType
      parentId
      grandParentId
      ownerId
      ownerType
      summary
      sources {
        type
        id
        name
        mimeType
      }
      risk {
        score
        pros
        cons
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
      summary
      sources {
        type
        id
        name
        mimeType
      }
      risk {
        score
        pros
        cons
      }
      modelUsed
      createdAt
      updatedAt
    }
  }
`;
