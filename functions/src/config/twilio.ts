import * as functions from 'firebase-functions';
import twilio from 'twilio';

// Get Twilio credentials from Firebase config
// Set these using: firebase functions:config:set twilio.account_sid="xxx" twilio.auth_token="xxx" twilio.whatsapp_number="whatsapp:+xxx"
const config = functions.config();

export const getTwilioClient = (accountSid?: string, authToken?: string) => {
  const sid = accountSid || config.twilio?.account_sid;
  const token = authToken || config.twilio?.auth_token;

  if (!sid || !token) {
    throw new Error('Twilio credentials not configured. Set using firebase functions:config:set');
  }

  return twilio(sid, token);
};

export const getDefaultWhatsAppNumber = () => {
  return config.twilio?.whatsapp_number || '';
};

// Validate Twilio webhook signature
export const validateTwilioSignature = (
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean => {
  return twilio.validateRequest(authToken, signature, url, params);
};
