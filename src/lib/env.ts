const requiredServerEnv = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "AMAZON_PARTNER_TAG",
  "AMAZON_APPLICATION_ID",
  "AMAZON_CREDENTIAL_ID",
  "AMAZON_CREDENTIAL_SECRET",
  "AMAZON_CREDENTIAL_VERSION",
] as const;

export function getServerEnv() {
  const missing = requiredServerEnv.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing server environment variables: ${missing.join(", ")}`);
  return Object.fromEntries(requiredServerEnv.map((key) => [key, process.env[key]!])) as Record<(typeof requiredServerEnv)[number], string>;
}
