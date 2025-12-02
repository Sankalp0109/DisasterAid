/**
 * Phone Number Parser - Extract Country Code and Number
 * Handles various phone formats and auto-detects country codes
 */

// Common country codes by prefix
const COUNTRY_CODES = {
  '1': '+1',       // USA, Canada
  '44': '+44',     // UK
  '91': '+91',     // India
  '86': '+86',     // China
  '81': '+81',     // Japan
  '61': '+61',     // Australia
  '33': '+33',     // France
  '49': '+49',     // Germany
  '55': '+55',     // Brazil
  '39': '+39',     // Italy
  '34': '+34',     // Spain
  '31': '+31',     // Netherlands
  '46': '+46',     // Sweden
  '47': '+47',     // Norway
  '45': '+45',     // Denmark
  '358': '+358',   // Finland
  '32': '+32',     // Belgium
  '43': '+43',     // Austria
  '36': '+36',     // Hungary
  '420': '+420',   // Czech Republic
  '48': '+48',     // Poland
  '7': '+7',       // Russia
};

/**
 * Parse phone number and extract country code
 * @param {string} phone - Phone number (with or without country code)
 * @param {string} defaultCountryCode - Default country code if not detected (default: +91)
 * @returns {Object} { countryCode: string, phoneNumber: string, fullPhone: string }
 */
export function parsePhoneNumber(phone, defaultCountryCode = '+91') {
  if (!phone) {
    return {
      countryCode: defaultCountryCode,
      phoneNumber: '',
      fullPhone: ''
    };
  }

  // Remove all non-digits except leading +
  const cleanPhone = phone.replace(/[^\d+]/g, '');

  // Case 1: Already has + prefix (E.164 format)
  if (cleanPhone.startsWith('+')) {
    const match = cleanPhone.match(/^(\+\d{1,3})(\d+)$/);
    if (match) {
      return {
        countryCode: match[1],
        phoneNumber: match[2],
        fullPhone: cleanPhone
      };
    }
  }

  // Case 2: No + prefix, need to detect country code
  // Try to match against known country codes (longest first to avoid conflicts)
  const sortedCodes = Object.keys(COUNTRY_CODES).sort((a, b) => b.length - a.length);
  
  for (const code of sortedCodes) {
    if (cleanPhone.startsWith(code)) {
      const countryCode = COUNTRY_CODES[code];
      const phoneNumber = cleanPhone.substring(code.length);
      
      // Validate: phone number should have reasonable length (7-15 digits)
      if (phoneNumber.length >= 7 && phoneNumber.length <= 15) {
        return {
          countryCode,
          phoneNumber,
          fullPhone: countryCode + phoneNumber
        };
      }
    }
  }

  // Case 3: Could not detect country code, use default
  return {
    countryCode: defaultCountryCode,
    phoneNumber: cleanPhone,
    fullPhone: defaultCountryCode + cleanPhone
  };
}

/**
 * Validate if a phone number is valid after parsing
 * @param {string} phone - Phone number to validate
 * @returns {boolean} true if valid, false otherwise
 */
export function isValidPhoneNumber(phone) {
  if (!phone) return false;
  
  const parsed = parsePhoneNumber(phone);
  const phoneLength = parsed.phoneNumber.length;
  
  // Valid phone numbers typically have 7-15 digits
  return phoneLength >= 7 && phoneLength <= 15;
}

/**
 * Format phone number to E.164 standard
 * @param {string} phone - Phone number
 * @param {string} defaultCountryCode - Default country code if not detected
 * @returns {string} Phone in E.164 format (e.g., +919876543210)
 */
export function formatPhoneE164(phone, defaultCountryCode = '+91') {
  const parsed = parsePhoneNumber(phone, defaultCountryCode);
  return parsed.fullPhone;
}

/**
 * Extract country code from a phone number
 * @param {string} phone - Phone number
 * @param {string} defaultCountryCode - Default country code if not detected
 * @returns {string} Country code (e.g., +91)
 */
export function extractCountryCode(phone, defaultCountryCode = '+91') {
  const parsed = parsePhoneNumber(phone, defaultCountryCode);
  return parsed.countryCode;
}

/**
 * Extract only the phone number digits without country code
 * @param {string} phone - Phone number
 * @returns {string} Phone number without country code
 */
export function extractPhoneDigits(phone) {
  const parsed = parsePhoneNumber(phone);
  return parsed.phoneNumber;
}

// Export as default for ES6 modules
export default {
  parsePhoneNumber,
  isValidPhoneNumber,
  formatPhoneE164,
  extractCountryCode,
  extractPhoneDigits,
};
