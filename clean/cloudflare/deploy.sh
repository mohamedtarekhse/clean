#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  deploy.sh — Deploy to Cloudflare Pages using Wrangler
#
#  Prerequisites:
#    npm install -g wrangler
#    wrangler login
#
#  Usage:
#    chmod +x deploy.sh
#    ./deploy.sh
# ══════════════════════════════════════════════════════════════════════════════

PROJECT="asset-management"
RAILWAY_URL="https://cleanndc.up.railway.app"
API_KEY="a3f8c2e1d4b7e9f0c6a2d8e4f1b3c7a9e2d5f8b1c4a7e0d3f6b9c2a5e8d1f4"

echo "══════════════════════════════════════"
echo "  Cloudflare Pages Deploy"
echo "  Project: $PROJECT"
echo "══════════════════════════════════════"

# ── Step 1: Create project if it doesn't exist ────────────────────────────────
echo ""
echo "→ Creating Pages project (skip if already exists)..."
wrangler pages project create "$PROJECT" --production-branch=main 2>/dev/null || true

# ── Step 2: Set secrets ───────────────────────────────────────────────────────
echo ""
echo "→ Setting RAILWAY_API_URL secret..."
echo "$RAILWAY_URL" | wrangler pages secret put RAILWAY_API_URL \
  --project-name="$PROJECT"

echo ""
echo "→ Setting API_SECRET_KEY secret..."
echo "$API_KEY" | wrangler pages secret put API_SECRET_KEY \
  --project-name="$PROJECT"

# ── Step 3: Deploy ────────────────────────────────────────────────────────────
echo ""
echo "→ Deploying site to Cloudflare Pages..."
wrangler pages deploy . \
  --project-name="$PROJECT" \
  --branch=main \
  --commit-dirty=true

echo ""
echo "✓ Deploy complete!"
echo "  Visit: https://$PROJECT.pages.dev"
echo ""
echo "  If this is the first deploy, wait ~30 seconds then visit the URL above."
