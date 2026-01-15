#!/usr/bin/env node

/**
 * Generate VAPID keys for Web Push notifications
 * Run: node generate-vapid-keys.js
 */

import webpush from 'web-push';

console.log('\n🔐 Generating VAPID keys for Web Push notifications...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ VAPID keys generated successfully!\n');
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_EMAIL="noreply@yourdomain.com"  # Change this to your email\n`);
console.log('⚠️  Keep the private key secret and never commit it to version control!\n');
