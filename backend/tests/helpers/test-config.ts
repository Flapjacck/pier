import type { Config } from "../../src/config.js";

export const TEST_TOKEN = "test-token-secret";

/** Config for buildApp() in tests; override fields per test (e.g. apiToken, kubeconfig). */
export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 3000,
    host: "127.0.0.1",
    apiToken: TEST_TOKEN,
    kubeconfig: undefined,
    namespace: "pier-apps",
    ingressDomain: "example.com",
    publicDir: undefined,
    trustProxy: false,
    dashboardHost: undefined,
    ...overrides,
  };
}

export const authHeader = { authorization: `Bearer ${TEST_TOKEN}` };
