// Multi-language SoS keywords
const SOS_KEYWORDS = {
  en: ["help", "emergency", "urgent", "trapped", "stuck", "drowning", "fire", "injured", "dying", "bleeding", "save", "danger", "critical", "rescue"],
  hi: ["बचाओ", "मदद", "आपातकाल", "खतरा", "फंसा", "घायल", "मर रहा", "बचा लो", "आग"],
  ta: ["உதவி", "அவசரம", "காப்பாற்று", "ஆபத்து", "சிக்கி", "காயம்"],
  te: ["సహాయం", "అత్యవసరం", "రక్షించు", "ప్రమాదం", "చిక్కుకున్న"],
  bn: ["সাহায্য", "জরুরি", "বিপদ", "আটকে", "আহত"],
  mr: ["मदत", "आणीबाणी", "धोका", "अडकलो", "जखमी"],
};

const TRAPPED_KEYWORDS = ["trapped", "stuck", "can't move", "immobile", "फंसा", "अटक", "சிக்கி", "చిక్కుకున్న"];
const MEDICAL_KEYWORDS = ["injured", "bleeding", "unconscious", "heart attack", "stroke", "घायल", "खून", "காயம்", "గాయపడ్డ"];

/**
 * Detect SoS in message
 */
export function detectSoS(message, language = "en") {
  const indicators = {
    keywords: [],
    trapped: false,
    medicalEmergency: false,
    desperation: false,
  };

  if (!message) return { detected: false, indicators };

  const lowerMessage = message.toLowerCase();

  // Check SoS keywords
  const keywords = SOS_KEYWORDS[language] || SOS_KEYWORDS.en;
  keywords.forEach((keyword) => {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      indicators.keywords.push(keyword);
    }
  });

  // Check trapped indicators
  TRAPPED_KEYWORDS.forEach((keyword) => {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      indicators.trapped = true;
      indicators.keywords.push(keyword);
    }
  });

  // Check medical emergency
  MEDICAL_KEYWORDS.forEach((keyword) => {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      indicators.medicalEmergency = true;
      indicators.keywords.push(keyword);
    }
  });

  // Check desperation indicators
  const exclamationCount = (message.match(/!/g) || []).length;
  const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;

  if (exclamationCount >= 3 || capsRatio > 0.5) {
    indicators.desperation = true;
  }

  const detected = indicators.keywords.length > 0 || indicators.trapped || indicators.medicalEmergency;

  return { detected, indicators };
}

/**
 * Calculate priority score
 * ✅ If SOS detected → use SOS-based priority
 * ✅ If NO SOS detected → use user's selfDeclaredUrgency
 */
export function calculatePriority(request) {
  // Check if SOS was detected
  const hasSoSKeywords = request.sosIndicators?.keywords?.length > 0;
  const hasTrapped = request.sosIndicators?.trapped;
  const hasMedicalEmergency = request.sosIndicators?.medicalEmergency;
  const isSoSDetected = hasSoSKeywords || hasTrapped || hasMedicalEmergency;

  // If NO SOS detected → use user's manual urgency selection
  if (!isSoSDetected) {
    return request.selfDeclaredUrgency || "medium";
  }

  // If SOS detected → calculate priority based on SOS indicators
  let score = 0;

  // Needs (10 points max)
  if (request.needs?.rescue?.required) {
    score += request.needs.rescue.urgency === "critical" ? 5 : 3;
  }
  if (request.needs?.medical?.required) {
    score += request.needs.medical.urgency === "critical" ? 4 : 2;
  }
  if (request.needs?.water?.required) score += 2;
  if (request.needs?.food?.required) score += 1;

  // Beneficiaries (3 points max)
  const total = request.beneficiaries?.total || 1;
  if (total > 20) score += 3;
  else if (total > 10) score += 2;
  else if (total > 5) score += 1;

  // Special needs (4 points max)
  if (request.specialNeeds?.medicalConditions?.length > 0) score += 2;
  if (request.specialNeeds?.pregnant) score += 2;
  if (request.beneficiaries?.infants > 0) score += 2;

  // Device indicators (3 points max)
  if (request.deviceInfo?.batteryLevel < 10) score += 2;
  if (request.deviceInfo?.signalStrength === "poor") score += 1;

  // SoS indicators (10 points max) - HIGH PRIORITY
  if (hasSoSKeywords) score += 7; // SOS keywords = 7 points
  if (hasTrapped) score += 4;
  if (hasMedicalEmergency) score += 3;
  if (request.sosIndicators?.repeatedCalls > 2) score += 2;

  // Determine priority level when SOS is detected
  if (score >= 15) return "sos";
  if (score >= 10) return "critical";
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/**
 * Check and update SoS status for request
 */
export async function checkSoSStatus(request) {
  let sosDetected = false;
  const indicators = {
    keywords: [],
    trapped: false,
    medicalEmergency: false,
    repeatedCalls: 0,
    lowBattery: false,
    poorSignal: false,
  };

  // ✅ Check description field for SoS keywords (THIS IS THE MAIN FIELD)
  if (request.description) {
    const detection = detectSoS(request.description, request.language);
    if (detection.detected) {
      sosDetected = true;
      indicators.keywords = [...new Set([...indicators.keywords, ...detection.indicators.keywords])];
      if (detection.indicators.trapped) indicators.trapped = true;
      if (detection.indicators.medicalEmergency) indicators.medicalEmergency = true;
    }
  }

  // Check messages for SoS keywords
  if (request.messages && request.messages.length > 0) {
    const recentMessages = request.messages.slice(-5); // Last 5 messages
    indicators.repeatedCalls = recentMessages.length;

    recentMessages.forEach((msg) => {
      const detection = detectSoS(msg.message, request.language);
      if (detection.detected) {
        sosDetected = true;
        indicators.keywords = [...new Set([...indicators.keywords, ...detection.indicators.keywords])];
        if (detection.indicators.trapped) indicators.trapped = true;
        if (detection.indicators.medicalEmergency) indicators.medicalEmergency = true;
      }
    });
  }

  // Check device info
  if (request.deviceInfo) {
    if (request.deviceInfo.batteryLevel < 10) {
      indicators.lowBattery = true;
      sosDetected = true;
    }
    if (request.deviceInfo.signalStrength === "poor") {
      indicators.poorSignal = true;
    }
  }

  // Check needs
  if (request.needs?.rescue?.required && request.needs.rescue.urgency === "critical") {
    sosDetected = true;
  }
  if (request.needs?.medical?.required && request.needs.medical.urgency === "critical") {
    sosDetected = true;
    indicators.medicalEmergency = true;
  }

  request.sosDetected = sosDetected;
  request.sosIndicators = indicators;
  request.priority = calculatePriority(request);

  return request;
}
