const GENERIC_QUALIFIERS = new Set([
  "donna","donne","uomo","uomini","bambino","bambina","bambini","bambine",
  "ragazzo","ragazza","ragazzi","ragazze","adulto","adulta","adulti","adulte",
  "nero","nera","neri","nere","bianco","bianca","bianchi","bianche",
  "rosso","rossa","rossi","rosse","blu","verde","verdi","giallo","gialla",
  "gialli","gialle","rosa","grigio","grigia","grigi","grigie"
]);

export function queryTokens(query: string) {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9€]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["cerco","cerca","cercando","voglio","prodotto","prodotti","amazon","migliore","migliori","consigliami","vorrei","serve","servono","una","uno","con","per","sotto","entro","fino","meno","euro","economico","economica","economici","economiche","conveniente","convenienti","buono","buona","buoni","buone","piacerebbe","trovare","offerta","offerte","marcato","marcata","marcati","marcate","marca"].includes(token));
}

function stem(value: string) {
  return value
    .replace(/(?:ini|ine|ino|ina|etti|ette|etto|etta|oni|one|ano|ana|i|e|o|a)$/i, "")
    .slice(0, 12);
}

function normalizedWords(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function titleRelevance(title: string, tokens: string[]) {
  const words = normalizedWords(title);
  const wordStems = new Set(words.map(stem).filter((value) => value.length >= 4));
  const matches = tokens.filter((token) => words.includes(token) || wordStems.has(stem(token))).length;
  return { matches, score: matches * 5 };
}

export function isRelevantProduct(title: string, query: string) {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;

  const words = normalizedWords(title);
  const wordStems = new Set(words.map(stem).filter((value) => value.length >= 4));
  const matchesToken = (token: string) => words.includes(token) || wordStems.has(stem(token));

  const conceptTokens = tokens.filter((token) => !GENERIC_QUALIFIERS.has(token));
  if (conceptTokens.length > 0 && !conceptTokens.some(matchesToken)) return false;

  const matched = tokens.filter(matchesToken).length;
  if (tokens.length >= 3) return matched >= 2 || conceptTokens.some(matchesToken);
  return matched >= 1;
}

export function maxPriceFromQuery(query: string) {
  const matches = [...query.matchAll(/(?:sotto|max(?:imo)?|entro|fino a|meno di)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euro)/gi)];
  if (!matches.length) return null;
  const value = Number(matches.at(-1)?.[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}
