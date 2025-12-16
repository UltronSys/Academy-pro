/**
 * Normalize phone number to E.164 format
 * @param phone - Phone number in any format
 * @returns Normalized phone number in E.164 format
 */
export const normalizePhoneNumber = (phone: string): string => {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    // Assume it's a US number if no country code
    if (normalized.length === 10) {
      normalized = '+1' + normalized;
    } else if (normalized.length === 11 && normalized.startsWith('1')) {
      normalized = '+' + normalized;
    } else {
      normalized = '+' + normalized;
    }
  }

  return normalized;
};

/**
 * Convert phone number to WhatsApp format
 * @param phone - Phone number in E.164 format
 * @returns WhatsApp formatted number (whatsapp:+xxx)
 */
export const toWhatsAppFormat = (phone: string): string => {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.startsWith('whatsapp:')) {
    return normalized;
  }
  return `whatsapp:${normalized}`;
};

/**
 * Extract phone number from WhatsApp format
 * @param whatsappNumber - WhatsApp formatted number
 * @returns E.164 phone number
 */
export const fromWhatsAppFormat = (whatsappNumber: string): string => {
  return whatsappNumber.replace('whatsapp:', '');
};

/**
 * Validate phone number format
 * @param phone - Phone number to validate
 * @returns True if valid E.164 format
 */
export const isValidE164 = (phone: string): boolean => {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
};
