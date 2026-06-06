/**
 * ACM-W India LinkedIn Scraper
 * Playwright-based scraper for public LinkedIn company posts
 * No authentication required - scrapes publicly visible content
 */

const { chromium } = require("playwright-core");

const LINKEDIN_URL =
  "https://www.linkedin.com/company/acm-w-india/posts/?feedView=all";
const MAX_POSTS = 10;
const MAX_RETRIES = 3;

/**
 * Sleep utility with exponential backoff
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a stable ID from post text + URL
 */
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

/**
 * Sanitize text content - remove null bytes, trim, collapse whitespace
 */
function sanitizeText(text) {
  if (!text) return "";
  return text
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000); // Cap at 2000 chars
}

/**
 * Parse relative LinkedIn date strings to ISO date
 */
function parseLinkedInDate(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();

  if (lower.includes("just now") || lower.includes("now")) {
    return now.toISOString().split("T")[0];
  }
  if (lower.includes("minute") || lower.includes("hour")) {
    return now.toISOString().split("T")[0];
  }
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

  // Try direct parse
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return now.toISOString().split("T")[0];
}

/**
 * Get Chromium executable path
 * Works both locally (system chromium) and on Netlify (sparticuz/chromium)
 */
async function getChromiumPath() {
  // On Netlify, use @sparticuz/chromium
  try {
    const chromiumPkg = require("@sparticuz/chromium");
    const execPath = await chromiumPkg.executablePath();
    if (execPath) {
      console.log("[scraper] Using @sparticuz/chromium:", execPath);
      return { executablePath: execPath, args: chromiumPkg.args };
    }
  } catch (e) {
    console.log("[scraper] @sparticuz/chromium not available, using system chromium");
  }

  // Fallback: try to find system chromium
  const possiblePaths = [
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ];

  const fs = require("fs");
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      console.log("[scraper] Using system chromium:", p);
      return { executablePath: p, args: [] };
    }
  }

  // Let Playwright use its bundled browser
  console.log("[scraper] Using Playwright bundled browser");
  return { executablePath: undefined, args: [] };
}

/**
 * Main scraping function
 * Attempts to extract posts from LinkedIn public page
 */
async function scrapeLinkedInPosts() {
  console.log("[scraper] Starting LinkedIn scrape:", new Date().toISOString());

  const chromiumConfig = await getChromiumPath();

  const launchOptions = {
    headless: true,
    args: [
      ...(chromiumConfig.args || []),
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--mute-audio",
      "--safebrowsing-disable-auto-update",
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
      "--ignore-certificate-errors-spki-list",
    ],
  };

  if (chromiumConfig.executablePath) {
    launchOptions.executablePath = chromiumConfig.executablePath;
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
      timezoneId: "Asia/Kolkata",
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const page = await context.newPage();

    // Block unnecessary resources to speed up loading
    await page.route("**/*.{woff,woff2,ttf,eot}", (route) => route.abort());
    await page.route("**/analytics**", (route) => route.abort());
    await page.route("**/tracking**", (route) => route.abort());
    await page.route("**/ads/**", (route) => route.abort());

    console.log("[scraper] Navigating to:", LINKEDIN_URL);
    await page.goto(LINKEDIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    // Wait for page content to stabilize
    await sleep(4000);

    // Scroll to trigger lazy loading
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await sleep(1500);
    }

    // Extract posts using multiple selector strategies
    const posts = await page.evaluate(
      ({ maxPosts }) => {
        const results = [];

        // Strategy 1: Try data-urn attributes on post containers
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

        const seen = new Set();

        postContainers.forEach((container) => {
          if (results.length >= maxPosts) return;

          try {
            // Extract text content
            const textSelectors = [
              ".feed-shared-update-v2__description",
              ".feed-shared-text",
              "[class*='commentary']",
              "[class*='description']",
              ".update-components-text",
              "p",
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

            if (!text) {
              const allText = container.innerText || "";
              if (allText.trim().length > 30) {
                text = allText.trim().substring(0, 500);
              }
            }

            if (!text || text.length < 10) return;
            if (seen.has(text.substring(0, 50))) return;
            seen.add(text.substring(0, 50));

            // Extract URL
            let url = "";
            const linkSelectors = [
              "a[href*='/posts/']",
              "a[href*='/feed/update/']",
              "a[href*='linkedin.com/feed']",
              "time a",
              "a[data-tracking-control-name*='post']",
            ];
            for (const sel of linkSelectors) {
              const link = container.querySelector(sel);
              if (link && link.href) {
                url = link.href;
                break;
              }
            }

            // Extract image
            let image = "";
            const imgSelectors = [
              "img[class*='feed-shared-image']",
              "img[class*='ivm-view-attr__img']",
              ".feed-shared-image img",
              ".update-components-image img",
              "img[src*='media.licdn.com']",
              "img[src*='dms.licdn.com']",
              ".feed-shared-article__image img",
            ];
            for (const sel of imgSelectors) {
              const img = container.querySelector(sel);
              if (img && img.src && !img.src.includes("ghost") && img.src.startsWith("http")) {
                image = img.src;
                break;
              }
            }

            // Extract date
            let date = "";
            const timeEl = container.querySelector("time");
            if (timeEl) {
              date =
                timeEl.getAttribute("datetime") ||
                timeEl.innerText ||
                "";
            }
            if (!date) {
              const dateEl = container.querySelector(
                "[class*='time-ago'], [class*='timestamp'], [class*='date']"
              );
              if (dateEl) date = dateEl.innerText || "";
            }

            results.push({ text, url, image, date });
          } catch (e) {
            // Skip malformed containers
          }
        });

        // Strategy 2: If no results, try raw text extraction from page
        if (results.length === 0) {
          const allLinks = Array.from(
            document.querySelectorAll('a[href*="linkedin.com"]')
          );
          const postLinks = allLinks.filter(
            (a) =>
              a.href.includes("/posts/") || a.href.includes("/feed/update/")
          );

          postLinks.slice(0, maxPosts).forEach((link) => {
            const parent =
              link.closest("article") ||
              link.closest("[data-urn]") ||
              link.parentElement;
            const text = parent ? parent.innerText.trim() : link.innerText.trim();
            if (text.length > 10) {
              results.push({
                text: text.substring(0, 500),
                url: link.href,
                image: "",
                date: "",
              });
            }
          });
        }

        return results.slice(0, maxPosts);
      },
      { maxPosts: MAX_POSTS }
    );

    console.log(`[scraper] Extracted ${posts.length} raw posts`);

    // Process and normalize posts
    const scrapedAt = new Date().toISOString();
    const normalizedPosts = posts
      .filter((p) => p.text && p.text.length > 5)
      .map((p, index) => ({
        id: generateId(p.text, p.url),
        text: sanitizeText(p.text),
        url: p.url
          ? p.url.startsWith("http")
            ? p.url
            : `https://www.linkedin.com${p.url}`
          : LINKEDIN_URL,
        image: p.image || "",
        date: parseLinkedInDate(p.date),
        scrapedAt,
      }));

    // Deduplicate by id
    const deduped = Array.from(
      new Map(normalizedPosts.map((p) => [p.id, p])).values()
    );

    console.log(`[scraper] Final posts count: ${deduped.length}`);
    return { success: true, posts: deduped, error: null };
  } catch (error) {
    console.error("[scraper] Error during scraping:", error.message);
    return { success: false, posts: [], error: error.message };
  } finally {
    await browser.close();
    console.log("[scraper] Browser closed");
  }
}

/**
 * Scrape with retry logic and exponential backoff
 */
async function scrapeWithRetry() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[scraper] Attempt ${attempt}/${MAX_RETRIES}`);

    const result = await scrapeLinkedInPosts();

    if (result.success && result.posts.length > 0) {
      console.log(`[scraper] Success on attempt ${attempt}`);
      return result;
    }

    lastError = result.error;
    console.warn(`[scraper] Attempt ${attempt} failed:`, lastError);

    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 2000; // 4s, 8s
      console.log(`[scraper] Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  console.error(`[scraper] All ${MAX_RETRIES} attempts failed`);
  return { success: false, posts: [], error: lastError };
}

module.exports = { scrapeWithRetry, scrapeLinkedInPosts };
