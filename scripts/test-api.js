#!/usr/bin/env node
/**
 * Test script for the /api/posts endpoint
 * Run with: node scripts/test-api.js [base-url]
 *
 * Default: http://localhost:8888
 * Production: node scripts/test-api.js https://your-site.netlify.app
 */

const https = require("https");
const http = require("http");

const BASE_URL = process.argv[2] || "http://localhost:8888";

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(data),
          });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data, parseError: e.message });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

async function runTests() {
  console.log("=".repeat(60));
  console.log("ACM-W LinkedIn Feed - API Tests");
  console.log(`Testing against: ${BASE_URL}`);
  console.log("=".repeat(60));

  // Test 1: GET /api/posts
  console.log("\n📡 Test 1: GET /api/posts");
  try {
    const result = await fetchJSON(`${BASE_URL}/api/posts`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Content-Type: ${result.headers["content-type"]}`);
    console.log(`   CORS: ${result.headers["access-control-allow-origin"]}`);

    if (result.parseError) {
      console.log(`   ❌ JSON parse error: ${result.parseError}`);
      console.log(`   Raw: ${result.raw?.substring(0, 200)}`);
    } else if (Array.isArray(result.data)) {
      console.log(`   ✅ Returns array with ${result.data.length} posts`);
      if (result.data.length > 0) {
        console.log("\n   📝 First post:");
        const post = result.data[0];
        console.log(`      id: ${post.id}`);
        console.log(`      text: ${post.text?.substring(0, 80)}...`);
        console.log(`      url: ${post.url}`);
        console.log(`      image: ${post.image || "(none)"}`);
        console.log(`      date: ${post.date}`);
        console.log(`      scrapedAt: ${post.scrapedAt}`);

        // Validate schema
        const hasRequiredFields = post.id && post.text && post.url;
        console.log(
          `\n   Schema validation: ${hasRequiredFields ? "✅ PASS" : "❌ FAIL"}`
        );
      }
    } else {
      console.log(`   ⚠️  Unexpected response type: ${typeof result.data}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 2: CORS headers
  console.log("\n📡 Test 2: CORS Headers");
  try {
    const result = await fetchJSON(`${BASE_URL}/api/posts`);
    const cors = result.headers["access-control-allow-origin"];
    console.log(`   Access-Control-Allow-Origin: ${cors}`);
    console.log(`   CORS configured: ${cors === "*" ? "✅" : "⚠️  (not wildcard)"}`);
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Tests complete!");
  console.log("=".repeat(60));
}

runTests().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
