require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

// Import modules
const { initDatabase, eventQueries } = require('./database');
const { handleGroupMeMessage } = require('./messageHandler');

// Initialize database
initDatabase();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.ADMIN_PASSWORD || 'change-this-secret-key',
  resave: true,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: 'auto', // Auto-detect based on connection
    sameSite: 'lax' // Better cross-site cookie handling
  },
  rolling: true,
  name: 'teamhelper.sid' // Custom session name to avoid conflicts
}));

// Template rendering helper
function renderTemplate(templateName, data = {}) {
  const templatePath = path.join(__dirname, 'views', templateName);
  let template = fs.readFileSync(templatePath, 'utf-8');
  
  // Simple EJS-style template rendering
  const rendered = template.replace(/<%=\s*(.+?)\s*%>/g, (match, code) => {
    try {
      return eval(`(${code})`);
    } catch (e) {
      return '';
    }
  }).replace(/<%\s*if\s*\((.+?)\)\s*{\s*%>/g, (match, condition) => {
    try {
      return eval(condition) ? '' : '<!--';
    } catch (e) {
      return '<!--';
    }
  }).replace(/<%\s*}\s*%>/g, '-->').replace(/<%\s*else\s*{\s*%>/g, '--><!--')
    .replace(/<%\s*events\.forEach\(function\(event\)\s*{\s*%>/g, () => {
      let result = '';
      if (data.events) {
        data.events.forEach(event => {
          result += renderEventCard(event);
        });
      }
      return result + '<!--';
    });

  // Create a proper rendering context
  const context = { ...data };
  
  // Use Function constructor for safer evaluation
  try {
    const renderFn = new Function(...Object.keys(context), `
      let output = \`${template}\`;
      return output;
    `);
    return renderFn(...Object.values(context));
  } catch (e) {
    console.error('Template rendering error:', e);
    return template;
  }
}

// Auth middleware
function requireAuth(req, res, next) {
  console.log('Auth check:', {
    authenticated: req.session.authenticated,
    sessionID: req.sessionID,
    path: req.path,
    method: req.method
  });
  
  if (req.session.authenticated) {
    next();
  } else {
    console.log('Authentication failed, redirecting to login');
    res.redirect('/admin/login');
  }
}

// ============== PUBLIC ROUTES ==============

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to check password configuration
app.get('/debug/password-check', (req, res) => {
  const hasPassword = !!process.env.ADMIN_PASSWORD;
  const passwordLength = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.length : 0;
  const firstChar = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.charCodeAt(0) : null;
  const lastChar = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.charCodeAt(passwordLength - 1) : null;
  
  res.json({ 
    configured: hasPassword,
    length: passwordLength,
    firstCharCode: firstChar,
    lastCharCode: lastChar,
    hasLeadingSpace: firstChar === 32,
    hasTrailingSpace: lastChar === 32,
    note: 'Password value not shown for security. Char code 32 = space'
  });
});

// Debug endpoint to test database and create sample event
app.get('/debug/test-event', requireAuth, (req, res) => {
  try {
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1); // Tomorrow
    const dateStr = testDate.toISOString().slice(0, 16);
    
    eventQueries.createEvent.run(
      dateStr,
      'Test Venue',
      '123 Test Street, Test City, ST 12345',
      'Field 1',
      'Test parking notes',
      'Test Opponent',
      45,
      1
    );
    
    res.json({ success: true, message: 'Test event created! Check your events list.' });
  } catch (error) {
    res.json({ success: false, error: error.message, stack: error.stack });
  }
});

// Debug endpoint to check what events the bot sees
app.get('/debug/check-events', (req, res) => {
  try {
    const { getUpcomingEvents } = require('./database');
    const allEvents = eventQueries.getActiveEvents.all();
    const upcomingEvents = getUpcomingEvents();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    res.json({
      currentTime: now.toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      allActiveEvents: allEvents.map(e => ({
        id: e.id,
        venue: e.venue_name,
        datetime: e.start_datetime_local,
        is_active: e.is_active
      })),
      upcomingEventsCount: upcomingEvents.length,
      upcomingEvents: upcomingEvents.map(e => ({
        id: e.id,
        venue: e.venue_name,
        datetime: e.start_datetime_local
      }))
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

// GroupMe webhook callback
app.post('/groupme/callback', async (req, res) => {
  try {
    const message = req.body;
    
    // Acknowledge receipt immediately
    res.status(200).send('OK');
    
    // Handle message asynchronously
    await handleGroupMeMessage(message);
  } catch (error) {
    console.error('Error handling GroupMe message:', error);
    // Still send 200 to GroupMe to prevent retries
    res.status(200).send('OK');
  }
});

// ============== ADMIN ROUTES ==============

// Login page
app.get('/admin/login', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'views', 'login.html'), 'utf-8');
  const rendered = html.replace('<%= error %>', req.session.loginError || '')
                       .replace('<% if (error) { %>', req.session.loginError ? '' : '<!--')
                       .replace('<% } %>', req.session.loginError ? '' : '-->');
  delete req.session.loginError;
  res.send(rendered);
});

// Login handler
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  console.log('Login attempt received');
  console.log('Password provided length:', password ? password.length : 0);
  console.log('Admin password configured:', !!adminPassword);
  console.log('Admin password length:', adminPassword ? adminPassword.length : 0);

  if (!adminPassword) {
    req.session.loginError = 'Admin password not configured';
    return res.redirect('/admin/login');
  }

  if (password === adminPassword) {
    console.log('Login successful');
    req.session.authenticated = true;
    res.redirect('/admin/events');
  } else {
    console.log('Login failed - password mismatch');
    req.session.loginError = 'Invalid password';
    res.redirect('/admin/login');
  }
});

// Logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Events list
app.get('/admin/events', requireAuth, (req, res) => {
  try {
    const events = eventQueries.getActiveEvents.all();
    const html = fs.readFileSync(path.join(__dirname, 'views', 'events.html'), 'utf-8');
    
    // Build events HTML
    let eventsHtml = '';
    if (events.length === 0) {
      eventsHtml = `
        <div class="empty-state">
          <h3>No events yet</h3>
          <p>Add your first event using the form above.</p>
        </div>
      `;
    } else {
      events.forEach(event => {
        const dateStr = new Date(event.start_datetime_local).toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        eventsHtml += `
          <div class="event-card ${event.is_active ? '' : 'inactive'}">
            <div class="event-header">
              <div>
                <div class="event-title">
                  ${event.venue_name}
                  ${event.field_number ? `- ${event.field_number}` : ''}
                  <span class="badge ${event.is_active ? 'badge-active' : 'badge-inactive'}">
                    ${event.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div class="event-date">${dateStr}</div>
                <div class="event-details">
                  <p><strong>Address:</strong> ${event.address}</p>
                  ${event.opponent ? `<p><strong>Opponent:</strong> ${event.opponent}</p>` : ''}
                  ${event.parking_notes ? `<p><strong>Parking:</strong> ${event.parking_notes}</p>` : ''}
                  <p><strong>Arrive:</strong> ${event.arrival_minutes_before} minutes before</p>
                </div>
              </div>
              <div class="event-actions">
                <a href="/admin/events/${event.id}/edit" class="btn-edit">Edit</a>
                <form method="POST" action="/admin/events/${event.id}/delete" style="display: inline;">
                  <button type="submit" class="btn-delete" onclick="return confirm('Delete this event?')">Delete</button>
                </form>
              </div>
            </div>
          </div>
        `;
      });
    }
    
    const rendered = html.replace(/<%[\s\S]*?%>/g, '').replace('<div class="events-list">', `<div class="events-list">${eventsHtml}`);
    res.send(rendered);
  } catch (error) {
    console.error('Error loading events:', error);
    res.status(500).send('Error loading events');
  }
});

// Create event
app.post('/admin/events', requireAuth, (req, res) => {
  try {
    const {
      start_datetime_local,
      venue_name,
      address,
      field_number,
      parking_notes,
      opponent,
      arrival_minutes_before,
      is_active
    } = req.body;

    console.log('Creating event with data:', {
      start_datetime_local,
      venue_name,
      address,
      field_number,
      arrival_minutes_before,
      is_active
    });

    // Validate required fields
    if (!start_datetime_local || !venue_name || !address) {
      console.error('Missing required fields');
      return res.status(400).send('Missing required fields: date/time, venue name, and address are required');
    }

    eventQueries.createEvent.run(
      start_datetime_local,
      venue_name,
      address,
      field_number || null,
      parking_notes || null,
      opponent || null,
      parseInt(arrival_minutes_before) || 45,
      is_active ? 1 : 0
    );

    console.log('Event created successfully');
    res.redirect('/admin/events');
  } catch (error) {
    console.error('Error creating event:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send(`Error creating event: ${error.message}`);
  }
});

// Edit event page
app.get('/admin/events/:id/edit', requireAuth, (req, res) => {
  try {
    const event = eventQueries.getEventById.get(req.params.id);
    if (!event) {
      return res.status(404).send('Event not found');
    }

    const html = fs.readFileSync(path.join(__dirname, 'views', 'edit.html'), 'utf-8');
    
    const rendered = html
      .replace(/<%=\s*event\.id\s*%>/g, event.id)
      .replace(/<%=\s*event\.start_datetime_local\s*%>/g, event.start_datetime_local)
      .replace(/<%=\s*event\.venue_name\s*%>/g, event.venue_name)
      .replace(/<%=\s*event\.address\s*%>/g, event.address)
      .replace(/<%=\s*event\.field_number\s*\|\|\s*''\s*%>/g, event.field_number || '')
      .replace(/<%=\s*event\.opponent\s*\|\|\s*''\s*%>/g, event.opponent || '')
      .replace(/<%=\s*event\.parking_notes\s*\|\|\s*''\s*%>/g, event.parking_notes || '')
      .replace(/<%=\s*event\.arrival_minutes_before\s*%>/g, event.arrival_minutes_before)
      .replace(/<%=\s*event\.is_active\s*\?\s*'checked'\s*:\s*''\s*%>/g, event.is_active ? 'checked' : '');
    
    res.send(rendered);
  } catch (error) {
    console.error('Error loading event:', error);
    res.status(500).send('Error loading event');
  }
});

// Update event
app.post('/admin/events/:id', requireAuth, (req, res) => {
  try {
    const {
      start_datetime_local,
      venue_name,
      address,
      field_number,
      parking_notes,
      opponent,
      arrival_minutes_before,
      is_active
    } = req.body;

    eventQueries.updateEvent.run(
      start_datetime_local,
      venue_name,
      address,
      field_number || null,
      parking_notes || null,
      opponent || null,
      parseInt(arrival_minutes_before) || 45,
      is_active ? 1 : 0,
      req.params.id
    );

    res.redirect('/admin/events');
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).send('Error updating event');
  }
});

// Delete event
app.post('/admin/events/:id/delete', requireAuth, (req, res) => {
  try {
    eventQueries.deleteEvent.run(req.params.id);
    res.redirect('/admin/events');
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).send('Error deleting event');
  }
});

// Redirect root to admin
app.get('/', (req, res) => {
  res.redirect('/admin/events');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ask Coach bot server running on port ${PORT}`);
  console.log(`Admin interface: http://localhost:${PORT}/admin/events`);
  console.log(`GroupMe callback: http://localhost:${PORT}/groupme/callback`);
});
