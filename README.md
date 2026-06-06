# ACM-W India LinkedIn Feed — Netlify Deployment

> Automated LinkedIn post scraper that runs every 6 hours on Netlify,
> exposes a JSON API, and provides an embeddable WordPress widget.

---

## Architecture

```
LinkedIn Public Page
       ↓
Netlify Scheduled Function (cron: 0 */6 * * *)
       ↓
Playwright + @sparticuz/chromium scraper
       ↓
JSON Storage (/tmp + data/posts.json)
       ↓
GET /api/posts endpoint
       ↓
WordPress Custom HTML Block widget
```

---

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd acmw-linkedin-feed
npm install
```

### 2. Install Netlify CLI

```bash
npm install -g netlify-cli
```

### 3. Deploy to Netlify

```bash
netlify login
netlify init
netlify deploy --prod
```

That's it. The scheduled function will run automatically every 6 hours.

---

## Project Structure

```
acmw-linkedin-feed/
├── netlify.toml                         # Netlify config + redirects + cron schedule
├── package.json
├── .gitignore
│
├── netlify/
│   └── functions/
│       ├── scrape-posts.js              # Scheduled function (runs every 6h)
│       ├── get-posts.js                 # GET /api/posts endpoint
│       └── lib/
│           ├── scraper.js               # Playwright scraper logic
│           └── storage.js               # JSON read/write utilities
│
├── data/
│   ├── posts.json                       # Stored posts data (bundled + writable locally)
│   └── sample-posts.json               # Fallback sample data
│
├── public/
│   └── index.html                       # API status dashboard
│
├── scripts/
│   ├── scrape-local.js                  # Local scraping test
│   └── test-api.js                      # API endpoint tests
│
└── wordpress-embed/
    └── widget.html                      # Complete WordPress embed code
```

---

## API Reference

### `GET /api/posts`

Returns the latest scraped LinkedIn posts as JSON.

**Response:**
```json
[
  {
    "id": "abc123",
    "text": "Latest ACM-W India announcement...",
    "url": "https://www.linkedin.com/feed/update/...",
    "image": "https://media.licdn.com/...",
    "date": "2026-06-01",
    "scrapedAt": "2026-06-06T12:00:00.000Z"
  }
]
```

**Headers:**
- `Content-Type: application/json`
- `Access-Control-Allow-Origin: *`
- `Cache-Control: public, max-age=1800`

---

### `GET /api/trigger-scrape`

Manually triggers a scrape (protected by optional `SCRAPE_API_KEY` env variable).

```bash
curl https://your-site.netlify.app/api/trigger-scrape \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## WordPress Integration

### Step 1: Deploy to Netlify (see above)

### Step 2: Open `wordpress-embed/widget.html`

### Step 3: Update the API URL at the top of the script:
```javascript
var API_URL = 'https://your-site.netlify.app/api/posts';
```

### Step 4: Paste into WordPress
1. Edit your WordPress page/post
2. Add a **Custom HTML** block
3. Paste the entire contents of `widget.html`
4. Save and Publish

The widget is fully self-contained — no jQuery, no external dependencies, no plugins needed.

---

## Environment Variables (Optional)

Set in Netlify dashboard → Site Settings → Environment Variables:

| Variable | Purpose | Default |
|---|---|---|
| `SCRAPE_API_KEY` | Protects manual trigger endpoint | (none — endpoint open) |

---

## Local Development

### Install Playwright browsers:
```bash
npx playwright install chromium
```

### Start local dev server:
```bash
netlify dev
```

This starts:
- Functions server at `http://localhost:8888`
- API endpoint: `http://localhost:8888/api/posts`
- Dashboard: `http://localhost:8888`

### Run scraper locally:
```bash
node scripts/scrape-local.js
```

### Test API:
```bash
node scripts/test-api.js
# Or test production:
node scripts/test-api.js https://your-site.netlify.app
```

---

## How the Scraper Works

1. **Launches Chromium** headlessly using `@sparticuz/chromium` (optimized for AWS Lambda / Netlify)
2. **Navigates** to `https://www.linkedin.com/company/acm-w-india/posts/?feedView=all`
3. **Waits** for content to load (4 seconds + 3 scroll events)
4. **Extracts** post elements using multiple CSS selector strategies
5. **Sanitizes** all text content (removes null bytes, trims, caps length)
6. **Deduplicates** posts by content hash
7. **Merges** with previously stored posts
8. **Writes** up to 10 latest posts to storage

### Retry Logic
- Up to 3 attempts on failure
- Exponential backoff: 4s → 8s between retries
- On total failure: preserves last known good data
- All errors are logged to Netlify function logs

---

## Troubleshooting

### Posts not showing?
1. Check Netlify function logs (Netlify dashboard → Functions → scrape-posts → Logs)
2. Verify the scheduled function ran: look for "Function invoked" log lines
3. Manually trigger: visit `/api/trigger-scrape`

### LinkedIn blocking the scraper?
LinkedIn may update its page structure. If scraping consistently fails:
1. Check logs for specific error messages
2. The scraper has multiple selector fallback strategies
3. The API always returns the last successful dataset (never empty on failure)

### Chromium not found?
On Netlify, `@sparticuz/chromium` is used automatically. Locally, install via:
```bash
npx playwright install chromium
```

---

## Data Persistence Notes

Netlify Functions run in ephemeral containers. Data flow:

1. **On scrape**: Written to `/tmp/acmw-posts.json` (in-memory for function lifetime)
2. **On read**: Tries `/tmp` first, then `data/posts.json` (bundled at deploy)
3. **Limitation**: `/tmp` data does not persist between cold starts

**For production persistence**, consider:
- [Netlify Blobs](https://docs.netlify.com/blobs/overview/) (free tier available)
- [PlanetScale](https://planetscale.com) (free tier MySQL)
- [Upstash Redis](https://upstash.com) (free tier Redis)

To upgrade to Netlify Blobs storage, install `@netlify/blobs` and replace the storage module's `readPosts`/`writePosts` functions.

---

## Deployment Checklist

- [ ] `npm install` runs without errors
- [ ] `netlify.toml` committed
- [ ] All function files committed
- [ ] `data/posts.json` committed (even as empty `[]`)
- [ ] Deployed to Netlify (`netlify deploy --prod`)
- [ ] Visited `/api/posts` and got JSON response
- [ ] WordPress embed URL updated to production Netlify URL
- [ ] Embedded in WordPress Custom HTML block and tested

---

## License

MIT — Free to use and modify.

---

*Built for ACM-W India | Automated with Playwright + Netlify Scheduled Functions*
