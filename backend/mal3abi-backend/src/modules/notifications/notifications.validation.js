import Joi from "joi";

export const listNotificationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  unreadOnly: Joi.boolean().default(false),
  category: Joi.string().valid("booking", "tournament", "account", "system", "admin"),
  priority: Joi.string().valid("low", "normal", "high", "urgent", "important"),
});

export const notificationIdParamSchema = Joi.object({
  notificationId: Joi.string().uuid().required(),
});

export const updateNotificationPreferencesSchema = Joi.object({
  webPushEnabled: Joi.boolean(),
  criticalOnlyOnPush: Joi.boolean(),
}).min(1);

export const createPushSubscriptionSchema = Joi.object({
  endpoint: Joi.string().uri().required(),
  p256dhKey: Joi.string().trim().required(),
  authKey: Joi.string().trim().required(),
  userAgent: Joi.string().allow(null, "").optional(),
});

export const deletePushSubscriptionSchema = Joi.object({
  endpoint: Joi.string().uri().required(),
});
