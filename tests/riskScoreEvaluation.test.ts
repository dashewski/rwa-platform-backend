import { expect, test, describe, beforeAll } from "bun:test";
import { ethers, JsonRpcProvider } from "ethers";
import { FACTORY_ADDRESS, HOLD_TOKEN_ADDRESS, TESTNET_RPC } from "./utils/config";
import { makeGraphQLRequest } from "./utils/graphql/makeGraphQLRequest";
import { authenticate } from "./utils/authenticate";
import { CREATE_COMPANY } from "./utils/graphql/schema/company";
import {
  CREATE_BUSINESS,
  GET_BUSINESS,
  UPDATE_BUSINESS_RISK_SCORE,
  REQUEST_BUSINESS_APPROVAL_SIGNATURES,
} from "./utils/graphql/schema/rwa";
import { GET_SIGNATURE_TASK } from "./utils/graphql/schema/signers-manager";
import { requestHold, requestGas } from "./utils/requestTokens";
import { GET_EVALUATIONS } from "./utils/graphql/schema/ai-evaluator";
import { SET_REACTION } from "./utils/graphql/schema/reactions";
import { CREATE_TOPIC, CREATE_QUESTION, CREATE_QUESTION_ANSWER } from "./utils/graphql/schema/questions";
import { CREATE_FOLDER } from "./utils/graphql/schema/documents";
import { CREATE_GALLERY } from "./utils/graphql/schema/gallery";
import { makeRestRequest } from "./utils/makeRestRequest";

// ── Helpers ──────────────────────────────────────────

async function readDemoFile(subdir: string, fileName: string, mimeType: string): Promise<File> {
  const buf = await Bun.file(import.meta.dir + "/utils/demo_files/" + subdir + "/" + fileName).arrayBuffer();
  return new File([buf], fileName, { type: mimeType });
}


/**
 * Evaluation is allowed only for deployed entities, so every business has to be
 * deployed on-chain before it can be scored: request signatures, wait for the
 * signing task, deploy through the factory, wait until RWA_Deployed lands in the
 * backend and tokenAddress is stored.
 */
async function deployBusiness(params: {
  businessId: string;
  companyId: string;
  wallet: ethers.HDNodeWallet | ethers.Wallet;
  accessToken: string;
}) {
  const { businessId, companyId, wallet, accessToken } = params;

  const sigResult = await makeGraphQLRequest(
    REQUEST_BUSINESS_APPROVAL_SIGNATURES,
    {
      input: {
        id: businessId,
        ownerWallet: wallet.address,
        deployerWallet: wallet.address,
        createRWAFee: '100',
      },
    },
    accessToken,
  );

  expect(sigResult.errors).toBeUndefined();

  const taskId = sigResult.data.requestBusinessApprovalSignatures.taskId;

  await new Promise((resolve) => setTimeout(resolve, 30_000));

  const taskResult = await makeGraphQLRequest(GET_SIGNATURE_TASK, { input: { taskId } }, accessToken);
  expect(taskResult.errors).toBeUndefined();
  expect(taskResult.data.getSignatureTask.completed).toBe(true);

  await requestHold(accessToken, 500);
  await requestGas(accessToken, 0.0035);
  await new Promise((resolve) => setTimeout(resolve, 10_000));

  const holdToken = new ethers.Contract(
    HOLD_TOKEN_ADDRESS,
    ['function approve(address spender, uint256 amount) public returns (bool)'],
    wallet,
  );

  const approveTx = await holdToken.approve(FACTORY_ADDRESS, ethers.MaxUint256);
  await approveTx.wait();

  const signatures = taskResult.data.getSignatureTask.signatures;
  const signers = signatures.map((signature: any) => ethers.getAddress(signature.signer));
  const signatureValues = signatures.map((signature: any) => signature.signature);
  const expired = taskResult.data.getSignatureTask.expired;

  const factory = new ethers.Contract(
    FACTORY_ADDRESS,
    [
      'function deployRWA(uint256 createRWAFee, string calldata entityId, string calldata entityOwnerId, string calldata entityOwnerType, address owner, address[] calldata signers, bytes[] calldata signatures, uint256 expired)',
    ],
    wallet,
  );

  const deployTx = await factory.deployRWA(
    '100',
    businessId,
    companyId,
    'company',
    wallet.address,
    signers,
    signatureValues,
    expired,
    { gasLimit: 1200000, gasPrice: 1000000000 },
  );
  await deployTx.wait(20);

  await new Promise((resolve) => setTimeout(resolve, 10_000));

  const updatedBusiness = await makeGraphQLRequest(GET_BUSINESS, { id: businessId }, accessToken);
  expect(updatedBusiness.data.getBusiness.tokenAddress).toBeDefined();
  expect(updatedBusiness.data.getBusiness.tokenAddress).not.toBeNull();
}

async function waitForRiskScore(params: { businessId: string; accessToken: string }) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const poll = await makeGraphQLRequest(GET_BUSINESS, { id: params.businessId }, params.accessToken);
    const riskScore = poll.data.getBusiness.riskScore;

    if (typeof riskScore === 'number') {
      return riskScore;
    }
  }

  throw new Error('riskScore did not appear within 120s');
}

// ── Tests ────────────────────────────────────────────

describe("Risk Score Evaluation", () => {
  const chainId = "97";
  let provider: JsonRpcProvider;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(TESTNET_RPC);
  });

  test("good business (coffee shop) → low risk score", async () => {
    const wallet = ethers.Wallet.createRandom().connect(provider);
    const { accessToken } = await authenticate(wallet);

    // Company
    const companyRes = await makeGraphQLRequest(
      CREATE_COMPANY,
      { input: { name: "CoffeeCo", description: "" } },
      accessToken,
    );
    const companyId = companyRes.data.createCompany.id;

    // Business — coffee shop
    const bizRes = await makeGraphQLRequest(
      CREATE_BUSINESS,
      {
        input: {
          name: "Brew & Bean Coffee Co.",
          ownerId: companyId,
          ownerType: "company",
          chainId,
          description:
            "Premium specialty coffee chain with 3 locations in Zurich, operating profitably for 6 years with full regulatory compliance",
          tags: ["coffee", "hospitality", "established", "compliant"],
          country: "CH",
          businessType: "franchise",
        },
      },
      accessToken,
    );
    const businessId = bizRes.data.createBusiness.id;

    // Positive reactions
    for (let i = 0; i < 3; i++) {
      await makeGraphQLRequest(
        SET_REACTION,
        { input: { parentId: businessId, parentType: "business", reaction: "like" } },
        accessToken,
      );
    }

    // Positive Q&A
    const topicRes = await makeGraphQLRequest(
      CREATE_TOPIC,
      { input: { name: "Operations", parentId: businessId, type: "business" } },
      accessToken,
    );
    const topicId = topicRes.data.createTopic.id;

    const qRes = await makeGraphQLRequest(
      CREATE_QUESTION,
      { input: { topicId, text: "What is the financial health of the business?" } },
      accessToken,
    );
    await makeGraphQLRequest(
      CREATE_QUESTION_ANSWER,
      {
        input: {
          id: qRes.data.createQuestion.id,
          text: "The business is profitable with CHF 1.2M annual revenue, 18% net margin, and 8% YoY growth. All taxes paid, no debts.",
        },
      },
      accessToken,
    );

    // Document — coffee shop profile PDF
    const folderRes = await makeGraphQLRequest(
      CREATE_FOLDER,
      { input: { name: "Business Profile", parentId: businessId, type: "business" } },
      accessToken,
    );
    const folderId = folderRes.data.createFolder.id;

    const docFile = await readDemoFile("good_business", "coffee_shop_profile.pdf", "application/pdf");
    const docRes = await makeRestRequest(
      "/api/upload/createDocument",
      { file: docFile, folderId, name: "coffee_shop_profile" },
      accessToken,
    );
    expect(docRes.error).toBeUndefined();

    // Gallery + image (real coffee shop photo)
    const galleryRes = await makeGraphQLRequest(
      CREATE_GALLERY,
      { input: { name: "Photos", parentId: businessId, type: "business" } },
      accessToken,
    );
    const imgFile = await readDemoFile("good_business", "storefront.jpg", "image/jpeg");
    const imgRes = await makeRestRequest(
      "/api/upload/createImage",
      { file: imgFile, galleryId: galleryRes.data.createGallery.id, name: "storefront", description: "Storefront photo" },
      accessToken,
    );
    expect(imgRes.error).toBeUndefined();

    // ── Deploy first: evaluation is allowed only for deployed businesses ──
    await deployBusiness({ businessId, companyId, wallet, accessToken });

    // ── Evaluate ──
    const result = await makeGraphQLRequest(UPDATE_BUSINESS_RISK_SCORE, { id: businessId }, accessToken);
    expect(result.errors).toBeUndefined();
    expect(typeof result.data.requestBusinessEvaluation).toBe('string');

    const riskScore = await waitForRiskScore({ businessId, accessToken });
    console.log(`\n  [GOOD BUSINESS - Coffee Shop]  riskScore = ${riskScore}\n`);

    expect(riskScore).toBeGreaterThanOrEqual(1);
    expect(riskScore).toBeLessThanOrEqual(100);
    expect(riskScore).toBeLessThan(50);

    const evalsRes = await makeGraphQLRequest(
      GET_EVALUATIONS,
      { input: { filter: { parentId: businessId } } },
      accessToken,
    );
    const evaluation = evalsRes.data.getEvaluations[0];
    expect(evaluation.risk.score).toBe(riskScore);
    expect(evaluation.summary.length).toBeGreaterThan(0);
    expect(evaluation.risk.pros.length + evaluation.risk.cons.length).toBeGreaterThan(0);
  });

  test("bad business (crypto pyramid) → high risk score", async () => {
    const wallet = ethers.Wallet.createRandom().connect(provider);
    const { accessToken } = await authenticate(wallet);

    // Company
    const companyRes = await makeGraphQLRequest(
      CREATE_COMPANY,
      { input: { name: "MoonX Ltd", description: "" } },
      accessToken,
    );
    const companyId = companyRes.data.createCompany.id;

    // Business — crypto pyramid
    const bizRes = await makeGraphQLRequest(
      CREATE_BUSINESS,
      {
        input: {
          name: "CryptoMoonX",
          ownerId: companyId,
          ownerType: "company",
          chainId,
          description:
            "Cryptocurrency investment platform promising 5-10% monthly returns, operating from offshore jurisdiction with anonymous founder",
          tags: ["crypto", "high-yield", "offshore", "speculative"],
          country: "SC",
          businessType: "startup",
        },
      },
      accessToken,
    );
    const businessId = bizRes.data.createBusiness.id;

    // Negative reactions
    for (let i = 0; i < 3; i++) {
      await makeGraphQLRequest(
        SET_REACTION,
        { input: { parentId: businessId, parentType: "business", reaction: "dislike" } },
        accessToken,
      );
    }

    // Negative Q&A
    const topicRes = await makeGraphQLRequest(
      CREATE_TOPIC,
      { input: { name: "Regulation", parentId: businessId, type: "business" } },
      accessToken,
    );
    const topicId = topicRes.data.createTopic.id;

    const qRes = await makeGraphQLRequest(
      CREATE_QUESTION,
      { input: { topicId, text: "Is the business properly licensed?" } },
      accessToken,
    );
    await makeGraphQLRequest(
      CREATE_QUESTION_ANSWER,
      {
        input: {
          id: qRes.data.createQuestion.id,
          text: "No, the business has no financial license. It is registered as a shell company in Seychelles with nominee directors and an anonymous founder.",
        },
      },
      accessToken,
    );

    // Document — incriminating PDF
    const folderRes = await makeGraphQLRequest(
      CREATE_FOLDER,
      { input: { name: "Due Diligence", parentId: businessId, type: "business" } },
      accessToken,
    );
    const folderId = folderRes.data.createFolder.id;

    const docFile = await readDemoFile("bad_business", "crypto_pyramid_report.pdf", "application/pdf");
    const docRes = await makeRestRequest(
      "/api/upload/createDocument",
      { file: docFile, folderId, name: "due_diligence_report" },
      accessToken,
    );
    expect(docRes.error).toBeUndefined();

    // Gallery + image (blue square)
    const galleryRes = await makeGraphQLRequest(
      CREATE_GALLERY,
      { input: { name: "Photos", parentId: businessId, type: "business" } },
      accessToken,
    );
    const imgFile = await readDemoFile("bad_business", "office_photo.png", "image/png");
    const imgRes = await makeRestRequest(
      "/api/upload/createImage",
      { file: imgFile, galleryId: galleryRes.data.createGallery.id, name: "office", description: "Office photo" },
      accessToken,
    );
    expect(imgRes.error).toBeUndefined();

    // ── Deploy first: evaluation is allowed only for deployed businesses ──
    await deployBusiness({ businessId, companyId, wallet, accessToken });

    // ── Evaluate ──
    const result = await makeGraphQLRequest(UPDATE_BUSINESS_RISK_SCORE, { id: businessId }, accessToken);
    expect(result.errors).toBeUndefined();
    expect(typeof result.data.requestBusinessEvaluation).toBe('string');

    const riskScore = await waitForRiskScore({ businessId, accessToken });
    console.log(`\n  [BAD BUSINESS - Crypto Pyramid]  riskScore = ${riskScore}\n`);

    expect(riskScore).toBeGreaterThanOrEqual(1);
    expect(riskScore).toBeLessThanOrEqual(100);
    expect(riskScore).toBeGreaterThan(50);

    const evalsRes = await makeGraphQLRequest(
      GET_EVALUATIONS,
      { input: { filter: { parentId: businessId } } },
      accessToken,
    );
    const evaluation = evalsRes.data.getEvaluations[0];
    expect(evaluation.risk.score).toBe(riskScore);
    expect(evaluation.summary.length).toBeGreaterThan(0);
    expect(evaluation.risk.pros.length + evaluation.risk.cons.length).toBeGreaterThan(0);
  });
});
