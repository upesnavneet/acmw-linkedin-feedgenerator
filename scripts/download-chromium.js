/**
 * Pre-downloads @sparticuz/chromium binary at build time
 * so it's available in the function bundle at runtime.
 */
const chromium = require("@sparticuz/chromium");
const path = require("path");
const fs = require("fs");

async function main() {
    console.log("[build] Pre-fetching @sparticuz/chromium binary...");
    try {
        // Calling executablePath() triggers the download/extraction
        process.env.CHROMIUM_PATH = undefined;
        const execPath = await chromium.executablePath(
            path.join(__dirname, "../node_modules/@sparticuz/chromium/bin")
        );
        console.log("[build] Chromium binary ready at:", execPath);

        // Verify it exists
        if (fs.existsSync(execPath)) {
            console.log("[build] ✅ Binary verified");
        } else {
            console.warn("[build] ⚠️  Binary path returned but file not found:", execPath);
        }
    } catch (err) {
        console.error("[build] Chromium prefetch error (non-fatal):", err.message);
    }
}

main();