/**
 * Netlify Function: get-posts
 * Exposes the /api/posts JSON endpoint
 * Returns stored LinkedIn posts
 */

const { readPosts, getStorageStatus } = require("./lib/storage");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS },
      body: "",
    };
  }

  // Only allow GET
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const posts = readPosts();
    const status = getStorageStatus();

    // Build response
    const responseBody = JSON.stringify(posts, null, 2);

    // Validate JSON before sending
    JSON.parse(responseBody);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=1800", // Cache 30 min in CDN
        "X-Posts-Count": String(posts.length),
        "X-Last-Updated": status.lastUpdated || "unknown",
        "X-Data-Source": "acmw-linkedin-scraper",
      },
      body: responseBody,
    };
  } catch (error) {
    console.error("[get-posts] Error reading posts:", error.message);

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to retrieve posts",
        message: error.message,
        posts: [],
      }),
    };
  }
};
