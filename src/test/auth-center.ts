export const authTestEnv = {
  NODE_ENV: "test", FELINE_PUBLIC_ORIGIN: "http://localhost:13000", USER_CENTER_ISSUER: "http://localhost:18080/api/auth", USER_CENTER_CLIENT_ID: "feline-blog", USER_CENTER_CLIENT_SECRET: "isolated-unit-test-client-secret",
  FELINE_SESSION_SECRET: Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64"),
  FELINE_GRANT_KEYRING: JSON.stringify({ active: "unit", keys: { unit: Buffer.alloc(32, 9).toString("base64") } }),
};

export const integrationTestEnv = {
  ...authTestEnv,
  USER_CENTER_ONBOARDING_ENABLED: "false", FELINE_REGISTRATION_MODE: "closed",
};
