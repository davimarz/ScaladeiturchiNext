const databaseKeys = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;
const amazonKeys = ["AMAZON_PARTNER_TAG", "AMAZON_APPLICATION_ID", "AMAZON_CREDENTIAL_ID", "AMAZON_CREDENTIAL_SECRET", "AMAZON_CREDENTIAL_VERSION"] as const;

function requireEnv<K extends string>(keys: readonly K[]): Record<K, string> {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing server environment variables: ${missing.join(", ")}`);
  return Object.fromEntries(keys.map((key) => [key, process.env[key]!])) as Record<K, string>;
}
export function getServerEnv() { return requireEnv(databaseKeys); }
export function getAmazonEnv() { return requireEnv(amazonKeys); }
