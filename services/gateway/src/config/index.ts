export const CONFIG = {
  PORT: Number(process.env.PORT),
  SERVICE_NAME: String(process.env.SERVICE_NAME),
  JWT_SECRET: String(process.env.JWT_SECRET),

  SERVICES: {
    AUTH: {
      URL: String(process.env.AUTH_SERVICE_URL),
    },
    BLOCKCHAIN_SCANNER: {
      URL: String(process.env.BLOCKCHAIN_SCANNER_SERVICE_URL),
    },
    TESTNET_FAUCET: {
      URL: String(process.env.TESTNET_FAUCET_SERVICE_URL),
    },
    ASSISTANT: {
      URL: String(process.env.ASSISTANT_SERVICE_URL),
    },
    RWA: {
      URL: String(process.env.RWA_SERVICE_URL),
    },
    SIGNERS_MANAGER: {
      URL: String(process.env.SIGNERS_MANAGER_SERVICE_URL),
    },
    FILES: {
      URL: String(process.env.FILES_SERVICE_URL),
    },
    GALLERY: {
      URL: String(process.env.GALLERY_SERVICE_URL),
    },
    FAQ: {
      URL: String(process.env.FAQ_SERVICE_URL),
    },
    BLOG: {
      URL: String(process.env.BLOG_SERVICE_URL),
    },
    QUESTIONS: {
      URL: String(process.env.QUESTIONS_SERVICE_URL),
    },
    PORTFOLIO: {
      URL: String(process.env.PORTFOLIO_SERVICE_URL),
    },
    COMPANY: {
      URL: String(process.env.COMPANY_SERVICE_URL),
    },
    DOCUMENTS: {
      URL: String(process.env.DOCUMENTS_SERVICE_URL),
    },
    CHARTS: {
      URL: String(process.env.CHARTS_SERVICE_URL),
    },
    REACTIONS: {
      URL: String(process.env.REACTIONS_SERVICE_URL),
    },
    LOYALTY: {
      URL: String(process.env.LOYALTY_SERVICE_URL),
    },
    DAO: {
      URL: String(process.env.DAO_SERVICE_URL),
    },
    AI_EVALUATOR: {
      URL: String(process.env.AI_EVALUATOR_SERVICE_URL),
    },
  },

  MONITORING: {
    PROMETHEUS_URL: String(process.env.PROMETHEUS_URL),
    LOKI_URL: String(process.env.LOKI_URL),
  },

  REDIS: {
    URL: String(process.env.REDIS_URL),
  },

  FILE_VALIDATION: {
    DOCUMENTS_ALLOWED_MIME_TYPES: (process.env.DOCUMENTS_ALLOWED_MIME_TYPES || '').split(',').filter(Boolean),
    GALLERY_ALLOWED_MIME_TYPES: (process.env.GALLERY_ALLOWED_MIME_TYPES || '').split(',').filter(Boolean),
    TOKEN_IMAGE_ALLOWED_MIME_TYPES: (process.env.TOKEN_IMAGE_ALLOWED_MIME_TYPES || 'image/png,image/jpeg,image/webp')
      .split(',')
      .filter(Boolean),
  },
};
