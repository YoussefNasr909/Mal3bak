import {
  listNotificationsService,
  markNotificationReadService,
  markAllNotificationsReadService,
  deleteNotificationService,
  clearReadNotificationsService,
  getNotificationPreferencesService,
  updateNotificationPreferencesService,
  createPushSubscriptionService,
  deletePushSubscriptionService,
} from "./notifications.service.js";

export async function listNotifications(req, res, next) {
  try {
    const result = await listNotificationsService(req.validatedQuery ?? req.query, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function markNotificationRead(req, res, next) {
  try {
    const result = await markNotificationReadService(req.params.notificationId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsRead(req, res, next) {
  try {
    const result = await markAllNotificationsReadService(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function deleteNotification(req, res, next) {
  try {
    const result = await deleteNotificationService(req.params.notificationId, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function clearReadNotifications(req, res, next) {
  try {
    const result = await clearReadNotificationsService(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getNotificationPreferences(req, res, next) {
  try {
    const result = await getNotificationPreferencesService(req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateNotificationPreferences(req, res, next) {
  try {
    const result = await updateNotificationPreferencesService(req.body, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createPushSubscription(req, res, next) {
  try {
    const result = await createPushSubscriptionService(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function deletePushSubscription(req, res, next) {
  try {
    const result = await deletePushSubscriptionService(req.body, req.user);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
