#!/usr/bin/env bash
set -e

# Default commit message if none provided
MSG="${1:-update: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "🔍 1/3 Verifying frontend build before pushing..."
npm --prefix frontend run build > /dev/null

echo "📦 2/3 Staging changes (excluding database, models, and secrets)..."
git add backend/ frontend/ vercel.json README.md scripts/ *.sh 2>/dev/null || git add .

# Check if there is anything to commit
if git diff --staged --quiet; then
    echo "ℹ️  No changes to commit. Working tree is clean."
else
    echo "💾 3/3 Committing: '$MSG'"
    git commit -m "$MSG"
    
    # Check if remote origin exists before pushing
    if git remote | grep -q "origin"; then
        echo "🚀 Pushing to GitHub (triggers Vercel redeployment)..."
        git push origin main
        echo "✅ Successfully synced and published to Git & Vercel!"
    else
        echo "⚠️  Commit saved locally. To push to GitHub, set your remote first:"
        echo "   git remote add origin https://github.com/<YOUR-USERNAME>/tina.git"
        echo "   git push -u origin main"
    fi
fi
