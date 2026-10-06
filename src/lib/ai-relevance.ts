export function queryTokens(query: string) {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9€]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["cerco","voglio","prodotto","prodotti","amazon","migliore","migliori","consigliami","vorrei","serve","servono","una","uno","con","per","sotto","entro","fino","meno","euro","economico","economica","economici","economiche","conveniente","convenienti","buono","buona","buoni","buone"].includes(token));
}

export function titleRelevance(title: string, tokens: string[]) {
  const normalized = title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const matches = tokens.filter((token) => normalized.includes(token)).length;
  return { matches, score: matches * 5 };
}

export function isRelevantProduct(title: string, query: string) {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  const { matches } = titleRelevance(title, tokens);
  return matches >= (tokens.length >= 2 ? 2 : 1);
}
