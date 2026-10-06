export function queryTokens(query: string) {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9€]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["cerco","cerca","cercando","voglio","prodotto","prodotti","amazon","migliore","migliori","consigliami","vorrei","serve","servono","una","uno","con","per","sotto","entro","fino","meno","euro","economico","economica","economici","economiche","conveniente","convenienti","buono","buona","buoni","buone","piacerebbe","trovare","offerta","offerte","marcato","marcata","marcati","marcate","marca"].includes(token));
}

export function titleRelevance(title: string, tokens: string[]) {
  const words = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const matches = tokens.filter((token) => words.includes(token)).length;
  return { matches, score: matches * 5 };
}

export function isRelevantProduct(title: string, query: string) {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  const { matches } = titleRelevance(title, tokens);
  return matches >= (tokens.length >= 3 ? 2 : 1);
}

export function maxPriceFromQuery(query: string) {
  const matches = [...query.matchAll(/(?:sotto|max(?:imo)?|entro|fino a|meno di)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euro)/gi)];
  if (!matches.length) return null;
  const value = Number(matches.at(-1)?.[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}
