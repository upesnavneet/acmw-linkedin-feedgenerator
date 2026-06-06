/**
 * ACM-W India LinkedIn Scraper
 * puppeteer-core + @sparticuz/chromium for Netlify Functions
 */

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

const LINKEDIN_URL =
  "https://www.linkedin.com/company/acm-w-india/posts/?feedView=all";
const MAX_POSTS = 10;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(text, url) {
  const raw = (text || "") + (url || "") + Date.now();
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/\0/g, "").replace(/\s+/g, " ").trim().substring(0, 2000);
}

function parseLinkedInDate(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();

  if (lower.includes("just now") || lower.includes("now")) return now.toISOString().split("T")[0];
  if (lower.includes("minute") || lower.includes("hour")) return now.toISOString().split("T")[0];
  if (lower.includes("yesterday")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
  const daysMatch = lower.match(/(\d+)\s*day/);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysMatch[1]));
    return d.toISOString().split("T")[0];
  }
  const weeksMatch = lower.match(/(\d+)\s*week/);
  if (weeksMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(weeksMatch[1]) * 7);
    return d.toISOString().split("T")[0];
  }
  const monthsMatch = lower.match(/(\d+)\s*month/);
  if (monthsMatch) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - parseInt(monthsMatch[1]));
    return d.toISOString().split("T")[0];
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return now.toISOString().split("T")[0];
}

async function scrapeLinkedInPosts() {
  console.log("[scraper] Starting scrape:", new Date().toISOString());

  let executablePath;
  try {
    executablePath = await chromium.executablePath();
    console.log("[scraper] Chromium executable:", executablePath);
  } catch (e) {
    console.error("[scraper] executablePath failed:", e.message);
    return { success: false, posts: [], error: e.message };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
    });
  } catch (e) {
    console.error("[scraper] Browser launch failed:", e.message);
    return { success: false, posts: [], error: e.message };
  }

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      const type = req.resourceType();
      if (type === "font" || url.includes("analytics") || url.includes("/ads/")) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log("[scraper] Navigating to:", LINKEDIN_URL);
    await page.goto(LINKEDIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

    await sleep(4000);

    // Scroll to trigger lazy loading
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await sleep(1500);
    }

    const posts = await page.evaluate((maxPosts) => {
      const results = [];
      const seen = new Set();

      const postContainers = document.querySelectorAll(
        [
          "[data-urn]",
          ".feed-shared-update-v2",
          ".occludable-update",
          "[class*='feed-shared']",
          "[class*='update-v2']",
          "article",
        ].join(", ")
      );

      postContainers.forEach((container) => {
        if (results.length >= maxPosts) return;

        try {
          const textSelectors = [
            ".feed-shared-update-v2__description",
            ".feed-shared-text",
            "[class*='commentary']",
            "[class*='description']",
            ".update-components-text",
            "span[dir]",
          ];

          let text = "";
          for (const sel of textSelectors) {
            const el = container.querySelector(sel);
            if (el && el.innerText && el.innerText.trim().length > 20) {
              text = el.innerText.trim();
              break;
            }
          }

          if (!text || text.length < 10) return;
          if (seen.has(text.substring(0, 50))) return;
          seen.add(text.substring(0, 50));

          let url = "";
          const linkSelectors = [
            "a[href*='/posts/']",
            "a[href*='/feed/update/']",
            "time a",
          ];
          for (const sel of linkSelectors) {
            const link = container.querySelector(sel);
            if (link && link.href) { url = link.href; break; }
          }

          let image = "";
          const imgSelectors = [
            "img[src*='media.licdn.com']",
            "img[src*='dms.licdn.com']",
            ".feed-shared-image img",
          ];
          for (const sel of imgSelectors) {
            const img = container.querySelector(sel);
            if (img && img.src && img.src.startsWith("http")) { image = img.src; break; }
          }

          let date = "";
          const timeEl = container.querySelector("time");
          if (timeEl) date = timeEl.getAttribute("datetime") || timeEl.innerText || "";

          results.push({ text, url, image, date });
        } catch (e) { }
      });

      return results.slice(0, maxPosts);
    }, MAX_POSTS);

    console.log("[scraper] Extracted", posts.length, "raw posts");

    const scrapedAt = new Date().toISOString();
    const normalized = posts
      .filter((p) => p.text && p.text.length > 5)
      .map((p) => ({
        id: generateId(p.text, p.url),
        text: sanitizeText(p.text),
        url: p.url
          ? p.url.startsWith("http") ? p.url : "https://www.linkedin.com" + p.url
          : LINKEDIN_URL,
        image: p.image || "",
        date: parseLinkedInDate(p.date),
        scrapedAt,
      }));

    const deduped = Array.from(new Map(normalized.map((p) => [p.id, p])).values());
    console.log("[scraper] Final posts:", deduped.length);
    return { success: true, posts: deduped, error: null };

  } catch (error) {
    console.error("[scraper] Error:", error.message);
    return { success: false, posts: [], error: error.message };
  } finally {
    await browser.close();
    console.log("[scraper] Browser closed");
  }
}

async function scrapeWithRetry() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log("[scraper] Attempt", attempt, "/", MAX_RETRIES);
    const result = await scrapeLinkedInPosts();

    if (result.success && result.posts.length > 0) {
      console.log("[scraper] Success on attempt", attempt);
      return result;
    }

    lastError = result.error;
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 2000;
      console.log("[scraper] Retrying in", delay, "ms...");
      await sleep(delay);
    }
  }

  console.error("[scraper] All attempts failed");
  return { success: false, posts: [], error: lastError };
}

module.exports = { scrapeWithRetry, scrapeLinkedInPosts };