# ⚾ Ask Coach - GroupMe Bot for Baseball Team Logistics

Ask Coach is a smart GroupMe bot that helps baseball teams manage game logistics. Team members can ask about game locations, times, and report when they're running late. The bot automatically handles tournament weekends with multiple games.

## Features

### For Team Members (via GroupMe)
- **Location queries**: Ask "where" to get venue, address, field, map link, and parking info
- **Time queries**: Ask "when" or "time" to get game start time, arrival time, and opponent
- **Late notifications**: Reply "late 10" or "eta 6:15" to notify the team
- **Tournament support**: Automatically asks "Sat or Sun?" when there are multiple games
- **Smart responses**: Bot responds to every message with relevant information

### For Coaches (Admin Web App)
- **Event management**: Add, edit, and delete game events
- **Full game details**: Date/time, venue, address, field, opponent, parking notes, arrival time
- **Active/inactive toggle**: Hide past or cancelled games without deleting them
- **Simple authentication**: Password-protected admin panel

## Quick Start

### Prerequisites
- Node.js 18+ installed
- A GroupMe account and bot
- DigitalOcean account (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/shawnlandau/Coachassist.git
   cd Coachassist
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add:
   ```
   GROUPME_BOT_ID=your_bot_id_here
   ADMIN_PASSWORD=your_secure_password
   PORT=3000
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   
   The server will run on `http://localhost:3000`

## GroupMe Bot Setup

### Step 1: Create a GroupMe Bot

1. Go to [GroupMe Dev Portal](https://dev.groupme.com/)
2. Sign in with your GroupMe account
3. Click **"Bots"** in the top menu
4. Click **"Create Bot"**
5. Configure your bot:
   - **Bot Name**: Ask Coach
   - **Group**: Select your team's GroupMe group
   - **Avatar URL**: (optional) Add a baseball-themed image
   - **Callback URL**: Leave blank for now (we'll add this after deployment)
6. Click **"Submit"**
7. Copy the **Bot ID** - you'll need this for your environment variables

### Step 2: Understanding the Callback URL

The callback URL is where GroupMe will send every message from your group. When you deploy your app:

1. Your deployed app will have a URL like: `https://your-app.ondigitalocean.app`
2. Your callback URL will be: `https://your-app.ondigitalocean.app/groupme/callback`
3. GroupMe will POST every group message to this endpoint
4. Your bot processes the message and replies using the GroupMe API

**Important**: You must update the callback URL in the GroupMe Dev Portal after deployment!

### Step 3: How Bot Replies Work

The bot doesn't receive messages automatically. Here's the flow:

1. **User sends message** → GroupMe group
2. **GroupMe sends webhook** → POST to your `/groupme/callback` endpoint
3. **Your bot processes message** → Classifies intent, queries database
4. **Bot posts reply** → POST to `https://api.groupme.com/v3/bots/post` with bot_id and text
5. **Reply appears in group** → All members see the bot's response

**API Reference**: [GroupMe Bot Tutorial](https://dev.groupme.com/tutorials/bots)

## Deployment to DigitalOcean App Platform

### Step 1: Prepare Your Repository

1. Make sure all code is committed to your GitHub repository
2. Your `package.json` must have a `start` script (already included)
3. Your app must listen on `process.env.PORT` (already configured)

### Step 2: Create a DigitalOcean App

1. Log in to [DigitalOcean](https://cloud.digitalocean.com/)
2. Click **"Create"** → **"Apps"**
3. Choose **"GitHub"** as the source
4. Select your repository: `shawnlandau/Coachassist`
5. Choose the branch to deploy (usually `main`)
6. DigitalOcean will auto-detect it as a Node.js app
7. Configure:
   - **Name**: ask-coach-bot (or your preferred name)
   - **Region**: Choose closest to your location
   - **Instance Type**: Basic ($5/month is sufficient)
   - **Build Command**: Auto-detected (`npm install`)
   - **Run Command**: Auto-detected (`npm start`)

### Step 3: Add Environment Variables

In the DigitalOcean App settings:

1. Go to **"Settings"** → **"App-Level Environment Variables"**
2. Add these variables:
   - `GROUPME_BOT_ID`: Your bot ID from GroupMe Dev Portal
   - `ADMIN_PASSWORD`: Choose a strong password for admin access
3. Click **"Save"**

### Step 4: Deploy

1. Click **"Deploy"** and wait for the build to complete (2-5 minutes)
2. Once deployed, you'll get a live URL like: `https://ask-coach-bot-xxxxx.ondigitalocean.app`
3. Test health check: Visit `https://your-app-url/health`

### Step 5: Configure GroupMe Callback URL

1. Go back to [GroupMe Dev Portal](https://dev.groupme.com/bots)
2. Click **"Edit"** on your Ask Coach bot
3. Set **Callback URL** to: `https://your-app-url/groupme/callback`
4. Click **"Submit"**

### Step 6: Test Your Bot

1. Open your GroupMe group
2. Send a message: "where is the game?"
3. The bot should respond with location info (or prompt to add events)

## Using the Admin Panel

### Access the Admin Panel

1. Visit: `https://your-app-url/admin/events`
2. Log in with the `ADMIN_PASSWORD` you set
3. You'll see the events management dashboard

### Add a New Event

1. Fill in the form at the top:
   - **Game Date & Time**: Select date and time of the game
   - **Venue Name**: e.g., "Riverside Park"
   - **Address**: Full address for map links
   - **Field Number**: (optional) e.g., "Field 3"
   - **Opponent**: (optional) e.g., "Blue Jays"
   - **Arrive Minutes Before**: Default is 45 minutes
   - **Parking Notes**: (optional) e.g., "Park in north lot"
   - **Active Event**: Checked by default
2. Click **"Add Event"**

### Edit or Delete Events

- Click **"Edit"** to modify event details
- Click **"Delete"** to mark event as inactive (soft delete)
- Inactive events won't appear in bot responses

## How the Bot Works

### Intent Classification

The bot analyzes every message and classifies it:

- **LOCATION**: Keywords like "where", "address", "field", "directions", "map"
- **TIME**: Keywords like "when", "time", "start", "arrive"
- **LATE**: Keywords like "late", "running late", "eta", "traffic"
- **CHOICE**: Exact match for "sat"/"saturday" or "sun"/"sunday"
- **UNKNOWN**: Everything else

### Event Selection Logic

1. **Window**: Events are considered "upcoming" if they're within 12 hours ago to 7 days ahead
2. **No events**: Replies "No upcoming games scheduled yet"
3. **Single event**: Answers directly based on intent
4. **Multiple events**:
   - If message contains "sat" or "sun", picks that day's game
   - Otherwise asks: "Which game—Sat or Sun?"
   - Stores "pending choice" for 10 minutes
   - When user replies "Sat" or "Sun", answers their original question

### Response Templates

**LOCATION Response:**
```
📍 Location:
Riverside Park
123 Main St, City, ST 12345
Field: 3

🗺️ Map: [Google Maps link]

🅿️ Parking: Park in the north lot
```

**TIME Response:**
```
⏰ Game Time:
Sat, May 15, 10:00 AM

🏃 Arrive by: 9:15 AM

⚾ Opponent: Blue Jays
```

**LATE Response:**
- User: "late 10" → Bot: "⏱️ Late update: John reports ~10 min late."
- User: "eta 6:15" → Bot: "⏱️ Late update: John reports ETA ~6:15."

**UNKNOWN Response:**
```
🗓️ Next game: Sat, May 15, 10:00 AM vs Blue Jays
📍 Riverside Park

Try: where / time / late 10
```

## Database Schema

### Events Table
```sql
- id (INTEGER PRIMARY KEY)
- start_datetime_local (TEXT) - ISO datetime string
- venue_name (TEXT)
- address (TEXT)
- field_number (TEXT, nullable)
- parking_notes (TEXT, nullable)
- opponent (TEXT, nullable)
- arrival_minutes_before (INTEGER, default 45)
- is_active (INTEGER, default 1)
- created_at (TEXT)
- updated_at (TEXT)
```

### Pending Choices Table
```sql
- id (INTEGER PRIMARY KEY)
- user_id (TEXT) - GroupMe user ID
- group_id (TEXT) - GroupMe group ID
- pending_intent (TEXT) - Original intent (LOCATION/TIME/LATE/UNKNOWN)
- candidate_event_ids (TEXT) - JSON array of event IDs
- expires_at (TEXT) - ISO datetime, 10 minutes from creation
- created_at (TEXT)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROUPME_BOT_ID` | **Yes** | Your GroupMe bot ID from dev portal |
| `ADMIN_PASSWORD` | **Yes** | Password for admin panel access |
| `PORT` | No | Server port (auto-set by DigitalOcean) |
| `BASE_URL` | No | Your app's public URL (for future features) |

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Health check - returns `{"status":"ok"}` | No |
| POST | `/groupme/callback` | GroupMe webhook receiver | No |
| GET | `/admin/login` | Admin login page | No |
| POST | `/admin/login` | Admin login handler | No |
| GET | `/admin/events` | Events list and add form | Yes |
| POST | `/admin/events` | Create new event | Yes |
| GET | `/admin/events/:id/edit` | Edit event page | Yes |
| POST | `/admin/events/:id` | Update event | Yes |
| POST | `/admin/events/:id/delete` | Delete (deactivate) event | Yes |
| GET | `/admin/logout` | Logout | Yes |

## Troubleshooting

### Bot doesn't respond to messages

1. **Check callback URL**: Make sure it's set in GroupMe Dev Portal to `https://your-app-url/groupme/callback`
2. **Check bot ID**: Verify `GROUPME_BOT_ID` environment variable is correct
3. **Check logs**: In DigitalOcean, go to Runtime Logs to see errors
4. **Test health**: Visit `https://your-app-url/health` - should return `{"status":"ok"}`

### "No upcoming games scheduled"

- Log in to admin panel and add events
- Make sure events are marked as "Active"
- Check that event dates are within the 12-hour-ago to 7-days-ahead window

### Can't log in to admin panel

- Check `ADMIN_PASSWORD` environment variable in DigitalOcean settings
- Try redeploying the app after setting environment variables

### Bot responds to its own messages (infinite loop)

- The code checks for `message.sender_type === 'bot'` to prevent this
- Make sure you're testing with user messages, not bot messages

### DigitalOcean build fails

- Check Node.js version (requires 18+)
- Verify `package.json` has all dependencies listed
- Check build logs in DigitalOcean for specific errors

## Known Limitations (MVP)

1. **Doubleheader handling**: If there are multiple games on the same day, bot picks the earliest one
2. **No user preferences**: All users get the same information
3. **No edit history**: Event changes don't maintain history
4. **Simple auth**: Single password for all admins (no user accounts)
5. **No notifications**: Bot doesn't proactively remind about games
6. **SQLite database**: Single-file database (fine for MVP, consider PostgreSQL for production)

## Future Enhancements

- [ ] Roster management and attendance tracking
- [ ] Automated game reminders
- [ ] Weather forecasts for game day
- [ ] Multi-team support
- [ ] User roles (coach vs parent)
- [ ] Practice schedule support
- [ ] Integration with league websites
- [ ] Mobile app for admins

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite3 (better-sqlite3)
- **Session Management**: express-session
- **Hosting**: DigitalOcean App Platform
- **External API**: GroupMe Bot API

## License

MIT License - feel free to modify and use for your team!

## Support

For issues or questions:
1. Check this README first
2. Review DigitalOcean deployment logs
3. Check GroupMe Dev Portal bot configuration
4. Open an issue on GitHub

---

Built with ⚾ for baseball teams everywhere!
