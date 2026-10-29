import { expect, test, describe, beforeAll } from "bun:test";
import { ethers, HDNodeWallet } from "ethers";
import { makeGraphQLRequest } from "./utils/graphql/makeGraphQLRequest";
import { CREATE_ASSISTANT, GET_ASSISTANT, GET_USER_ASSISTANTS, UPDATE_ASSISTANT, CREATE_MESSAGE, GET_MESSAGE_HISTORY, GET_MESSAGE, UPDATE_MESSAGE, DELETE_ASSISTANT, DELETE_MESSAGE } from "./utils/graphql/schema/ai-assistant";
import { authenticate } from "./utils/authenticate";

describe("AI Assistant Flow Tests", () => {
  let wallet: HDNodeWallet
  let accessToken: string;
  let userId: string;
  let assistantId: string;
  let userMessageId: string;
  let aiMessageId: string;

  beforeAll(async () => {
    wallet = ethers.Wallet.createRandom();
    ({ accessToken, userId } = await authenticate(wallet))
  })

  test("should create an assistant", async () => {
    const result = await makeGraphQLRequest(
      CREATE_ASSISTANT,
      {
        input: {
          name: "Test Assistant",
          contextPreferences: ["investor_base", "popular_pools"],
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.createAssistant).toBeDefined();
    expect(result.data.createAssistant.userId).toBe(userId);
    expect(result.data.createAssistant.name).toBe("Test Assistant");
    expect(result.data.createAssistant.contextPreferences).toEqual([
      "investor_base",
      "popular_pools",
    ]);

    assistantId = result.data.createAssistant.id;
  });

  test("should get assistant by id", async () => {
    const result = await makeGraphQLRequest(
      GET_ASSISTANT,
      {
        id: assistantId,
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getAssistant).toBeDefined();
    expect(result.data.getAssistant.id).toBe(assistantId);
    expect(result.data.getAssistant.userId).toBe(userId);

    // Test get user assistants
    const assistantsResult = await makeGraphQLRequest(
      GET_USER_ASSISTANTS,
      {
        pagination: {
          limit: 10,
          offset: 0,
        },
      },
      accessToken
    );

    expect(assistantsResult.errors).toBeUndefined();
    expect(assistantsResult.data.getUserAssistants).toBeDefined();
    expect(Array.isArray(assistantsResult.data.getUserAssistants)).toBe(true);
    expect(assistantsResult.data.getUserAssistants.length).toBe(1); // We just created one assistant
    expect(assistantsResult.data.getUserAssistants[0].id).toBe(assistantId);
    expect(assistantsResult.data.getUserAssistants[0].userId).toBe(userId);
  });

  test("should update assistant", async () => {
    const result = await makeGraphQLRequest(
      UPDATE_ASSISTANT,
      {
        input: {
          id: assistantId,
          name: "Updated Assistant",
          contextPreferences: ["product_owner_base", "user_portfolio"],
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.updateAssistant).toBeDefined();
    expect(result.data.updateAssistant.name).toBe("Updated Assistant");
    expect(result.data.updateAssistant.contextPreferences).toEqual([
      "product_owner_base",
      "user_portfolio",
    ]);
  });

  test("should create a message", async () => {
    const result = await makeGraphQLRequest(
      CREATE_MESSAGE,
      {
        input: {
          assistantId,
          text: "Hello, assistant!",
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.createMessage).toBeDefined();
    expect(Array.isArray(result.data.createMessage)).toBe(true);
    expect(result.data.createMessage.length).toBe(2);

    // Check user message
    const userMessage = result.data.createMessage[0];
    expect(userMessage.assistantId).toBe(assistantId);
    expect(userMessage.text).toBe("Hello, assistant!");
    expect(userMessage.sender).toBe("user");
    userMessageId = userMessage.id;

    // Check AI response
    const aiMessage = result.data.createMessage[1];
    expect(aiMessage.assistantId).toBe(assistantId);
    expect(typeof aiMessage.text).toBe("string");
    expect(aiMessage.sender).toBe("assistant");
    aiMessageId = aiMessage.id;
  });

  test("should get message history", async () => {
    const result = await makeGraphQLRequest(
      GET_MESSAGE_HISTORY,
      {
        assistantId,
        pagination: {
          limit: 10,
          offset: 0,
        },
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getMessageHistory).toBeDefined();
    expect(Array.isArray(result.data.getMessageHistory)).toBe(true);
    expect(result.data.getMessageHistory.length).toBe(2); // User message and AI response

    // Check messages order
    const messages = result.data.getMessageHistory;
    expect(messages[1].text).toBe("Hello, assistant!"); // User message
    expect(messages[1].sender).toBe("user");
    expect(typeof messages[0].text).toBe("string"); // AI response
    expect(messages[0].sender).toBe("assistant");
  });

  test("should get user message by id", async () => {
    const result = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: userMessageId,
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getMessage).toBeDefined();
    expect(result.data.getMessage.id).toBe(userMessageId);
    expect(result.data.getMessage.text).toBe("Hello, assistant!");
    expect(result.data.getMessage.sender).toBe("user");
  });

  test("should get AI message by id", async () => {
    const result = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: aiMessageId,
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getMessage).toBeDefined();
    expect(result.data.getMessage.id).toBe(aiMessageId);
    expect(typeof result.data.getMessage.text).toBe("string");
    expect(result.data.getMessage.sender).toBe("assistant");
  });

  test("should update user message", async () => {
    const updateResult = await makeGraphQLRequest(
      UPDATE_MESSAGE,
      {
        input: {
          id: userMessageId,
          text: "Updated user message",
        },
      },
      accessToken
    );

    expect(updateResult.errors).toBeUndefined();
    expect(updateResult.data.updateMessage).toBeDefined();
    expect(updateResult.data.updateMessage.id).toBe(userMessageId);
    expect(updateResult.data.updateMessage.text).toBe("Updated user message");
    expect(updateResult.data.updateMessage.sender).toBe("user");

    // Verify update
    const result = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: userMessageId,
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getMessage.text).toBe("Updated user message");
  });

  test("should update AI message", async () => {
    const updateResult = await makeGraphQLRequest(
      UPDATE_MESSAGE,
      {
        input: {
          id: aiMessageId,
          text: "Updated AI message",
        },
      },
      accessToken
    );

    expect(updateResult.errors).toBeUndefined();
    expect(updateResult.data.updateMessage).toBeDefined();
    expect(updateResult.data.updateMessage.id).toBe(aiMessageId);
    expect(updateResult.data.updateMessage.text).toBe("Updated AI message");
    expect(updateResult.data.updateMessage.sender).toBe("assistant");

    // Verify update
    const result = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: aiMessageId,
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.getMessage.text).toBe("Updated AI message");
  });

  test("should fail operations without auth", async () => {
    // Test create assistant
    let result = await makeGraphQLRequest(CREATE_ASSISTANT, {
      input: {
        name: "Test Assistant",
        contextPreferences: ["investor_base", "popular_pools"],
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test get assistant
    result = await makeGraphQLRequest(GET_ASSISTANT, {
      id: assistantId,
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test update assistant
    result = await makeGraphQLRequest(UPDATE_ASSISTANT, {
      input: {
        id: assistantId,
        name: "Updated Name",
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test create message
    result = await makeGraphQLRequest(CREATE_MESSAGE, {
      input: {
        assistantId,
        text: "Test message",
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test get message
    result = await makeGraphQLRequest(GET_MESSAGE, {
      id: userMessageId,
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test get message history
    result = await makeGraphQLRequest(GET_MESSAGE_HISTORY, {
      assistantId,
      pagination: {
        limit: 10,
        offset: 0,
      },
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");

    // Test delete assistant
    result = await makeGraphQLRequest(DELETE_ASSISTANT, {
      id: assistantId,
    });
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe("Authentication required");
  });

  test("should fail operations with wrong user", async () => {
    // Create another user
    const wallet2 = ethers.Wallet.createRandom();
    
    const auth2 = await authenticate(wallet2)
   
    const accessToken2 = auth2.accessToken;

    // Try to access first user's assistant
    let result = await makeGraphQLRequest(
      GET_ASSISTANT,
      {
        id: assistantId,
      },
      accessToken2
    );
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe(
      "Access denied: Assistant does not belong to the current user"
    );

    // Try to update first user's assistant
    result = await makeGraphQLRequest(
      UPDATE_ASSISTANT,
      {
        input: {
          id: assistantId,
          name: "Hacked Assistant",
        },
      },
      accessToken2
    );
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe(
      "Access denied: Assistant does not belong to the current user"
    );

    // Try to delete first user's assistant
    result = await makeGraphQLRequest(
      DELETE_ASSISTANT,
      {
        id: assistantId,
      },
      accessToken2
    );
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe(
      "Access denied: Assistant does not belong to the current user"
    );

    // Try to access first user's message
    result = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: userMessageId,
      },
      accessToken2
    );
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe(
      "Access denied: Message does not belong to the current user"
    );

    // Try to get message history of first user's assistant
    result = await makeGraphQLRequest(
      GET_MESSAGE_HISTORY,
      {
        assistantId,
        pagination: {
          limit: 10,
          offset: 0,
        },
      },
      accessToken2
    );
    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBe(
      "Access denied: Assistant does not belong to the current user"
    );
  });

  test("should delete user message", async () => {
    const deleteResult = await makeGraphQLRequest(
      DELETE_MESSAGE,
      {
        id: userMessageId,
      },
      accessToken
    );

    expect(deleteResult.errors).toBeUndefined();
    expect(deleteResult.data.deleteMessage).toBeDefined();
    expect(deleteResult.data.deleteMessage.id).toBe(userMessageId);

    // Verify message was deleted
    const getMsgResult = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: userMessageId,
      },
      accessToken
    );

    expect(getMsgResult.errors).toBeDefined();
    expect(getMsgResult.errors[0].message).toBeDefined();
  });

  test("should delete AI message", async () => {
    const deleteResult = await makeGraphQLRequest(
      DELETE_MESSAGE,
      {
        id: aiMessageId,
      },
      accessToken
    );

    expect(deleteResult.errors).toBeUndefined();
    expect(deleteResult.data.deleteMessage).toBeDefined();
    expect(deleteResult.data.deleteMessage.id).toBe(aiMessageId);

    // Verify message was deleted
    const getMsgResult = await makeGraphQLRequest(
      GET_MESSAGE,
      {
        id: aiMessageId,
      },
      accessToken
    );

    expect(getMsgResult.errors).toBeDefined();
    expect(getMsgResult.errors[0].message).toBeDefined();
  });

  test("should delete assistant", async () => {
    const result = await makeGraphQLRequest(
      DELETE_ASSISTANT,
      {
        id: assistantId,
      },
      accessToken
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.deleteAssistant).toBeDefined();
    expect(result.data.deleteAssistant.id).toBe(assistantId);
  });

  test("should fail to get deleted assistant", async () => {
    const result = await makeGraphQLRequest(
      GET_ASSISTANT,
      {
        id: assistantId,
      },
      accessToken
    );

    expect(result.errors).toBeDefined();
    expect(result.errors[0].message).toBeDefined();
  });
});
