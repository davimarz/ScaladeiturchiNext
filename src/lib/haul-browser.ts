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
