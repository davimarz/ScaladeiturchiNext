import "server-only";
import { getServerEnv } from "@/lib/env";

export function getAmazonConfig() {
  const env = getServerEnv();
  return {
    partnerTag: env.AMAZON_PARTNER_TAG,
    applicationId: env.AMAZON_APPLICATION_ID,
    credentialId: env.AMAZON_CREDENTIAL_ID,
    credentialSecret: env.AMAZON_CREDENTIAL_SECRET,
    credentialVersion: env.AMAZON_CREDENTIAL_VERSION,
    marketplace: "www.amazon.it",
    locale: "it_IT",
    currency: "EUR",
  } as const;
}
