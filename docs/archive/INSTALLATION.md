# Quick Installation Guide

## 🚀 Quick Start (Recommended)

```bash
cd /opt/LeMedia/apps/web
./setup-new-features.sh
```

## 📋 Manual Installation

### Step 1: Install Dependencies
```bash
cd /opt/LeMedia/apps/web
npm install
```

This will install:
- `web-push@^3.6.7` - Web Push notifications
- `@types/web-push@^3.6.3` - TypeScript definitions

### Step 2: Generate VAPID Keys
```bash
node generate-vapid-keys.js
```

Copy the output and add to your `.env` file.

### Step 3: Update Environment
Edit `/opt/LeMedia/.env`:
```env
# Add these lines (replace with your generated keys)
VAPID_PUBLIC_KEY="BN..."
VAPID_PRIVATE_KEY="..."
VAPID_EMAIL="noreply@yourdomain.com"
```

### Step 4: Rebuild Container
```bash
cd /opt/LeMedia
docker compose up -d --build lemedia-web
```

### Step 5: Verify
```bash
# Check logs
docker compose logs -f lemedia-web

# You should see:
# - Database tables created successfully
# - Service worker registered
# - No errors
```

## ✅ Verification Checklist

Once deployed:

1. **Database Tables**
   ```bash
   docker exec -it lemedia-db psql -U lemedia -d lemedia -c "\dt"
   ```
   Should show: `request_comment`, `approval_rule`, `push_subscription`

2. **Service Worker**
   - Open browser DevTools
   - Go to Application tab → Service Workers
   - Should see `/sw.js` registered and activated

3. **PWA Manifest**
   - DevTools → Application → Manifest
   - Should show LeMedia with shortcuts

4. **Push Notifications**
   - Navigate to `/profile` or settings
   - Click "Enable Notifications" button
   - Grant permission when prompted
   - Should see success message

5. **Offline Mode**
   - Visit a few pages (home, movies, TV)
   - DevTools → Network → set to "Offline"
   - Navigate between cached pages
   - Should work without internet

## 🐛 Troubleshooting

### TypeScript Errors During Build
**Issue:** `Cannot find module 'web-push'`
**Solution:** Run `npm install` in `/opt/LeMedia/apps/web`

### Service Worker Not Registering
**Issue:** Service worker fails to register
**Solution:** 
1. Check `public/sw.js` exists
2. Clear browser cache
3. Hard refresh (Ctrl+Shift+R)

### Push Notifications Not Working
**Issue:** Subscription fails
**Solution:**
1. Verify VAPID keys are set in `.env`
2. Check browser supports push (Chrome, Firefox, Edge - not Safari desktop)
3. Grant notification permission
4. Check browser console for errors

### Database Tables Not Created
**Issue:** Tables missing
**Solution:**
```bash
docker compose down
docker compose up -d
docker compose logs -f lemedia-db
```

### Build Fails in Docker
**Issue:** Dependencies not found
**Solution:**
```bash
cd /opt/LeMedia
docker compose down
docker compose build --no-cache lemedia-web
docker compose up -d
```

## 📊 Testing New Features

### 1. Test Request Comments
```bash
# Create a test request first, then:
curl -X POST \
  -H "Cookie: lemedia_session=..." \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_TOKEN" \
  -d '{"comment":"This is a test comment"}' \
  http://localhost:3010/api/requests/REQUEST_ID/comments
```

### 2. Test Auto-Approval Rules (Admin)
```bash
curl -X POST \
  -H "Cookie: lemedia_session=..." \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_TOKEN" \
  -d '{"name":"Trust Level 1","ruleType":"user_trust","enabled":true,"priority":10,"conditions":{"minApprovedRequests":5}}' \
  http://localhost:3010/api/admin/approval-rules
```

### 3. Test Analytics (Admin)
```bash
curl -H "Cookie: lemedia_session=..." \
  http://localhost:3010/api/admin/analytics
```

### 4. Test Library Status
```bash
curl -H "Cookie: lemedia_session=..." \
  "http://localhost:3010/api/library/status?type=movie&tmdbId=550"
```

### 5. Test PWA Install
1. Open Chrome/Edge on mobile
2. Visit your LeMedia site
3. Wait 5 seconds
4. Tap install banner
5. Verify app opens in standalone mode

### 6. Test Push Notifications
1. Enable notifications in profile/settings
2. Request a movie
3. Have admin approve it
4. Check for push notification on device

## 📚 Additional Resources

- Full documentation: `/opt/LeMedia/NEW_FEATURES.md`
- Implementation details: `/opt/LeMedia/IMPLEMENTATION_SUMMARY.md`
- Environment setup: `/opt/LeMedia/.env.example`

## 🆘 Need Help?

1. Check logs: `docker compose logs -f lemedia-web`
2. Check browser console (F12)
3. Review error messages carefully
4. Check network tab in DevTools
5. Verify all environment variables are set

## ✨ Success Indicators

When everything is working:
- ✅ No TypeScript errors
- ✅ Container builds successfully
- ✅ Database migrations applied
- ✅ Service worker active
- ✅ PWA installable
- ✅ Push notifications can be enabled
- ✅ Offline mode works

---

**Installation Time:** ~5 minutes
**Testing Time:** ~10 minutes
**Total Time:** ~15 minutes
