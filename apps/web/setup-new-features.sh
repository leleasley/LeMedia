#!/bin/bash

# LeMedia New Features Setup Script
# Run this after pulling the new code

set -e

echo "🚀 LeMedia - New Features Setup"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from /opt/LeMedia/apps/web"
    exit 1
fi

echo "📦 Step 1: Installing dependencies..."
npm install

echo ""
echo "🔐 Step 2: Generating VAPID keys for push notifications..."
echo ""
node generate-vapid-keys.js
echo ""

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy the VAPID keys above and add them to your .env file"
echo "2. Update VAPID_EMAIL in .env to your actual email"
echo "3. Rebuild the Docker container:"
echo "   cd /opt/LeMedia"
echo "   docker compose up -d --build lemedia-web"
echo ""
echo "4. View logs to verify:"
echo "   docker compose logs -f lemedia-web"
echo ""
echo "📖 Full documentation: /opt/LeMedia/NEW_FEATURES.md"
echo ""
