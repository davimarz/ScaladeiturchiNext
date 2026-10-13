export type CatalogVerificationProgress = {
  remaining: number;
  incomplete: number;
};

export function catalogHasAnomalies(progress: CatalogVerificationProgress) {
  return progress.remaining > 0 || progress.incomplete > 0;
}
