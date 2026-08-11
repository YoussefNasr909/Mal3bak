import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import {
  createPushSubscription,
  deletePushSubscription,
} from "./notifications.controller.js";
import {
  createPushSubscriptionSchema,
  deletePushSubscriptionSchema,
} from "./notifications.validation.js";

const router = Router();

function validate(schema, property = "body") {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const err = new Error(error.details.map((detail) => detail.message).join(", "));
      err.statusCode = 400;
      return next(err);
    }

    req[property] = value;
    return next();
  };
}

router.use(requireAuth);

router.post("/", validate(createPushSubscriptionSchema), createPushSubscription);
router.delete("/", validate(deletePushSubscriptionSchema), deletePushSubscription);

export default router;
