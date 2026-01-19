# Ask Coach - Quick Deployment Guide

## Pre-Deployment Checklist

- [ ] Repository pushed to GitHub
- [ ] GroupMe bot created at https://dev.groupme.com/bots
- [ ] Bot ID saved
- [ ] DigitalOcean account ready

## Deployment Steps

### 1. Deploy to DigitalOcean

1. Log in to DigitalOcean
2. Click "Create" → "Apps"
3. Choose "GitHub" and select `shawnlandau/Coachassist`
4. Choose `main` branch
5. Name: `ask-coach-bot`
6. Region: Choose nearest
7. Plan: Basic ($5/month)
8. Add environment variables:
   - `GROUPME_BOT_ID`: (your bot ID)
   - `ADMIN_PASSWORD`: (choose strong password)
9. Click "Deploy"
10. Wait 2-5 minutes for deployment
11. Save your app URL: `https://ask-coach-bot-xxxxx.ondigitalocean.app`

### 2. Configure GroupMe Callback

1. Go to https://dev.groupme.com/bots
2. Click "Edit" on your bot
3. Set Callback URL to: `https://your-app-url/groupme/callback`
4. Click "Submit"

### 3. Test

1. Visit: `https://your-app-url/health` (should show `{"status":"ok"}`)
2. Visit: `https://your-app-url/admin/events` 
3. Log in with your admin password
4. Add a test event
5. Send "where" in your GroupMe group
6. Bot should respond!

## First Time Setup

After deployment:

1. Log in to admin panel
2. Add your first game event
3. Test in GroupMe:
   - "where is the game?"
   - "what time?"
   - "late 10"

## Environment Variables Reference

| Variable | Example | Description |
|----------|---------|-------------|
| GROUPME_BOT_ID | 1234567890abcdef | From GroupMe dev portal |
| ADMIN_PASSWORD | MySecurePass123! | Choose strong password |
| PORT | 3000 | Auto-set by DigitalOcean |

## Support

- Health check: `/health`
- Admin login: `/admin/login`
- GroupMe webhook: `/groupme/callback`
- See full README.md for detailed docs
