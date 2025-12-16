"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTwilioSignature = exports.getDefaultWhatsAppNumber = exports.getTwilioClient = void 0;
const functions = __importStar(require("firebase-functions"));
const twilio_1 = __importDefault(require("twilio"));
// Get Twilio credentials from Firebase config
// Set these using: firebase functions:config:set twilio.account_sid="xxx" twilio.auth_token="xxx" twilio.whatsapp_number="whatsapp:+xxx"
const config = functions.config();
const getTwilioClient = (accountSid, authToken) => {
    var _a, _b;
    const sid = accountSid || ((_a = config.twilio) === null || _a === void 0 ? void 0 : _a.account_sid);
    const token = authToken || ((_b = config.twilio) === null || _b === void 0 ? void 0 : _b.auth_token);
    if (!sid || !token) {
        throw new Error('Twilio credentials not configured. Set using firebase functions:config:set');
    }
    return (0, twilio_1.default)(sid, token);
};
exports.getTwilioClient = getTwilioClient;
const getDefaultWhatsAppNumber = () => {
    var _a;
    return ((_a = config.twilio) === null || _a === void 0 ? void 0 : _a.whatsapp_number) || '';
};
exports.getDefaultWhatsAppNumber = getDefaultWhatsAppNumber;
// Validate Twilio webhook signature
const validateTwilioSignature = (authToken, signature, url, params) => {
    return twilio_1.default.validateRequest(authToken, signature, url, params);
};
exports.validateTwilioSignature = validateTwilioSignature;
//# sourceMappingURL=twilio.js.map