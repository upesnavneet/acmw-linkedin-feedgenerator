const { scrapeWithRetry } = require("./lib/scraper");
const { readPosts, writePosts, mergePosts } = require("./lib/storage");

async function handler(event, context) {
  const startTime = Date.now();
  console.log("[scrape-posts] Invoked at:", new Date().toISOString());

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

  const existingPosts = readPosts();
  console.log("[scrape-posts] Existing posts:", existingPosts.length);

  const scrapeResult = await scrapeWithRetry();

  let finalPosts = existingPosts;
  let status = "cached";

  if (scrapeResult.success && scrapeResult.posts.length > 0) {
    finalPosts = mergePosts(existingPosts, scrapeResult.posts, 10);
    try {
      writePosts(finalPosts);
      status = "updated";
      console.log("[scrape-posts] Saved", finalPosts.length, "posts");
    } catch (writeError) {
      console.error("[scrape-posts] Write failed:", writeError.message);
      status = "write_error";
    }
  } else {
    console.warn("[scrape-posts] Scrape failed:", scrapeResult.error);
    status = "scrape_failed";
    if (existingPosts.length > 0) {
      try { writePosts(existingPosts); } catch (e) { }
    }
  }

  const elapsed = Date.now() - startTime;
  const response = {
    success: scrapeResult.success,
    status,
    postsCount: finalPosts.length,
    newPostsFound: scrapeResult.posts.length,
    elapsed: elapsed + "ms",
    timestamp: new Date().toISOString(),
    error: scrapeResult.error || null,
  };

  console.log("[scrape-posts] Done:", JSON.stringify(response));

  return {
    statusCode: scrapeResult.success ? 200 : 207,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(response),
  };
}

module.exports = { handler };