export type StoreProduct = {
    id: string;
    asin: string;
    title: string;
    description: string | null;
    image_url: string | null;
    affiliate_url: string;
    current_price: number | null;
    list_price: number | null;
    currency: string;
    discount_percent: number | null;
    price_verified_at: string | null;
    haul_category?: string | null;
    bestseller_rank?: number | null;
};
export const productCategories = [["tutte", "Tutte"], ["tecnologia", "Tecnologia"], ["casa", "Casa"], ["bellezza", "Bellezza"], ["tempo-libero", "Tempo libero"], ["altro", "Altri prodotti"]] as const;
export function normalizeWords(text: string) { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function usefulTitle(value: string) {
    const title = value.replace(/\s+/g, " ").trim();
    if (title.length < 8 || /^scegli (?:il paese|paese)|^accedi|^amazon\.it\s*:|^robot check|^pagina non trovata|^sorry|mostra visualizzazione per acquistare rapidamente|quick view|acquista rapidamente|visualizzazione rapida|la gamma di classi energetiche|sponsorizzato|sponsored|^prodotto amazon|^classe (?:energetica|di efficienza)/i.test(title)) return false;
    const words = title.split(/\s+/).filter(word => word !== "&" && word.length > 0);
    return !(words.length <= 3 && title.length <= 32 && !/\d/.test(title));
}
export function cleanTitle(title: string) { return title.replace(/\s+/g, " ").trim(); }
export function shortTitle(title: string, max = 105) {
    const clean = cleanTitle(title);
    if (clean.length <= max)
        return clean;
    const cut = clean.slice(0, max);
    return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 18)) + "…";
}
export function presentable(product: StoreProduct) {
    return usefulTitle(product.title) && /^https?:\/\//.test(product.image_url || "") && !/\/(?:11\+\+B3A2NEL|transparent-pixel|pixel\.|loading\.|no-image)/i.test(product.image_url || "") && (product.description || "").trim().length >= 20 && Number.isFinite(product.current_price) && (product.current_price || 0) > 0 && (product.current_price || 0) < 10000 && Boolean(product.price_verified_at && Number.isFinite(Date.parse(product.price_verified_at)) && Date.parse(product.price_verified_at) <= Date.now());
}
export function inferredCategory(title: string) {
    const t = normalizeWords(title);
    if (/\b(cuffi\w*|auricolar\w*|smartphone|tablet|computer|monitor|mouse|tastiera|usb|caricabatteri\w*|powerbank|smartwatch|bluetooth|ssd|hdmi|router|stampant\w*)\b/.test(t))
        return "tecnologia";
    if (!/\b(caffe|coffee)\b/.test(t) && /\b(shampoo|balsamo|crema|profumo|trucco|mascara|rasoio|rasoi|dentifricio|spazzolino|deodorante|capelli|pelle|makeup)\b/.test(t))
        return "bellezza";
    if (/\b(cucina|padell\w*|pentol\w*|caffe|friggitr\w*|aspirapolvere|lampad\w*|lenzuol\w*|cuscino|copert\w*|detersiv\w*|forno|lavatrice|lavastoviglie|tavol\w*|sedia|sedie|contenitor\w*|tazza|tazze|bollitor\w*|casa)\b/.test(t))
        return "casa";
    if (/\b(sport|fitness|bicicletta|bici|campeggio|palestra|gioco|giochi|giocattol\w*|pallone|zaino|libro|libri|scarpe|maglietta|pantaloni|tenda|outdoor)\b/.test(t))
        return "tempo-libero";
    return "altro";
}
export function productBrand(title: string) {
    return title.match(/\b(Apple|Samsung|Xiaomi|Sony|Philips|Lenovo|Logitech|Anker|Bose|JBL|Amazon Basics|Amazon Essentials|Nivea|L[’']?Or[eé]al|Braun|Oral-B|De[’']?Longhi|Ariete|Rowenta|Bosch|Tefal|LEGO|Adidas|Nike|SanDisk|Kingston|TP-Link|HP|ASUS|Acer)\b/i)?.[0] || "";
}
function nearWord(a: string, b: string) {
    if (a === b || b.startsWith(a))
        return true;
    if (a.length < 5 || Math.abs(a.length - b.length) > 1)
        return false;
    let i = 0, j = 0, errors = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i++;
            j++;
            continue;
        }
        if (++errors > 1)
            return false;
        if (a.length >= b.length)
            i++;
        if (b.length >= a.length)
            j++;
    }
    return errors + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
const aliases: Record<string, string[]> = { auricolari: ["cuffie", "earbuds"], cuffie: ["auricolari", "headphones"], telefonino: ["smartphone"], telefono: ["smartphone"], cellulare: ["smartphone"], pc: ["computer", "notebook", "laptop"], caffe: ["caffe", "coffee"], asciugacapelli: ["phon"], cucina: ["padella", "pentola", "cucina"], sport: ["sport", "fitness"] };
export function matchesSearch(product: StoreProduct, query: string) {
    const tokens = normalizeWords(product.title + " " + (product.description || "") + " " + product.asin).split(" ");
    return normalizeWords(query).split(" ").filter(Boolean).every(term => [term, ...(aliases[term] || [])].some(word => tokens.some(token => nearWord(word, token))));
}
export function discountValue(product: StoreProduct) {
    const price = product.current_price;
    if (!price || price <= 0)
        return 0;
    if (product.list_price && product.list_price > price)
        return Math.round((1 - price / product.list_price) * 100);
    return product.list_price == null && product.discount_percent && product.discount_percent > 0 && product.discount_percent < 100 ? product.discount_percent : 0;
}
export function sortProducts(products: StoreProduct[], sort: string, bestseller: boolean) {
    return [...products].sort((a, b) => {
        let difference = 0;
        if (sort === "price-asc")
            difference = (a.current_price && a.current_price > 0 ? a.current_price : Infinity) - (b.current_price && b.current_price > 0 ? b.current_price : Infinity);
        else if (sort === "price-desc")
            difference = (b.current_price || 0) - (a.current_price || 0);
        else if (sort === "discount")
            difference = discountValue(b) - discountValue(a);
        else if (bestseller)
            difference = (a.bestseller_rank ?? Infinity) - (b.bestseller_rank ?? Infinity);
        else
            difference = Number(presentable(b)) - Number(presentable(a));
        return (Number.isNaN(difference) ? 0 : difference) || a.id.localeCompare(b.id);
    });
}
export function observedDate(value: string, now = Date.now()) {
    const date = new Date(value);
    const day = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
    return day.format(date) === day.format(new Date(now)) ? "Prezzo rilevato oggi" : "Ultimo prezzo rilevato: " + day.format(date);
}
