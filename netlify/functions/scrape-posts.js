/**
 * Netlify Scheduled Function: scrape-posts
 * Runs every 6 hours via cron schedule in netlify.toml
 * Schedule: "0 */6 * * *"
 *
 * Also accessible via GET /api/trigger-scrape for manual triggers
 */

const { schedule } = require("@netlify/functions");
const { scrapeWithRetry } = require("./lib/scraper");
const { readPosts, writePosts, mergePosts } = require("./lib/storage");

/**
 * Core scraping handler
 */
async function handler(event, context) {
  const startTime = Date.now();
  console.log("[scrape-posts] Function invoked at:", new Date().toISOString());
  console.log("[scrape-posts] Event type:", event.type || "http");

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  // Auth check for manual HTTP triggers (basic protection)
  if (event.httpMethod === "GET") {
    const authHeader = event.headers?.authorization || "";
    const apiKey = process.env.SCRAPE_API_KEY || "";
    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }
  }

  // Load existing posts (fallback data)
  const existingPosts = readPosts();
  console.log(`[scrape-posts] Loaded ${existingPosts.length} existing posts`);

  // Run scraper
  const scrapeResult = await scrapeWithRetry();

  let finalPosts = existingPosts;
  let status = "cached";

  if (scrapeResult.success && scrapeResult.posts.length > 0) {
    // Merge new posts with existing
    finalPosts = mergePosts(existingPosts, scrapeResult.posts, 10);

    // Save to storage
    try {
      writePosts(finalPosts);
      status = "updated";
      console.log(`[scrape-posts] Saved ${finalPosts.length} posts`);
    } catch (writeError) {
      console.error("[scrape-posts] Write failed:", writeError.message);
      status = "write_error";
    }
  } else {
    console.warn(
      "[scrape-posts] Scraping failed, preserving existing data:",
      scrapeResult.error
    );
    status = "scrape_failed";

    // Try to preserve existing with updated timestamp signal
    if (existingPosts.length > 0) {
      try {
        writePosts(existingPosts);
      } catch (e) {
        console.error("[scrape-posts] Preserve failed:", e.message);
      }
    }
  }

  const elapsed = Date.now() - startTime;
  const response = {
    success: scrapeResult.success,
    status,
    postsCount: finalPosts.length,
    newPostsFound: scrapeResult.posts.length,
    elapsed: `${elapsed}ms`,
    timestamp: new Date().toISOString(),
    error: scrapeResult.error || null,
  };

  console.log("[scrape-posts] Complete:", JSON.stringify(response));

  return {
    statusCode: scrapeResult.success ? 200 : 207,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(response),
  };
}

// Export as scheduled function (runs via cron)
// The schedule is also set in netlify.toml
module.exports.handler = schedule("0 */6 * * *", handler);
