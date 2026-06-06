#!/usr/bin/env node
/**
 * Local development scraper script
 * Run with: node scripts/scrape-local.js
 *
 * Requires: npm install playwright
 * Then: npx playwright install chromium
 */

const path = require("path");
const fs = require("fs");

// Override module resolution to use project-local paths
process.chdir(path.join(__dirname, ".."));

async function main() {
  console.log("=".repeat(60));
  console.log("ACM-W India LinkedIn Scraper - Local Test");
  console.log("=".repeat(60));

  // Check if playwright is installed
  try {
    require("playwright-core");
  } catch (e) {
    console.error("❌ playwright-core not installed. Run: npm install");
    process.exit(1);
  }

  const { scrapeWithRetry } = require("./netlify/functions/lib/scraper");
  const { readPosts, writePosts, mergePosts } = require("./netlify/functions/lib/storage");

  console.log("\n📥 Loading existing posts...");
  const existingPosts = readPosts();
  console.log(`   Found ${existingPosts.length} existing posts`);

  console.log("\n🕷️  Starting scraper...");
  const result = await scrapeWithRetry();

  console.log("\n📊 Scrape Result:");
  console.log(`   Success: ${result.success}`);
  console.log(`   Posts found: ${result.posts.length}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }

  if (result.success && result.posts.length > 0) {
    const merged = mergePosts(existingPosts, result.posts, 10);
    writePosts(merged);

    console.log("\n✅ Posts saved successfully!");
    console.log(`   Total posts: ${merged.length}`);
    console.log("\n📝 Sample post:");
    console.log(JSON.stringify(merged[0], null, 2));

    console.log("\n📁 Data saved to: data/posts.json");
  } else {
    console.log("\n⚠️  No new posts scraped. Existing data preserved.");

    if (result.error) {
      console.log("\n💡 Common issues:");
      console.log("   - LinkedIn may have changed its page structure");
      console.log("   - Network restrictions in your environment");
      console.log("   - Try running with a VPN if geo-blocked");
    }
  }

  // Also output current data file path
  const dataFile = path.join(__dirname, "../data/posts.json");
  if (fs.existsSync(dataFile)) {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    console.log(`\n📁 Current data file: ${dataFile}`);
    console.log(`   Contains ${data.length} posts`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Done!");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
