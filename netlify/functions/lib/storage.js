/**
 * JSON Storage Utility
 * Handles reading and writing posts data
 * Uses /tmp for Netlify serverless functions (ephemeral)
 * Uses Netlify Blobs for persistent storage (recommended)
 */

const fs = require("fs");
const path = require("path");

// Primary storage: /tmp (available in Netlify functions)
const TMP_POSTS_FILE = "/tmp/acmw-posts.json";

// Fallback: bundled data directory (read-only after deploy)
const DATA_DIR = path.join(__dirname, "../../../data");
const BUNDLED_POSTS_FILE = path.join(DATA_DIR, "posts.json");

/**
 * Validate posts array structure
 */
function validatePosts(data) {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true; // Empty array is valid

  return data.every(
    (post) =>
      typeof post === "object" &&
      post !== null &&
      typeof post.id === "string" &&
      typeof post.text === "string"
  );
}

/**
 * Read posts from storage
 * Priority: /tmp -> bundled data -> empty array
 */
function readPosts() {
  // Try /tmp first (most recent scrape)
  try {
    if (fs.existsSync(TMP_POSTS_FILE)) {
      const raw = fs.readFileSync(TMP_POSTS_FILE, "utf8");
      const data = JSON.parse(raw);
      if (validatePosts(data) && data.length > 0) {
        console.log(`[storage] Read ${data.length} posts from /tmp`);
        return data;
      }
    }
  } catch (e) {
    console.warn("[storage] /tmp read failed:", e.message);
  }

  // Try bundled data
  try {
    if (fs.existsSync(BUNDLED_POSTS_FILE)) {
      const raw = fs.readFileSync(BUNDLED_POSTS_FILE, "utf8");
      const data = JSON.parse(raw);
      if (validatePosts(data) && data.length > 0) {
        console.log(`[storage] Read ${data.length} posts from bundled data`);
        return data;
      }
    }
  } catch (e) {
    console.warn("[storage] Bundled data read failed:", e.message);
  }

  console.log("[storage] No existing posts found, returning empty array");
  return [];
}

/**
 * Write posts to storage
 */
function writePosts(posts) {
  if (!validatePosts(posts)) {
    throw new Error("Invalid posts data - validation failed");
  }

  const jsonString = JSON.stringify(posts, null, 2);

  // Validate JSON is parseable before writing
  JSON.parse(jsonString); // Will throw if invalid

  // Write to /tmp
  try {
    fs.writeFileSync(TMP_POSTS_FILE, jsonString, "utf8");
    console.log(`[storage] Wrote ${posts.length} posts to /tmp`);
  } catch (e) {
    console.error("[storage] /tmp write failed:", e.message);
    throw e;
  }

  // Also write to data directory if writable (local dev)
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(BUNDLED_POSTS_FILE, jsonString, "utf8");
    console.log(`[storage] Wrote ${posts.length} posts to data/posts.json`);
  } catch (e) {
    console.warn("[storage] data/ write failed (OK in production):", e.message);
  }

  return true;
}

/**
 * Merge new posts with existing, dedup, keep latest MAX_POSTS
 */
function mergePosts(existingPosts, newPosts, maxPosts = 10) {
  const combined = [...newPosts, ...existingPosts];

  // Deduplicate by id
  const seen = new Set();
  const deduped = combined.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });

  // Sort by scrapedAt descending (newest first)
  deduped.sort((a, b) => {
    const dateA = new Date(a.scrapedAt || a.date || 0);
    const dateB = new Date(b.scrapedAt || b.date || 0);
    return dateB - dateA;
  });

  return deduped.slice(0, maxPosts);
}

/**
 * Get storage status
 */
function getStorageStatus() {
  const hasTmp = fs.existsSync(TMP_POSTS_FILE);
  const hasData = fs.existsSync(BUNDLED_POSTS_FILE);
  const posts = readPosts();

  return {
    hasTmpFile: hasTmp,
    hasDataFile: hasData,
    postsCount: posts.length,
    lastUpdated:
      posts.length > 0 ? posts[0].scrapedAt : null,
  };
}

module.exports = { readPosts, writePosts, mergePosts, validatePosts, getStorageStatus };
