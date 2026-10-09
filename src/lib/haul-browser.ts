import "server-only";

const MAX_SCROLLS = 60;
const STABLE_ROUNDS_TO_STOP = 5;
const WAIT_AFTER_SCROLL_MS = 1100;

export type BrowserListingProduct = {
  asin: string;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  haulCategory: string | null;
};

export type HaulBrowserResult = {
  html: string;
  asinCount: number;
  scrolls: number;
  products: BrowserListingProduct[];
  asins: string[];
};

let cachedExecutablePath: string | null = null;
let executablePathPromise: Promise<string> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getChromiumExecutablePath() {
  if (cachedExecutablePath) return cachedExecutablePath;
  if (!executablePathPromise) {
    executablePathPromise = (async () => {
      const chromium = (await import("@sparticuz/chromium-min")).default;
      const architecture = process.arch === "arm64" ? "arm64" : "x64";
      const defaultPackUrl =
        `https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.${architecture}.tar`;
      const packUrl = process.env.CHROMIUM_PACK_URL || defaultPackUrl;
      const executablePath = await chromium.executablePath(packUrl);
      cachedExecutablePath = executablePath;
      return executablePath;
    })().catch((error) => {
      executablePathPromise = null;
      throw error;
    });
  }
  return executablePathPromise;
}

async function fetchAmazonWithFullScroll(
  url: string,
  mode: "haul" | "search" | "bestsellers" = "haul",
): Promise<HaulBrowserResult> {
  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = await import("puppeteer-core");
  chromium.setGraphicsMode = false;

  const args = [...chromium.args];
  if (!args.includes("--disable-blink-features=AutomationControlled")) {
    args.push("--disable-blink-features=AutomationControlled");
  }

  const browser = await puppeteer.launch({
    args,
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    executablePath: await getChromiumExecutablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
      "accept-language": "it-IT,it;q=0.9,en;q=0.7",
      "upgrade-insecure-requests": "1",
    });
    await page.emulateTimezone("Europe/Rome").catch(() => undefined);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["it-IT", "it", "en-US", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });

    const candidateUrls = mode === "search"
      ? [
          url,
          "https://www.amazon.it/gp/goldbox/?ie=UTF8&ref_=topnav_storetab_gb",
          "https://www.amazon.it/s?k=offerte+lampo+del+giorno",
        ]
      : [url];

    let loaded = false;
    let lastStatus = 0;
    for (let attempt = 0; attempt < candidateUrls.length; attempt++) {
      if (attempt > 0) await sleep(1800);
      const response = await page.goto(candidateUrls[attempt], {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      lastStatus = response?.status() ?? 0;
      const title = await page.title().catch(() => "");
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) ?? "").catch(() => "");
      const blocked =
        lastStatus === 403 ||
        lastStatus === 429 ||
        lastStatus === 503 ||
        /robot check|captcha|inserisci i caratteri|sorry|automated access/i.test(title + "\n" + bodyText);

      if (!blocked && lastStatus < 400) {
        if (mode === "search") {
          await sleep(1600);
          const initialAsins = await page.evaluate(() => {
            const asins = new Set<string>();
            for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))) {
              const asin = (element.dataset.asin || "").trim().toUpperCase();
              if (/^[A-Z0-9]{10}$/.test(asin)) asins.add(asin);
            }
            for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
              const href = link.href || "";
              const match =
                href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i) ||
                href.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:[&#]|$)/);
              if (match) asins.add(match[1].toUpperCase());
            }
            return asins.size;
          }).catch(() => 0);

          if (initialAsins < 1 && attempt < candidateUrls.length - 1) {
            continue;
          }
        }

        loaded = true;
        break;
      }
    }

    if (!loaded) throw new Error("Amazon browser HTTP " + (lastStatus || 503));

    await sleep(mode === "search" || mode === "bestsellers" ? 2600 : 1500);

    await page.evaluate(() => {
      const labels = ["accetta", "accetto", "accept", "continua senza accettare"];
      const controls = Array.from(document.querySelectorAll<HTMLElement>("button, input[type=submit]"));
      const target = controls.find((element) => {
        const text = (element.innerText || element.getAttribute("value") || "").trim().toLowerCase();
        return labels.some((label) => text === label || text.includes(label));
      });
      target?.click();
    }).catch(() => undefined);

    async function countAsins() {
      return await page.evaluate(() => {
        const asins = new Set<string>();
        for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))) {
          const asin = (element.dataset.asin || "").trim().toUpperCase();
          if (/^[A-Z0-9]{10}$/.test(asin)) asins.add(asin);
        }
        for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
          const href = link.href || "";
          const match =
            href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i) ||
            href.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:[&#]|$)/);
          if (match) asins.add(match[1].toUpperCase());
        }
        return asins.size;
      });
    }

    let previousCount = await countAsins();
    let stableRounds = 0;
    let scrolls = 0;

    for (; scrolls < MAX_SCROLLS && stableRounds < STABLE_ROUNDS_TO_STOP; scrolls++) {
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a"));
        const more = candidates.find((element) => {
          const text = (element.innerText || "").trim().toLowerCase();
          return /mostra altro|carica altro|vedi altro|scopri altro|show more|load more/.test(text);
        });
        more?.click();
        window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
      });

      await sleep(mode === "search" || mode === "bestsellers" ? 1400 : WAIT_AFTER_SCROLL_MS);
      const currentCount = await countAsins();

      if (currentCount > previousCount) {
        previousCount = currentCount;
        stableRounds = 0;
      } else {
        stableRounds++;
      }
    }

    await page.evaluate(() => {
      const generic = /mostra visualizzazione per acquistare rapidamente|quick view|acquista rapidamente|visualizzazione rapida|immagine del prodotto|product image|sponsorizzato|sponsored|vedi su amazon|aggiungi al carrello/i;
      const weakBrandOnly = (value: string) => {
        const text = value.replace(/\s+/g, " ").trim();
        const words = text.split(/\s+/).filter(Boolean);
        return words.length <= 3 && text.length <= 36 && !/\d/.test(text);
      };
      const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();

      const asins = new Set<string>();
      for (const marker of Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))) {
        const asin = clean(marker.dataset.asin).toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(asin)) asins.add(asin);
      }
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = link.href || "";
        const match =
          href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i) ||
          href.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:[&#]|$)/);
        if (match) asins.add(match[1].toUpperCase());
      }

      for (const asin of asins) {
        const candidates: Array<{ text: string; score: number }> = [];
        const add = (value: string | null | undefined, score: number) => {
          const text = clean(value);
          if (text.length < 8 || generic.test(text)) return;
          if (/^(HAUL|Amazon|Bestseller|Offerta top|Offerta|Nuovo)$/i.test(text)) return;
          if (/^[-+]?\d+(?:[.,]\d+)?\s*€?$/.test(text)) return;
          candidates.push({ text: text.slice(0, 300), score });
        };

        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((link) => {
          const href = link.href || "";
          return href.includes("/dp/" + asin) ||
            href.includes("/gp/product/" + asin) ||
            href.includes("/gp/aw/d/" + asin) ||
            href.includes("asin=" + asin) ||
            href.includes("ASIN=" + asin);
        });
        for (const link of links) {
          add(link.getAttribute("aria-label"), 120);
          add(link.getAttribute("title"), 115);
          add(link.innerText || link.textContent, 105);

          for (const image of Array.from(link.querySelectorAll<HTMLImageElement>("img"))) add(image.alt, 145);

          try {
            const url = new URL(link.href, location.href);
            const match = url.pathname.match(/^\/([^/]+)\/dp\/([A-Z0-9]{10})(?:\/|$)/i);
            if (match && match[2].toUpperCase() === asin) {
              add(decodeURIComponent(match[1]).replace(/[-_]+/g, " "), 135);
            }
          } catch {}

          let ancestor: HTMLElement | null = link;
          for (let depth = 0; ancestor && depth < 7; depth++, ancestor = ancestor.parentElement) {
            for (const selector of [
              "h2 span",
              "h2 a",
              "[data-csa-c-content-id*='title']",
              "[data-cy='title-recipe'] span",
              ".a-size-medium.a-color-base.a-text-normal",
              ".a-size-base-plus.a-color-base.a-text-normal",
              ".a-text-normal",
            ]) {
              for (const element of Array.from(ancestor.querySelectorAll<HTMLElement>(selector))) {
                add(element.innerText || element.textContent, 150 - depth * 8);
              }
            }
            for (const image of Array.from(ancestor.querySelectorAll<HTMLImageElement>("img"))) {
              add(image.alt, 142 - depth * 6);
            }
          }
        }

        if (!candidates.length) continue;
        candidates.sort((a, b) => {
          const quality = (item: { text: string; score: number }) => {
            const words = item.text.split(/\s+/).filter(Boolean).length;
            const brandPenalty = weakBrandOnly(item.text) ? 180 : 0;
            const detailBonus = Math.min(words, 24) * 10 + Math.min(item.text.length, 220);
            return item.score + detailBonus - brandPenalty;
          };
          return quality(b) - quality(a);
        });

        const best = candidates[0].text;
        for (const marker of Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))) {
          if ((marker.dataset.asin || "").trim().toUpperCase() === asin) marker.dataset.sdtTitle = best;
        }
      }
    }).catch(() => undefined);

    const title = await page.title();
    const html = await page.content();
    if (/robot check|captcha/i.test(title) || /\/errors\/validateCaptcha|robot check/i.test(html)) {
      throw new Error("Amazon blocked the browser session");
    }

    const discoveredAsins = await page.evaluate(() => {
      const asins = new Set<string>();
      const add = (value: string | null | undefined) => {
        const asin = (value || "").trim().toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(asin)) asins.add(asin);
      };

      for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))) {
        add(element.dataset.asin);
      }

      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = link.href || "";
        const match =
          href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i) ||
          href.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:[&#]|$)/);
        if (match) add(match[1]);
      }

      const html = document.documentElement.innerHTML;
      const patterns = [
        /["']asin["']\s*:\s*["']([A-Z0-9]{10})["']/gi,
        /["']ASIN["']\s*:\s*["']([A-Z0-9]{10})["']/g,
        /%22asin%22%3A%22([A-Z0-9]{10})%22/gi,
        /\/dp\/([A-Z0-9]{10})(?:[/?#"'&]|$)/gi,
        /\/gp\/product\/([A-Z0-9]{10})(?:[/?#"'&]|$)/gi,
      ];
      for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) !== null) add(match[1]);
      }

      return [...asins];
    }).catch(() => []);

    const finalCount = discoveredAsins.length;
    if (!Number.isFinite(finalCount) || finalCount < 1) {
      throw new Error(mode === "search"
        ? "No Amazon search products found after browser scrolling"
        : mode === "bestsellers"
          ? "No Amazon Bestseller products found after browser scrolling"
          : "No HAUL products found after browser scrolling");
    }

    const products = await page.evaluate(() => {
      const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
      const money = (value: string | null | undefined) => {
        const text = clean(value).replace(/\s/g, "").replace(/€/g, "");
        if (!text) return null;
        const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
        const number = Number(normalized);
        return Number.isFinite(number) && number > 0 && number < 10000 ? number : null;
      };
      const validImage = (value: string | null | undefined) => {
        const url = clean(value);
        if (!/^https:\/\/(?:m\.media-amazon\.com|images-(?:na|eu|fe)\.ssl-images-amazon\.com)\//i.test(url)) return null;
        if (/transparent-pixel|\/pixel\.|\/loading\.|\/no-image|11\+\+B3A2NEL/i.test(url)) return null;
        return url;
      };
      const results = new Map<string, {
        asin: string;
        title: string;
        imageUrl: string | null;
        currentPrice: number | null;
        listPrice: number | null;
        discountPercent: number | null;
        haulCategory: null;
      }>();

      const asins = new Set<string>();
      for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))) {
        const asin = clean(element.dataset.asin).toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(asin)) asins.add(asin);
      }
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = link.href || "";
        const match =
          href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i) ||
          href.match(/[?&](?:asin|ASIN)=([A-Z0-9]{10})(?:[&#]|$)/);
        if (match) asins.add(match[1].toUpperCase());
      }

      for (const asin of asins) {
        const marker = Array.from(document.querySelectorAll<HTMLElement>("[data-asin]"))
          .find((element) => clean(element.dataset.asin).toUpperCase() === asin);
        const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((candidate) => {
          const href = candidate.href || "";
          return href.includes("/dp/" + asin) ||
            href.includes("/gp/product/" + asin) ||
            href.includes("/gp/aw/d/" + asin) ||
            href.includes("asin=" + asin) ||
            href.includes("ASIN=" + asin);
        }) || null;
        const card = marker || link?.closest<HTMLElement>("[data-component-type='s-search-result'], article, li, div") || link?.parentElement;
        if (!card) continue;

        const title =
          clean(marker?.dataset.sdtTitle) ||
          clean(card.querySelector<HTMLElement>("h2 span")?.innerText) ||
          clean(card.querySelector<HTMLElement>(".a-text-normal")?.innerText) ||
          clean(card.querySelector<HTMLImageElement>("img")?.alt) ||
          ("Prodotto Amazon " + asin);

        const image = card.querySelector<HTMLImageElement>("img");
        let imageUrl =
          validImage(image?.getAttribute("data-old-hires")) ||
          validImage(image?.getAttribute("data-src")) ||
          validImage(image?.currentSrc) ||
          validImage(image?.src);

        if (!imageUrl && image?.getAttribute("srcset")) {
          const candidates = image.getAttribute("srcset")!.split(",")
            .map((part) => validImage(part.trim().split(/\s+/)[0]))
            .filter((value): value is string => Boolean(value));
          imageUrl = candidates.at(-1) || null;
        }

        const currentText =
          card.querySelector<HTMLElement>(".a-price:not(.a-text-price) .a-offscreen")?.textContent ||
          card.querySelector<HTMLElement>(".a-price-whole")?.textContent ||
          null;
        const fractionText = card.querySelector<HTMLElement>(".a-price-fraction")?.textContent || "00";
        let currentPrice = money(currentText);
        if (currentPrice == null && currentText && !currentText.includes(",")) {
          currentPrice = money(clean(currentText) + "," + clean(fractionText));
        }

        const listPrice = money(
          card.querySelector<HTMLElement>(".a-text-price .a-offscreen")?.textContent ||
          card.querySelector<HTMLElement>("[data-a-strike='true'] .a-offscreen")?.textContent ||
          null
        );

        const cardText = clean(card.innerText);
        const explicitDiscount = cardText.match(/-\s*([0-9]{1,2})\s*%/)?.[1];
        let discountPercent = explicitDiscount ? Number(explicitDiscount) : null;
        if (discountPercent == null && currentPrice != null && listPrice != null && listPrice > currentPrice) {
          discountPercent = Math.round(((listPrice - currentPrice) / listPrice) * 100);
        }

        results.set(asin, {
          asin,
          title: title.slice(0, 300),
          imageUrl,
          currentPrice,
          listPrice: listPrice != null && currentPrice != null && listPrice > currentPrice ? listPrice : null,
          discountPercent: discountPercent != null && discountPercent > 0 && discountPercent < 100 ? discountPercent : null,
          haulCategory: null,
        });
      }

      return [...results.values()];
    }).catch(() => []);

    const productMap = new Map(products.map((product) => [product.asin, product]));
    for (const asin of discoveredAsins) {
      if (productMap.has(asin)) continue;
      productMap.set(asin, {
        asin,
        title: "Prodotto Amazon " + asin,
        imageUrl: null,
        currentPrice: null,
        listPrice: null,
        discountPercent: null,
        haulCategory: null,
      });
    }

    const mergedProducts = [...productMap.values()];
    return { html, asinCount: discoveredAsins.length, scrolls, products: mergedProducts, asins: discoveredAsins };
  } finally {
    await browser.close();
  }
}

export async function fetchHaulWithFullScroll(url: string): Promise<HaulBrowserResult> {
  return fetchAmazonWithFullScroll(url, "haul");
}

export async function fetchAmazonSearchWithFullScroll(url: string): Promise<HaulBrowserResult> {
  return fetchAmazonWithFullScroll(url, "search");
}

export async function fetchAmazonBestsellersWithFullScroll(url: string): Promise<HaulBrowserResult> {
  return fetchAmazonWithFullScroll(url, "bestsellers");
}

export async function fetchAmazonKeywordSearchWithFullScroll(url: string): Promise<HaulBrowserResult> {
  return fetchAmazonWithFullScroll(url, "bestsellers");
}


export async function fetchAmazonProductTitlesWithBrowser(asins: string[]) {
  const uniqueAsins = [...new Set(asins.map((asin) => asin.trim().toUpperCase()).filter((asin) => /^[A-Z0-9]{10}$/.test(asin)))];
  if (!uniqueAsins.length) return new Map<string, string>();

  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = await import("puppeteer-core");
  chromium.setGraphicsMode = false;

  const args = [...chromium.args];
  if (!args.includes("--disable-blink-features=AutomationControlled")) {
    args.push("--disable-blink-features=AutomationControlled");
  }

  const browser = await puppeteer.launch({
    args,
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    executablePath: await getChromiumExecutablePath(),
    headless: true,
  });

  const results = new Map<string, string>();
  try {
    for (let offset = 0; offset < uniqueAsins.length; offset += 4) {
      const batch = uniqueAsins.slice(offset, offset + 4);
      const entries = await Promise.all(batch.map(async (asin) => {
        const page = await browser.newPage();
        try {
          await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          );
          await page.setExtraHTTPHeaders({ "accept-language": "it-IT,it;q=0.9,en;q=0.7" });
          const response = await page.goto("https://www.amazon.it/dp/" + asin, {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          });
          if (!response || [403, 429, 503].includes(response.status())) return [asin, null] as const;

          const data = await page.evaluate(() => {
            const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
            const generic = /mostra visualizzazione per acquistare rapidamente|quick view|acquista rapidamente|visualizzazione rapida|robot check|amazon\.it\s*$/i;

            const candidates: string[] = [];
            const add = (value: string | null | undefined) => {
              const text = clean(value).replace(/\s*:\s*Amazon\.it.*$/i, "");
              if (text.length >= 8 && !generic.test(text)) candidates.push(text);
            };

            add(document.querySelector<HTMLElement>("#productTitle")?.innerText);
            add(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content);
            add(document.querySelector<HTMLMetaElement>('meta[name="title"]')?.content);

            for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
              try {
                const parsed = JSON.parse(script.textContent || "null");
                const items = Array.isArray(parsed) ? parsed : [parsed];
                for (const item of items) {
                  if (item && typeof item === "object" && (item["@type"] === "Product" || item["@type"]?.includes?.("Product"))) {
                    add(item.name);
                  }
                }
              } catch {}
            }

            add(document.title);
            candidates.sort((a, b) => b.length - a.length);
            return candidates[0] || null;
          });

          if (data) return [asin, data.slice(0, 300)] as const;

          await page.goto("https://www.amazon.it/s?k=" + encodeURIComponent(asin), {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          }).catch(() => null);

          const fallback = await page.evaluate((targetAsin) => {
            const card = document.querySelector<HTMLElement>('[data-asin="' + targetAsin + '"]');
            if (!card) return null;
            const title =
              card.querySelector<HTMLElement>("h2 span")?.innerText ||
              card.querySelector<HTMLElement>(".a-text-normal")?.innerText ||
              card.querySelector<HTMLImageElement>("img")?.alt ||
              "";
            const clean = title.replace(/\s+/g, " ").trim();
            return /mostra visualizzazione per acquistare rapidamente|quick view/i.test(clean) ? null : clean;
          }, asin).catch(() => null);

          return [asin, fallback ? fallback.slice(0, 300) : null] as const;
        } finally {
          await page.close().catch(() => undefined);
        }
      }));

      for (const [asin, title] of entries) {
        if (title) results.set(asin, title);
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}


export async function fetchAmazonProductImagesWithBrowser(asins: string[]) {
  const uniqueAsins = [...new Set(asins.map((asin) => asin.trim().toUpperCase()).filter((asin) => /^[A-Z0-9]{10}$/.test(asin)))];
  if (!uniqueAsins.length) return new Map<string, string>();

  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = await import("puppeteer-core");
  chromium.setGraphicsMode = false;

  const args = [...chromium.args];
  if (!args.includes("--disable-blink-features=AutomationControlled")) {
    args.push("--disable-blink-features=AutomationControlled");
  }

  const browser = await puppeteer.launch({
    args,
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    executablePath: await getChromiumExecutablePath(),
    headless: true,
  });

  const results = new Map<string, string>();
  const generic = /\/11\+\+B3A2NEL\._SS200_\.png(?:\?|$)|transparent-pixel|\/pixel\.|\/loading\.|\/no-image/i;

  try {
    for (let offset = 0; offset < uniqueAsins.length; offset += 4) {
      const batch = uniqueAsins.slice(offset, offset + 4);
      const entries = await Promise.all(batch.map(async (asin) => {
        const page = await browser.newPage();
        try {
          await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          );
          await page.setExtraHTTPHeaders({ "accept-language": "it-IT,it;q=0.9,en;q=0.7" });
          const response = await page.goto("https://www.amazon.it/dp/" + asin, {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          });
          if (!response || [403, 429, 503].includes(response.status())) return [asin, null] as const;

          const image = await page.evaluate(() => {
            const candidates: string[] = [];
            const add = (value: string | null | undefined) => {
              if (!value) return;
              const url = value.trim();
              if (!url) return;
              candidates.push(url);
            };

            const main = document.querySelector<HTMLImageElement>("#landingImage, #imgBlkFront, #mainImage, #ebooksImgBlkFront");
            if (main) {
              add(main.getAttribute("data-old-hires"));
              add(main.getAttribute("data-hires"));
              add(main.currentSrc);
              add(main.src);
              const dynamic = main.getAttribute("data-a-dynamic-image");
              if (dynamic) {
                try {
                  const parsed = JSON.parse(dynamic);
                  for (const key of Object.keys(parsed)) add(key);
                } catch {}
              }
            }

            add(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content);
            add(document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content);

            for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
              try {
                const parsed = JSON.parse(script.textContent || "null");
                const items = Array.isArray(parsed) ? parsed : [parsed];
                for (const item of items) {
                  if (!item || typeof item !== "object") continue;
                  const image = item.image;
                  if (Array.isArray(image)) image.forEach((value: unknown) => typeof value === "string" && add(value));
                  else if (typeof image === "string") add(image);
                }
              } catch {}
            }

            const valid = candidates.filter((value) =>
              /^https:\/\/(?:m\.media-amazon\.com|images-(?:na|eu|fe)\.ssl-images-amazon\.com)\//i.test(value)
            );
            valid.sort((a, b) => b.length - a.length);
            return valid[0] || null;
          }).catch(() => null);

          if (image && !generic.test(image)) return [asin, image] as const;

          await page.goto("https://www.amazon.it/s?k=" + encodeURIComponent(asin), {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          }).catch(() => null);

          const fallback = await page.evaluate((targetAsin) => {
            const card = document.querySelector<HTMLElement>('[data-asin="' + targetAsin + '"]');
            const img = card?.querySelector<HTMLImageElement>("img");
            return img?.currentSrc || img?.src || null;
          }, asin).catch(() => null);

          return [asin, fallback && !generic.test(fallback) ? fallback : null] as const;
        } finally {
          await page.close().catch(() => undefined);
        }
      }));

      for (const [asin, image] of entries) {
        if (image) results.set(asin, image);
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}


export type AmazonBrowserSnapshot = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  listPrice: number | null;
  discountPercent: number | null;
  currency: "EUR";
};

export async function fetchAmazonProductSnapshotsWithBrowser(asins: string[]) {
  const uniqueAsins = [...new Set(asins.map((asin) => asin.trim().toUpperCase()).filter((asin) => /^[A-Z0-9]{10}$/.test(asin)))];
  const results = new Map<string, AmazonBrowserSnapshot>();
  if (!uniqueAsins.length) return results;

  const chromium = (await import("@sparticuz/chromium-min")).default;
  const puppeteer = await import("puppeteer-core");
  chromium.setGraphicsMode = false;

  const args = [...chromium.args];
  if (!args.includes("--disable-blink-features=AutomationControlled")) {
    args.push("--disable-blink-features=AutomationControlled");
  }

  const browser = await puppeteer.launch({
    args,
    defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
    executablePath: await getChromiumExecutablePath(),
    headless: true,
  });

  try {
    for (let offset = 0; offset < uniqueAsins.length; offset += 3) {
      const batch = uniqueAsins.slice(offset, offset + 3);
      const snapshots = await Promise.all(batch.map(async (asin) => {
        const page = await browser.newPage();
        try {
          await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
          );
          await page.setExtraHTTPHeaders({ "accept-language": "it-IT,it;q=0.9,en;q=0.7" });

          const response = await page.goto("https://www.amazon.it/dp/" + asin, {
            waitUntil: "domcontentloaded",
            timeout: 20_000,
          });
          if (!response || [403, 429, 503].includes(response.status())) return [asin, null] as const;

          const snapshot = await page.evaluate((targetAsin) => {
            const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
            const parseMoney = (value: string | null | undefined) => {
              const text = clean(value).replace(/€/g, "").replace(/\s/g, "");
              if (!text) return null;
              const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
              const amount = Number(normalized.replace(/[^0-9.-]/g, ""));
              return Number.isFinite(amount) && amount > 0 ? amount : null;
            };

            const pageAsin =
              (document.querySelector<HTMLInputElement>("#ASIN")?.value ||
               document.querySelector<HTMLInputElement>('input[name="ASIN"]')?.value || "").toUpperCase();
            if (pageAsin && pageAsin !== targetAsin) return null;

            const title =
              clean(document.querySelector<HTMLElement>("#productTitle")?.innerText) ||
              clean(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content).replace(/\s*:\s*Amazon\.it.*$/i, "") ||
              null;

            const descriptionCandidates: string[] = [];
            const addDescription = (value: string | null | undefined) => {
              const text = clean(value);
              if (text.length >= 12) descriptionCandidates.push(text);
            };
            for (const item of Array.from(document.querySelectorAll<HTMLElement>("#feature-bullets li span.a-list-item"))) {
              addDescription(item.innerText || item.textContent);
            }
            addDescription(document.querySelector<HTMLElement>("#productDescription")?.innerText);
            addDescription(document.querySelector<HTMLElement>("#aplus_feature_div")?.innerText);
            const description = descriptionCandidates
              .filter((value, index, values) => values.indexOf(value) === index)
              .slice(0, 6)
              .join(" · ")
              .slice(0, 1400) || null;

            const currentText =
              document.querySelector<HTMLElement>(".priceToPay .a-offscreen, .apexPriceToPay .a-offscreen")?.textContent ||
              document.querySelector<HTMLElement>("#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen")?.textContent ||
              document.querySelector<HTMLElement>("#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen")?.textContent ||
              null;
            const listText =
              document.querySelector<HTMLElement>(".basisPrice .a-offscreen, .a-text-price .a-offscreen")?.textContent ||
              null;

            const currentPrice = parseMoney(currentText);
            let listPrice = parseMoney(listText);
            if (currentPrice != null && listPrice != null && listPrice <= currentPrice) listPrice = null;

            const discountText =
              document.querySelector<HTMLElement>(".savingsPercentage, .reinventPriceSavingsPercentageMargin")?.textContent || "";
            const discountMatch = discountText.match(/([0-9]{1,2})\s*%/);
            let discountPercent = discountMatch ? Number(discountMatch[1]) : null;
            if (discountPercent == null && currentPrice != null && listPrice != null) {
              discountPercent = Math.round(((listPrice - currentPrice) / listPrice) * 100);
            }

            const imageCandidates: string[] = [];
            const addImage = (value: string | null | undefined) => {
              const url = clean(value);
              if (url) imageCandidates.push(url);
            };
            const main = document.querySelector<HTMLImageElement>("#landingImage, #imgBlkFront, #mainImage, #ebooksImgBlkFront");
            if (main) {
              addImage(main.getAttribute("data-old-hires"));
              addImage(main.getAttribute("data-hires"));
              addImage(main.currentSrc);
              addImage(main.src);
              const dynamic = main.getAttribute("data-a-dynamic-image");
              if (dynamic) {
                try {
                  const parsed = JSON.parse(dynamic);
                  Object.keys(parsed).forEach(addImage);
                } catch {}
              }
            }
            addImage(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content);

            const imageUrl = imageCandidates.find((value) =>
              /^https:\/\/(?:m\.media-amazon\.com|images-(?:na|eu|fe)\.ssl-images-amazon\.com)\//i.test(value) &&
              !/transparent-pixel|\/pixel\.|\/loading\.|\/no-image|11\+\+B3A2NEL/i.test(value)
            ) || null;

            return { title, description, imageUrl, currentPrice, listPrice, discountPercent, currency: "EUR" as const };
          }, asin).catch(() => null);

          if (snapshot && (snapshot.currentPrice != null || snapshot.imageUrl)) return [asin, snapshot] as const;

          await page.goto("https://www.amazon.it/s?k=" + encodeURIComponent(asin), {
            waitUntil: "domcontentloaded",
            timeout: 15_000,
          }).catch(() => null);

          const fallback = await page.evaluate((targetAsin) => {
            const card = document.querySelector<HTMLElement>('[data-asin="' + targetAsin + '"]');
            if (!card) return null;
            const clean = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();
            const parseMoney = (value: string | null | undefined) => {
              const text = clean(value).replace(/€/g, "").replace(/\s/g, "");
              if (!text) return null;
              const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
              const amount = Number(normalized.replace(/[^0-9.-]/g, ""));
              return Number.isFinite(amount) && amount > 0 ? amount : null;
            };
            const title = clean(card.querySelector<HTMLElement>("h2 span")?.innerText || card.querySelector<HTMLImageElement>("img")?.alt) || null;
            const description = clean(card.innerText).slice(0, 900) || null;
            const imageUrl = card.querySelector<HTMLImageElement>("img")?.currentSrc || card.querySelector<HTMLImageElement>("img")?.src || null;
            const currentPrice = parseMoney(card.querySelector<HTMLElement>(".a-price:not(.a-text-price) .a-offscreen")?.textContent);
            let listPrice = parseMoney(card.querySelector<HTMLElement>(".a-text-price .a-offscreen")?.textContent);
            if (currentPrice != null && listPrice != null && listPrice <= currentPrice) listPrice = null;
            const discountPercent = currentPrice != null && listPrice != null
              ? Math.round(((listPrice - currentPrice) / listPrice) * 100)
              : null;
            return { title, description, imageUrl, currentPrice, listPrice, discountPercent, currency: "EUR" as const };
          }, asin).catch(() => null);

          return [asin, fallback] as const;
        } finally {
          await page.close().catch(() => undefined);
        }
      }));

      for (const [asin, snapshot] of snapshots) {
        if (snapshot) results.set(asin, snapshot);
      }
    }
    return results;
  } finally {
    await browser.close();
  }
}
