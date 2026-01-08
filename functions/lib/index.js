"use strict";
/**
 * Firebase Cloud Functions for Academy Pro
 * WhatsApp Messaging via Twilio
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerReceiptGeneration = exports.generateScheduledReceipts = exports.markConversationRead = exports.sendWhatsAppMessage = exports.whatsappStatusCallback = exports.whatsappWebhook = void 0;
// Webhook handlers
var whatsappWebhook_1 = require("./webhooks/whatsappWebhook");
Object.defineProperty(exports, "whatsappWebhook", { enumerable: true, get: function () { return whatsappWebhook_1.whatsappWebhook; } });
var statusCallback_1 = require("./webhooks/statusCallback");
Object.defineProperty(exports, "whatsappStatusCallback", { enumerable: true, get: function () { return statusCallback_1.whatsappStatusCallback; } });
// API functions
var sendMessage_1 = require("./api/sendMessage");
Object.defineProperty(exports, "sendWhatsAppMessage", { enumerable: true, get: function () { return sendMessage_1.sendWhatsAppMessage; } });
Object.defineProperty(exports, "markConversationRead", { enumerable: true, get: function () { return sendMessage_1.markConversationRead; } });
// Scheduled functions
var generateScheduledReceipts_1 = require("./schedulers/generateScheduledReceipts");
Object.defineProperty(exports, "generateScheduledReceipts", { enumerable: true, get: function () { return generateScheduledReceipts_1.generateScheduledReceipts; } });
Object.defineProperty(exports, "triggerReceiptGeneration", { enumerable: true, get: function () { return generateScheduledReceipts_1.triggerReceiptGeneration; } });
//# sourceMappingURL=index.js.map