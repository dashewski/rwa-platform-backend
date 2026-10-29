import { expect, test, describe, beforeAll } from "bun:test";
import { ethers, HDNodeWallet, JsonRpcProvider } from "ethers";
import { TESTNET_RPC } from "./utils/config";
import { makeGraphQLRequest } from "./utils/graphql/makeGraphQLRequest";
import { makeRestRequest } from "./utils/makeRestRequest";
import { authenticate } from "./utils/authenticate";
import { makePdfFile } from "./utils/testFiles";
import {
  CREATE_FOLDER,
  UPDATE_FOLDER,
  DELETE_FOLDER,
  GET_FOLDER,
  GET_FOLDERS,
  UPDATE_DOCUMENT,
  DELETE_DOCUMENT,
  GET_DOCUMENT,
  GET_DOCUMENTS,
} from "./utils/graphql/schema/documents";
import { CREATE_BUSINESS } from "./utils/graphql/schema/rwa";
import { CREATE_COMPANY } from "./utils/graphql/schema/company";

describe("Documents Flow", () => {
  let chainId: string;
  let provider: JsonRpcProvider;
  let wallet: HDNodeWallet;
  let wallet2: HDNodeWallet;
  let accessToken: string;
  let accessToken2: string;
  let userId: string;
  let companyId: string;
  let businessId: string;
  let folderId: string;
  let documentId: string;

  beforeAll(async () => {
    chainId = "97";
    provider = new ethers.JsonRpcProvider(TESTNET_RPC);
    wallet = ethers.Wallet.createRandom().connect(provider);
    wallet2 = ethers.Wallet.createRandom().connect(provider);
    ({ accessToken, userId } = await authenticate(wallet));
    ({ accessToken: accessToken2 } = await authenticate(wallet2));

    const companyResult = await makeGraphQLRequest(
      CREATE_COMPANY,
      {
        input: {
          name: "Test Company for RWA",
          description: "Test Description"
        },
      },
      accessToken
    );

    companyId = companyResult.data.createCompany.id;

    const result = await makeGraphQLRequest(
      CREATE_BUSINESS,
      {
        input: {
          name: "Test Business",
          ownerId: companyId,
          ownerType: "company",
          chainId,
          description: "Test Description",
          tags: ["test"]
        },
      },
      accessToken
    );

    businessId = result.data.createBusiness.id;
  });

  // describe("Authentication Tests", () => {
  //   test("should require authentication for creating folder", async () => {
  //     const result = await makeGraphQLRequest(
  //       CREATE_FOLDER,
  //       {
  //         input: {
  //           name: "Test Folder",
  //           parentId: businessId,
  //           type: "business"
  //         },
  //       }
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("Authentication required");
  //   });

  //   test("should require authentication for creating document", async () => {
  //     const fileContent = "Test file content";
  //     const file = new File([fileContent], "test.txt", { type: "text/plain" });

  //     const result = await makeGraphQLRequest(
  //       CREATE_DOCUMENT,
  //       {
  //         input: {
  //           folderId: "some-folder-id",
  //           name: "Test Document",
  //         },
  //       },
  //       undefined,
  //       file
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("Authentication required");
  //   });
  // });

  // describe("Access Control Tests", () => {
  //   test("should not allow non-owner to create folder in business", async () => {
  //     const result = await makeGraphQLRequest(
  //       CREATE_FOLDER,
  //       {
  //         input: {
  //           name: "Test Folder",
  //           parentId: businessId,
  //           type: "business"
  //         },
  //       },
  //       accessToken2
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("User does not have required company permissions");
  //   });

  //   test("should not allow non-owner to update folder", async () => {
  //     // First create a folder as owner
  //     const createResult = await makeGraphQLRequest(
  //       CREATE_FOLDER,
  //       {
  //         input: {
  //           name: "Test Folder",
  //           parentId: businessId,
  //           type: "business"
  //         },
  //       },
  //       accessToken
  //     );

  //     expect(createResult.errors).toBeUndefined();
  //     folderId = createResult.data.createFolder.id;

  //     // Try to update as non-owner
  //     const result = await makeGraphQLRequest(
  //       UPDATE_FOLDER,
  //       {
  //         input: {
  //           id: folderId,
  //           updateData: {
  //             name: "Updated Test Folder"
  //           }
  //         },
  //       },
  //       accessToken2
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("User does not have required company permissions");
  //   });

  //   test("should not allow non-owner to create document in folder", async () => {
  //     const fileContent = "Test file content";
  //     const file = new File([fileContent], "test.txt", { type: "text/plain" });

  //     const result = await makeGraphQLRequest(
  //       CREATE_DOCUMENT,
  //       {
  //         input: {
  //           folderId,
  //           name: "Test Document",
  //         },
  //       },
  //       accessToken2,
  //       file
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("User does not have required company permissions");
  //   });

  //   test("should not allow non-owner to update document", async () => {
  //     // First create a document as owner
  //     const fileContent = "Test file content";
  //     const file = new File([fileContent], "test.txt", { type: "text/plain" });

  //     const createResult = await makeGraphQLRequest(
  //       CREATE_DOCUMENT,
  //       {
  //         input: {
  //           folderId,
  //           name: "Test Document",
  //         },
  //       },
  //       accessToken,
  //       file
  //     );

  //     expect(createResult.errors).toBeUndefined();
  //     documentId = createResult.data.createDocument.id;

  //     // Try to update as non-owner
  //     const result = await makeGraphQLRequest(
  //       UPDATE_DOCUMENT,
  //       {
  //         input: {
  //           id: documentId,
  //           updateData: {
  //             name: "Updated Test Document",
  //             link: "https://example.com/updated.pdf"
  //           }
  //         },
  //       },
  //       accessToken2
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("User does not have required company permissions");
  //   });

  //   test("should not allow non-owner to delete document", async () => {
  //     const result = await makeGraphQLRequest(
  //       DELETE_DOCUMENT,
  //       {
  //         id: documentId,
  //       },
  //       accessToken2
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("User does not have required company permissions");
  //   });

  //   test("should not allow non-owner to delete folder", async () => {
  //     const result = await makeGraphQLRequest(
  //       DELETE_FOLDER,
  //       {
  //         id: folderId,
  //       },
  //       accessToken2
  //     );

  //     expect(result.errors).toBeDefined();
  //     expect(result.errors[0].message).toBe("User does not have required company permissions");
  //   });
  // });

  describe("Folders", () => {
    test("should create a folder", async () => {
      const result = await makeGraphQLRequest(
        CREATE_FOLDER,
        {
          input: {
            name: "Test Folder",
            parentId: businessId,
            type: "business"
          },
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.createFolder).toBeDefined();
      expect(result.data.createFolder.name).toBe("Test Folder");
      expect(result.data.createFolder.parentId).toBe(businessId);
      expect(result.data.createFolder.ownerId).toBe(companyId);
      expect(result.data.createFolder.ownerType).toBe("company");
      expect(result.data.createFolder.creator).toBe(userId);

      folderId = result.data.createFolder.id;
    });

    test("should get folder by id", async () => {
      const result = await makeGraphQLRequest(
        GET_FOLDER,
        {
          id: folderId,
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.getFolder).toBeDefined();
      expect(result.data.getFolder.id).toBe(folderId);
      expect(result.data.getFolder.name).toBe("Test Folder");
      expect(result.data.getFolder.ownerId).toBe(companyId);
      expect(result.data.getFolder.ownerType).toBe("company");
    });

    test("should get folders with filter", async () => {
      const result = await makeGraphQLRequest(
        GET_FOLDERS,
        {
          input: {
            filter: {
              parentId: { $in: [businessId] },
            },
          }
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.getFolders).toBeDefined();
      expect(result.data.getFolders).toBeArray();
      expect(result.data.getFolders.length).toBeGreaterThan(0);
      expect(result.data.getFolders[0].parentId).toBe(businessId);
      expect(result.data.getFolders[0].ownerId).toBe(companyId);
      expect(result.data.getFolders[0].ownerType).toBe("company");
    });

    test("should update folder", async () => {
      const result = await makeGraphQLRequest(
        UPDATE_FOLDER,
        {
          input: {
            id: folderId,
            updateData: {
              name: "Updated Test Folder"
            }
          },
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.updateFolder).toBeDefined();
      expect(result.data.updateFolder.id).toBe(folderId);
      expect(result.data.updateFolder.name).toBe("Updated Test Folder");
      expect(result.data.updateFolder.ownerId).toBe(companyId);
      expect(result.data.updateFolder.ownerType).toBe("company");
    });
  });

  describe("Documents", () => {
    test("should create a document with file", async () => {
      // Create test file (real magic bytes — content check)
      const file = makePdfFile("test.pdf");

      const result = await makeRestRequest(
        "/api/upload/createDocument",
        { file, folderId, name: "Test Document" },
        accessToken
      );

      expect(result.error).toBeUndefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe("Test Document");
      expect(result.folderId).toBe(folderId);
      expect(result.url).toBeDefined();
      expect(result.fileId).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.mimeType).toBe("application/pdf");
      expect(result.size).toBe(file.size);
      expect(result.ownerId).toBe(companyId);
      expect(result.ownerType).toBe("company");
      expect(result.creator).toBe(userId);

      documentId = result.id;
    });

    test("should get document by id", async () => {
      const result = await makeGraphQLRequest(
        GET_DOCUMENT,
        {
          id: documentId,
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.getDocument).toBeDefined();
      expect(result.data.getDocument.id).toBe(documentId);
      expect(result.data.getDocument.name).toBe("Test Document");
      expect(result.data.getDocument.mimeType).toBe("application/pdf");
      expect(result.data.getDocument.size).toBeDefined();
      expect(result.data.getDocument.ownerId).toBe(companyId);
      expect(result.data.getDocument.ownerType).toBe("company");
    });

    test("should get documents with filter", async () => {
      const result = await makeGraphQLRequest(
        GET_DOCUMENTS,
        {
          input: {
            filter: {
              folderId: { $in: [folderId] },
            },
          }
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.getDocuments).toBeDefined();
      expect(result.data.getDocuments).toBeArray();
      expect(result.data.getDocuments.length).toBeGreaterThan(0);
      expect(result.data.getDocuments[0].folderId).toBe(folderId);
      expect(result.data.getDocuments[0].ownerId).toBe(companyId);
      expect(result.data.getDocuments[0].ownerType).toBe("company");
    });

    test("should update document", async () => {
      const result = await makeGraphQLRequest(
        UPDATE_DOCUMENT,
        {
          input: {
            id: documentId,
            updateData: {
              name: "Updated Test Document",
            }
          },
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.updateDocument).toBeDefined();
      expect(result.data.updateDocument.id).toBe(documentId);
      expect(result.data.updateDocument.name).toBe("Updated Test Document");
      expect(result.data.updateDocument.mimeType).toBe("application/pdf");
      expect(result.data.updateDocument.size).toBeDefined();
      expect(result.data.updateDocument.ownerId).toBe(companyId);
      expect(result.data.updateDocument.ownerType).toBe("company");
    });

    test("should delete document", async () => {
      const result = await makeGraphQLRequest(
        DELETE_DOCUMENT,
        {
          id: documentId,
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.deleteDocument).toBe(documentId);

      // Verify document is deleted
      const getResult = await makeGraphQLRequest(
        GET_DOCUMENT,
        {
          id: documentId,
        },
        accessToken
      );

      expect(getResult.errors).toBeDefined();
      expect(getResult.errors[0].message).toBeDefined();
    });
  });

  describe("File Validation", () => {
    test("should reject document with wrong MIME type", async () => {
      const fileContent = "fake image content";
      const file = new File([fileContent], "test.jpg", { type: "image/jpeg" });

      const result = await makeRestRequest(
        "/api/upload/createDocument",
        { file, folderId, name: "Should Fail" },
        accessToken
      );

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("not allowed");
    });

    test("should reject document with oversized file", async () => {
      // Create a file larger than 25MB (DOCUMENTS_MAX_FILE_SIZE)
      const oversizedContent = new Uint8Array(26 * 1024 * 1024);
      const file = new File([oversizedContent], "big.pdf", { type: "application/pdf" });

      const result = await makeRestRequest(
        "/api/upload/createDocument",
        { file, folderId, name: "Should Fail Oversized" },
        accessToken
      );

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain("exceeds maximum");
    });
  });

  describe("Folder Cleanup", () => {
    test("should delete folder", async () => {
      const result = await makeGraphQLRequest(
        DELETE_FOLDER,
        {
          id: folderId,
        },
        accessToken
      );

      expect(result.errors).toBeUndefined();
      expect(result.data.deleteFolder).toBe(folderId);

      // Verify folder is deleted
      const getResult = await makeGraphQLRequest(
        GET_FOLDER,
        {
          id: folderId,
        },
        accessToken
      );

      expect(getResult.errors).toBeDefined();
      expect(getResult.errors[0].message).toBeDefined();
    });
  });
});