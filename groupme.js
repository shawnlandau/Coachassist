const https = require('https');

const GROUPME_BOT_ID = process.env.GROUPME_BOT_ID;

// Intent classification keywords
const INTENT_KEYWORDS = {
  LOCATION: ['where', 'address', 'field', 'directions', 'map', 'location'],
  TIME: ['time', 'when', 'start', 'warmup', 'arrive'],
  LATE: ['late', 'running late', 'traffic', 'eta', 'behind']
};

// Classify message intent
function classifyIntent(text) {
  const lowerText = text.toLowerCase().trim();

  // Check for day choice first (sat or sun)
  if (lowerText === 'sat' || lowerText === 'saturday') return 'CHOICE_SAT';
  if (lowerText === 'sun' || lowerText === 'sunday') return 'CHOICE_SUN';

  // Check for specific intents
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      return intent;
    }
  }

  return 'UNKNOWN';
}

// Post message to GroupMe
function postMessage(text) {
  return new Promise((resolve, reject) => {
    if (!GROUPME_BOT_ID) {
      console.error('GROUPME_BOT_ID not configured');
      return reject(new Error('Bot ID not configured'));
    }

    const payload = JSON.stringify({
      bot_id: GROUPME_BOT_ID,
      text: text.substring(0, 1000) // Respect GroupMe 1000 char limit
    });

    const options = {
      hostname: 'api.groupme.com',
      path: '/v3/bots/post',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 202) {
          resolve({ success: true, data });
        } else {
          reject(new Error(`GroupMe API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Format event datetime
function formatEventDateTime(datetimeStr) {
  const date = new Date(datetimeStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Get arrival time
function getArrivalTime(datetimeStr, minutesBefore) {
  const date = new Date(datetimeStr);
  date.setMinutes(date.getMinutes() - minutesBefore);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Generate Google Maps URL
function getMapUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// Generate response templates
function generateLocationResponse(event) {
  let response = `📍 Location:\n${event.venue_name}\n${event.address}`;
  
  if (event.field_number) {
    response += `\nField: ${event.field_number}`;
  }
  
  response += `\n\n🗺️ Map: ${getMapUrl(event.address)}`;
  
  if (event.parking_notes) {
    response += `\n\n🅿️ Parking: ${event.parking_notes}`;
  }
  
  return response;
}

function generateTimeResponse(event) {
  let response = `⏰ Game Time:\n${formatEventDateTime(event.start_datetime_local)}`;
  
  if (event.arrival_minutes_before) {
    response += `\n\n🏃 Arrive by: ${getArrivalTime(event.start_datetime_local, event.arrival_minutes_before)}`;
  }
  
  if (event.opponent) {
    response += `\n\n⚾ Opponent: ${event.opponent}`;
  }
  
  return response;
}

function generateLateResponse(messageText, senderName) {
  const lowerText = messageText.toLowerCase();
  
  // Check for "late <number>" pattern
  const lateMatch = lowerText.match(/late\s+(\d+)/);
  if (lateMatch) {
    return `⏱️ Late update: ${senderName} reports ~${lateMatch[1]} min late.`;
  }
  
  // Check for "eta <time>" pattern
  const etaMatch = lowerText.match(/eta\s+(\d{1,2}):?(\d{2})?/);
  if (etaMatch) {
    const hours = etaMatch[1];
    const mins = etaMatch[2] || '00';
    return `⏱️ Late update: ${senderName} reports ETA ~${hours}:${mins}.`;
  }
  
  // Generic eta mention
  if (lowerText.includes('eta')) {
    return `⏱️ Late update: ${senderName} is running late.`;
  }
  
  // No specific time provided
  return `Got it—reply 'late 10' or 'eta 6:10' and I'll post an update here.`;
}

function generateUnknownResponse(nextEvent) {
  let response = '';
  
  if (nextEvent) {
    response += `🗓️ Next game: ${formatEventDateTime(nextEvent.start_datetime_local)}`;
    if (nextEvent.opponent) {
      response += ` vs ${nextEvent.opponent}`;
    }
    response += `\n📍 ${nextEvent.venue_name}`;
    response += `\n\n`;
  }
  
  response += `Try: where / time / late 10`;
  
  return response;
}

function generateMultipleEventsQuestion(events) {
  const satEvents = events.filter(e => {
    const day = new Date(e.start_datetime_local).toLocaleDateString('en-US', { weekday: 'long' });
    return day === 'Saturday';
  });
  
  const sunEvents = events.filter(e => {
    const day = new Date(e.start_datetime_local).toLocaleDateString('en-US', { weekday: 'long' });
    return day === 'Sunday';
  });
  
  let response = '🗓️ We have games this weekend:\n';
  
  if (satEvents.length > 0) {
    response += `\n📅 Saturday: ${formatEventDateTime(satEvents[0].start_datetime_local)}`;
  }
  
  if (sunEvents.length > 0) {
    response += `\n📅 Sunday: ${formatEventDateTime(sunEvents[0].start_datetime_local)}`;
  }
  
  response += '\n\nWhich game—Sat or Sun? Reply Sat or Sun.';
  
  return response;
}

module.exports = {
  classifyIntent,
  postMessage,
  formatEventDateTime,
  getArrivalTime,
  generateLocationResponse,
  generateTimeResponse,
  generateLateResponse,
  generateUnknownResponse,
  generateMultipleEventsQuestion
};
