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
    .filter((token) => token.length >= 3 && !/[0-9€]/.test(token) && !["cerco","cerca","cercando","voglio","prodotto","prodotti","amazon","migliore","migliori","consigliami","vorrei","serve","servono","una","uno","con","per","sotto","entro","fino","meno","euro","economico","economica","economici","economiche","conveniente","convenienti","buono","buona","buoni","buone","piacerebbe","trovare","offerta","offerte","marcato","marcata","marcati","marcate","marca"].includes(token));
}

function stem(value: string) {
  return value
    .replace(/(?:ini|ine|ino|ina|etti|ette|etto|etta|oni|one|ano|ana|i|e|o|a)$/i, "")
    .slice(0, 12);
}

const TOKEN_SYNONYMS: Record<string, string[]> = {
  scarpa: ["shoe","shoes","sneaker","sneakers","calzatura","calzature"],
  scarpe: ["shoe","shoes","sneaker","sneakers","calzatura","calzature"],
  cappellino: ["cappello","berretto","cap"],
  cappello: ["cappellino","berretto","cap"],
  berretto: ["cappello","cappellino","cap"],
  cuffia: ["cuffie","headphone","headphones","earbud","earbuds"],
  cuffie: ["cuffia","headphone","headphones","earbud","earbuds"],
  macchina: ["macchina","machine","maker"],
  caffe: ["caffe","coffee","espresso"],
  cialda: ["cialde","ese","capsula","capsule","pod","pods"],
  cialde: ["cialda","ese","capsula","capsule","pod","pods"],
};

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
  if (isUnrequestedAccessory(title, query)) return false;
  const tokens = queryTokens(query);
  if (!tokens.length) return true;

  const words = normalizedWords(title);
  const wordStems = new Set(words.map(stem).filter((value) => value.length >= 4));
  const matchesToken = (token: string) => {
    if (words.includes(token) || wordStems.has(stem(token))) return true;
    return (TOKEN_SYNONYMS[token] ?? []).some((synonym) =>
      words.includes(synonym) || wordStems.has(stem(synonym))
    );
  };

  const conceptTokens = tokens.filter((token) => !GENERIC_QUALIFIERS.has(token));
  const matchedConcepts = conceptTokens.filter(matchesToken).length;

  if (conceptTokens.length === 1) return matchedConcepts === 1;
  if (conceptTokens.length === 2) return matchedConcepts === 2;
  if (conceptTokens.length >= 3) return matchedConcepts >= 2;

  const matched = tokens.filter(matchesToken).length;
  return matched >= 1;
}

export function maxPriceFromQuery(query: string) {
  const matches = [...query.matchAll(/(?:sotto|max(?:imo)?|entro|fino a|meno di)?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|euro)/gi)];
  if (!matches.length) return null;
  const value = Number(matches.at(-1)?.[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// A compatible accessory can contain every search term while being the wrong product.
export function isUnrequestedAccessory(title: string, query: string) {
  const requested = normalizedWords(query).join(" ");
  const offered = normalizedWords(title).join(" ");
  const kinds = [
    { device: /\bspazzolin[oi]\b/, accessory: /\b(?:testin[ae]|ricambi|replacement|brush heads)\b/ },
    { device: /\b(?:smartphone|telefono|cellulare)\b/, accessory: /\b(?:cover|custodia|custodie|pellicola|protezione|caricabatterie|caricatore)\b/ },
    { device: /\b(?:cuffie|auricolari|headphones|earbuds)\b/, accessory: /\b(?:custodia|custodie|cuscinetti|ricambio|replacement)\b/ },
  ];
  return kinds.some(({device,accessory}) => {
    if (!device.test(requested) || accessory.test(requested)) return false;
    const accessoryPosition = offered.search(accessory);
    const devicePosition = offered.search(device);
    return accessoryPosition >= 0 && (devicePosition < 0 || accessoryPosition < devicePosition);
  });
}
