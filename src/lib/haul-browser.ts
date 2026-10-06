import "server-only";

const MAX_SCROLLS = 60;
const STABLE_ROUNDS_TO_STOP = 5;
const WAIT_AFTER_SCROLL_MS = 1100;

export type HaulBrowserResult = {
  html: string;
  asinCount: number;
  scrolls: number;
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
      const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
      if (!host) throw new Error("Vercel Chromium pack URL is unavailable");
      const packUrl = `https://${host}/chromium-pack.tar`;
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
  mode: "haul" | "search" = "haul",
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
        loaded = true;
        break;
      }
    }

    if (!loaded) throw new Error("Amazon browser HTTP " + (lastStatus || 503));

    await sleep(mode === "search" ? 2600 : 1500);

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
        for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/"]'))) {
          const match = link.href.match(/\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i);
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

      await sleep(mode === "search" ? 1400 : WAIT_AFTER_SCROLL_MS);
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
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/"]'))) {
        const match = link.href.match(/\/dp\/([A-Z0-9]{10})(?:[/?#]|$)/i);
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

        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/dp/' + asin + '"]'));
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

    const finalCount = await countAsins();
    if (!Number.isFinite(finalCount) || finalCount < 1) {
      throw new Error(mode === "search"
        ? "No Amazon search products found after browser scrolling"
        : "No HAUL products found after browser scrolling");
    }

    return { html, asinCount: finalCount, scrolls };
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
