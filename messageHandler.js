const {
  classifyIntent,
  postMessage,
  generateLocationResponse,
  generateTimeResponse,
  generateLateResponse,
  generateUnknownResponse,
  generateMultipleEventsQuestion
} = require('./groupme');

const {
  getUpcomingEvents,
  getEventsByDay,
  pendingChoiceQueries
} = require('./database');

// Handle incoming GroupMe message
async function handleGroupMeMessage(message) {
  // Ignore bot's own messages to prevent loops
  if (message.sender_type === 'bot') {
    return;
  }

  const text = message.text || '';
  const userId = message.user_id;
  const groupId = message.group_id;
  const senderName = message.name || 'Someone';

  console.log(`Message from ${senderName}: ${text}`);

  // Classify intent
  let intent = classifyIntent(text);

  // Check for pending choice
  const pendingChoice = pendingChoiceQueries.getPendingChoice.get(userId, groupId);

  // If user responded with Sat or Sun and has a pending choice
  if ((intent === 'CHOICE_SAT' || intent === 'CHOICE_SUN') && pendingChoice) {
    await handleChoiceResponse(intent, pendingChoice, userId, groupId, text, senderName);
    return;
  }

  // Get upcoming events
  const upcomingEvents = getUpcomingEvents();

  // No events scheduled
  if (upcomingEvents.length === 0) {
    await postMessage('No upcoming games are scheduled yet. Coach needs to add them.');
    return;
  }

  // Single event - answer directly
  if (upcomingEvents.length === 1) {
    await handleSingleEventIntent(intent, upcomingEvents[0], text, senderName);
    return;
  }

  // Multiple events - check if message specifies day
  if (text.toLowerCase().includes('sat') || text.toLowerCase().includes('saturday')) {
    const satEvents = getEventsByDay(upcomingEvents, 'saturday');
    if (satEvents.length > 0) {
      await handleSingleEventIntent(intent, satEvents[0], text, senderName);
      return;
    }
  }

  if (text.toLowerCase().includes('sun') || text.toLowerCase().includes('sunday')) {
    const sunEvents = getEventsByDay(upcomingEvents, 'sunday');
    if (sunEvents.length > 0) {
      await handleSingleEventIntent(intent, sunEvents[0], text, senderName);
      return;
    }
  }

  // Multiple events without day specification - ask which one
  await handleMultipleEvents(upcomingEvents, intent, userId, groupId);
}

// Handle single event intent
async function handleSingleEventIntent(intent, event, text, senderName) {
  let response;

  switch (intent) {
    case 'LOCATION':
      response = generateLocationResponse(event);
      break;

    case 'TIME':
      response = generateTimeResponse(event);
      break;

    case 'LATE':
      response = generateLateResponse(text, senderName);
      break;

    case 'UNKNOWN':
    default:
      response = generateUnknownResponse(event);
      break;
  }

  await postMessage(response);
}

// Handle multiple events - ask for clarification
async function handleMultipleEvents(events, intent, userId, groupId) {
  // Store pending choice (expires in 10 minutes)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const candidateEventIds = JSON.stringify(events.map(e => e.id));

  pendingChoiceQueries.setPendingChoice.run(
    userId,
    groupId,
    intent,
    candidateEventIds,
    expiresAt
  );

  // Ask which game
  const response = generateMultipleEventsQuestion(events);
  await postMessage(response);
}

// Handle choice response (Sat or Sun)
async function handleChoiceResponse(choiceIntent, pendingChoice, userId, groupId, text, senderName) {
  try {
    // Get candidate events
    const candidateIds = JSON.parse(pendingChoice.candidate_event_ids);
    const { eventQueries } = require('./database');
    const candidates = candidateIds.map(id => eventQueries.getEventById.get(id)).filter(Boolean);

    // Filter by chosen day
    const dayName = choiceIntent === 'CHOICE_SAT' ? 'saturday' : 'sunday';
    const matchingEvents = getEventsByDay(candidates, dayName);

    if (matchingEvents.length === 0) {
      await postMessage(`Sorry, no ${dayName} game found in the schedule.`);
      pendingChoiceQueries.clearPendingChoice.run(userId, groupId);
      return;
    }

    // Use earliest matching event (handles doubleheader case)
    const selectedEvent = matchingEvents[0];

    // Clear pending choice
    pendingChoiceQueries.clearPendingChoice.run(userId, groupId);

    // Answer based on original intent
    const originalIntent = pendingChoice.pending_intent;
    await handleSingleEventIntent(originalIntent, selectedEvent, text, senderName);

  } catch (err) {
    console.error('Error handling choice response:', err);
    await postMessage('Sorry, something went wrong. Please try again.');
    pendingChoiceQueries.clearPendingChoice.run(userId, groupId);
  }
}

module.exports = {
  handleGroupMeMessage
};
