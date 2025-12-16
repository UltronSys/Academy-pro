"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidE164 = exports.fromWhatsAppFormat = exports.toWhatsAppFormat = exports.normalizePhoneNumber = void 0;
/**
 * Normalize phone number to E.164 format
 * @param phone - Phone number in any format
 * @returns Normalized phone number in E.164 format
 */
const normalizePhoneNumber = (phone) => {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');
    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
        // Assume it's a US number if no country code
        if (normalized.length === 10) {
            normalized = '+1' + normalized;
        }
        else if (normalized.length === 11 && normalized.startsWith('1')) {
            normalized = '+' + normalized;
        }
        else {
            normalized = '+' + normalized;
        }
    }
    return normalized;
};
exports.normalizePhoneNumber = normalizePhoneNumber;
/**
 * Convert phone number to WhatsApp format
 * @param phone - Phone number in E.164 format
 * @returns WhatsApp formatted number (whatsapp:+xxx)
 */
const toWhatsAppFormat = (phone) => {
    const normalized = (0, exports.normalizePhoneNumber)(phone);
    if (normalized.startsWith('whatsapp:')) {
        return normalized;
    }
    return `whatsapp:${normalized}`;
};
exports.toWhatsAppFormat = toWhatsAppFormat;
/**
 * Extract phone number from WhatsApp format
 * @param whatsappNumber - WhatsApp formatted number
 * @returns E.164 phone number
 */
const fromWhatsAppFormat = (whatsappNumber) => {
    return whatsappNumber.replace('whatsapp:', '');
};
exports.fromWhatsAppFormat = fromWhatsAppFormat;
/**
 * Validate phone number format
 * @param phone - Phone number to validate
 * @returns True if valid E.164 format
 */
const isValidE164 = (phone) => {
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
};
exports.isValidE164 = isValidE164;
//# sourceMappingURL=phoneUtils.js.map