#!/usr/bin/env node

/**
 * iOS Splash Screen Generator
 *
 * This script generates iOS splash screens for all device sizes.
 * It creates simple gradient splash screens with the app name centered.
 *
 * Requirements:
 *   npm install sharp
 *
 * Usage:
 *   node scripts/generate-ios-splash.js
 *
 * For custom branding, you can modify the colors and text below.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'LeMedia';
const BACKGROUND_COLOR = '#0b1224'; // Dark theme background
const TEXT_COLOR = '#ffffff';

// iOS device splash screen sizes
const splashSizes = [
  // iPhone sizes
  { name: 'apple-splash-1290-2796', width: 1290, height: 2796 }, // iPhone 15 Pro Max, 14 Pro Max
  { name: 'apple-splash-1179-2556', width: 1179, height: 2556 }, // iPhone 15 Pro, 14 Pro
  { name: 'apple-splash-1284-2778', width: 1284, height: 2778 }, // iPhone 15 Plus, 14 Plus, 13 Pro Max
  { name: 'apple-splash-1170-2532', width: 1170, height: 2532 }, // iPhone 15, 14, 13, 13 Pro
  { name: 'apple-splash-1125-2436', width: 1125, height: 2436 }, // iPhone 13 mini, 12 mini, X, XS
  { name: 'apple-splash-1242-2688', width: 1242, height: 2688 }, // iPhone 11 Pro Max, XS Max
  { name: 'apple-splash-828-1792', width: 828, height: 1792 },   // iPhone 11, XR
  { name: 'apple-splash-750-1334', width: 750, height: 1334 },   // iPhone SE, 8, 7
  // iPad sizes
  { name: 'apple-splash-2048-2732', width: 2048, height: 2732 }, // iPad Pro 12.9"
  { name: 'apple-splash-1668-2388', width: 1668, height: 2388 }, // iPad Pro 11"
  { name: 'apple-splash-1640-2360', width: 1640, height: 2360 }, // iPad Air, iPad 10th gen
  { name: 'apple-splash-1488-2266', width: 1488, height: 2266 }, // iPad mini
];

async function generateSplashScreens() {
  const outputDir = path.join(__dirname, '..', 'public', 'splash');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('\\n📦 Sharp is not installed. Installing it now...');
    console.log('   Run: npm install sharp\\n');

    // Create placeholder SVG-based splash screens instead
    console.log('Creating SVG-based splash screens as a fallback...\\n');

    for (const size of splashSizes) {
      const svg = `<svg width="${size.width}" height="${size.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#0b1224;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e1b4b;stop-opacity:1" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:#6366f1;stop-opacity:0" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="${size.width / 2}" cy="${size.height / 2}" rx="${size.width * 0.4}" ry="${size.height * 0.3}" fill="url(#glow)"/>
  <text x="50%" y="50%" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="${Math.round(size.width * 0.08)}" font-weight="700" fill="${TEXT_COLOR}" text-anchor="middle" dominant-baseline="middle">${APP_NAME}</text>
</svg>`;

      const filePath = path.join(outputDir, `${size.name}.svg`);
      fs.writeFileSync(filePath, svg);
      console.log(`✅ Created ${size.name}.svg`);
    }

    console.log('\\n⚠️  Note: SVG splash screens were created.');
    console.log('   For PNG splash screens, install sharp and run again:');
    console.log('   npm install sharp && node scripts/generate-ios-splash.js\\n');
    return;
  }

  console.log('🎨 Generating iOS splash screens...\\n');

  for (const size of splashSizes) {
    // Create SVG with gradient background and centered text
    const svg = `<svg width="${size.width}" height="${size.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#0b1224;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e1b4b;stop-opacity:1" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:#6366f1;stop-opacity:0" />
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="${size.width / 2}" cy="${size.height / 2}" rx="${size.width * 0.5}" ry="${size.height * 0.4}" fill="url(#glow)"/>
  <text x="50%" y="50%" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="${Math.round(size.width * 0.07)}" font-weight="700" fill="${TEXT_COLOR}" text-anchor="middle" dominant-baseline="middle">${APP_NAME}</text>
</svg>`;

    const outputPath = path.join(outputDir, `${size.name}.png`);

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath);

    console.log(`✅ Generated ${size.name}.png (${size.width}x${size.height})`);
  }

  console.log('\\n🎉 All splash screens generated successfully!');
  console.log(`   Location: ${outputDir}`);
}

generateSplashScreens().catch(console.error);
