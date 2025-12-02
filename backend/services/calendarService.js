import ical from 'ical-generator';

/**
 * Generate iCal calendar for NGO assignments
 * Can be imported into Google Calendar, Outlook, Apple Calendar, etc.
 */
export function generateNGOSchedule(assignments) {
  const cal = ical({
    name: 'NGO Relief Assignments',
    description: 'Disaster Aid - NGO Assignment Schedule',
    timezone: 'UTC',
    scale: 'gregorian'
  });

  assignments.forEach((assignment) => {
    const request = assignment.request || {};
    const status = assignment.status === 'fulfilled' ? 'COMPLETED' : 'IN-PROCESS';

    // Determine start and end times
    const startTime = new Date(assignment.createdAt);
    const endTime = assignment.expectedCompletionTime
      ? new Date(assignment.expectedCompletionTime)
      : new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // Default 8 hours

    const eventDescription = `
Request #${request.ticketNumber}

Priority: ${request.priority?.toUpperCase() || 'MEDIUM'}
Location: ${request.location?.address || 'Address not provided'}

Categories:
${Object.entries(request.needs || {})
  .filter(([_, need]) => need.required)
  .map(([category, need]) => `- ${category}: ${need.quantity || 'As needed'} ${need.unit || 'units'}`)
  .join('\n')}

${request.description ? `Description: ${request.description}` : ''}

Status: ${status}
    `.trim();

    cal.createEvent({
      id: assignment._id?.toString() || `assignment-${Date.now()}`,
      start: startTime,
      end: endTime,
      summary: `${request.title} (#${request.ticketNumber})`,
      description: eventDescription,
      location: request.location?.address || 'TBD',
      status,
      organizer: {
        name: 'Disaster Aid System',
        email: process.env.EMAIL_USER || 'noreply@disasteraid.com'
      },
      attendee: assignment.assignedTo?.email
        ? [
            {
              name: assignment.assignedTo.name,
              email: assignment.assignedTo.email,
              role: 'REQ-PARTICIPANT',
              partstat: status === 'COMPLETED' ? 'COMPLETED' : 'ACCEPTED'
            }
          ]
        : [],
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/ngo/dashboard?assignment=${assignment._id}`,
      method: 'REQUEST',
      class: request.priority === 'critical' || request.priority === 'sos' ? 'PUBLIC' : 'PUBLIC'
    });
  });

  return cal.toString();
}

/**
 * Generate iCal calendar for authority operations
 */
export function generateAuthoritySchedule(assignments) {
  const cal = ical({
    name: 'Disaster Response Operations',
    description: 'Disaster Aid - Authority Operations Calendar',
    timezone: 'UTC',
    scale: 'gregorian'
  });

  assignments.forEach((assignment) => {
    const request = assignment.request || {};
    const ngo = assignment.assignedTo || {};

    const startTime = new Date(assignment.createdAt);
    const endTime = assignment.expectedCompletionTime
      ? new Date(assignment.expectedCompletionTime)
      : new Date(startTime.getTime() + 8 * 60 * 60 * 1000);

    const eventDescription = `
Request #${request.ticketNumber}
Assigned to: ${ngo.name || 'Unknown Organization'}

Victim Location: ${request.location?.address || 'Address not provided'}
Victim Contact: ${request.createdBy?.phone || 'N/A'}

Needs:
${Object.entries(request.needs || {})
  .filter(([_, need]) => need.required)
  .map(([category, need]) => `- ${category}: ${need.quantity || 'As needed'} ${need.unit || 'units'}`)
  .join('\n')}

NGO Details:
Name: ${ngo.name}
Contact: ${ngo.email}
Phone: ${ngo.phone}

Status: ${assignment.status}
    `.trim();

    const priorityColor = request.priority === 'sos' || request.priority === 'critical' ? 'RED' : 'BLUE';

    cal.createEvent({
      id: assignment._id?.toString() || `auth-assignment-${Date.now()}`,
      start: startTime,
      end: endTime,
      summary: `[${request.priority?.toUpperCase()}] ${request.title} → ${ngo.name}`,
      description: eventDescription,
      location: request.location?.address || 'TBD',
      status: assignment.status === 'fulfilled' ? 'COMPLETED' : 'CONFIRMED',
      organizer: {
        name: 'Disaster Response Authority',
        email: process.env.EMAIL_USER || 'noreply@disasteraid.com'
      },
      url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/authority/dashboard?assignment=${assignment._id}`,
      method: 'REQUEST'
    });
  });

  return cal.toString();
}

/**
 * Generate shelter occupancy calendar
 */
export function generateShelterSchedule(shelters) {
  const cal = ical({
    name: 'Shelter Occupancy Schedule',
    description: 'Disaster Aid - Shelter Capacity Tracking',
    timezone: 'UTC'
  });

  if (!shelters || !Array.isArray(shelters)) return cal.toString();

  shelters.forEach((shelter) => {
    const occupancyPercent = shelter.occupancy || 0;
    const statusColor = occupancyPercent > 90 ? 'CRITICAL' : occupancyPercent > 75 ? 'WARNING' : 'NORMAL';

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    cal.createEvent({
      id: `shelter-${shelter._id || Date.now()}`,
      start: startTime,
      end: endTime,
      summary: `${shelter.name} - ${occupancyPercent}% Occupancy [${statusColor}]`,
      description: `
Shelter: ${shelter.name}
Location: ${shelter.location || 'N/A'}
Capacity: ${shelter.totalCapacity || 'Unknown'} people
Current Occupancy: ${shelter.currentOccupancy || 0} people
Occupancy %: ${occupancyPercent}%
Status: ${statusColor}

${occupancyPercent > 90 ? 'WARNING: Shelter near capacity!' : 'Occupancy normal'}
      `.trim(),
      location: shelter.location || 'TBD',
      status: 'CONFIRMED',
      repeating: {
        freq: 'DAILY',
        count: 7 // Show for 7 days
      }
    });
  });

  return cal.toString();
}

/**
 * Generate response team schedule
 */
export function generateTeamSchedule(team, assignments) {
  const cal = ical({
    name: `Team Schedule - ${team.name}`,
    description: `Disaster Aid - Response Team Schedule for ${team.name}`,
    timezone: 'UTC'
  });

  // Filter assignments for this team
  const teamAssignments = assignments.filter(
    (a) => a.assignedTo?._id?.toString() === team._id?.toString()
  );

  teamAssignments.forEach((assignment) => {
    const request = assignment.request || {};
    const startTime = new Date(assignment.createdAt);
    const endTime = assignment.expectedCompletionTime
      ? new Date(assignment.expectedCompletionTime)
      : new Date(startTime.getTime() + 6 * 60 * 60 * 1000);

    cal.createEvent({
      id: `team-${assignment._id}`,
      start: startTime,
      end: endTime,
      summary: `${request.title} - ${request.location?.address || 'Location TBD'}`,
      description: `
Request: ${request.ticketNumber}
Priority: ${request.priority}

Needs:
${Object.entries(request.needs || {})
  .filter(([_, need]) => need.required)
  .map(([cat, need]) => `- ${cat}: ${need.quantity || 'needed'} ${need.unit || ''}`)
  .join('\n')}

Contact: ${request.createdBy?.phone || 'N/A'}
      `.trim(),
      location: request.location?.address,
      status: assignment.status === 'fulfilled' ? 'COMPLETED' : 'CONFIRMED'
    });
  });

  return cal.toString();
}

export default {
  generateNGOSchedule,
  generateAuthoritySchedule,
  generateShelterSchedule,
  generateTeamSchedule
};
