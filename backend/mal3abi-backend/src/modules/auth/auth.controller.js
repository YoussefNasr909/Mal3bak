import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "./auth.validation.js";
import {
  registerAndStartSession,
  login,
  session,
  me,
  logout,
  updateMyProfile,
  requestPasswordReset,
  resetPassword,
  changeUserPassword,
  deleteUserAccount,
  refreshToken,
} from "./auth.service.js";

export async function registerController(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);
    const result = await registerAndStartSession(data, res, false);
    return res.status(201).json(result);
  } catch (e) {
    if (!e.status || e.status >= 500) {
      console.error("[registerController] Unhandled error:", e);
    }
    next(e);
  }
}

export async function loginController(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const result = await login(data, res);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function sessionController(req, res, next) {
  try {
    const result = await session(req.user.id);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function meController(req, res, next) {
  try {
    const result = await me(req.user.id);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function updateProfileController(req, res, next) {
  try {
    const data = updateProfileSchema.parse(req.body);
    const result = await updateMyProfile(req.user.id, data);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function logoutController(req, res, next) {
  try {
    const result = await logout(req, res);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function forgotPasswordController(req, res, next) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await requestPasswordReset(email, req.headers.origin);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function resetPasswordController(req, res, next) {
  try {
    const data = resetPasswordSchema.parse(req.body);
    const result = await resetPassword(data);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function changePasswordController(req, res, next) {
  try {
    const data = changePasswordSchema.parse(req.body);
    const result = await changeUserPassword(req.user.id, data, res);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function deleteAccountController(req, res, next) {
  try {
    await deleteUserAccount(req.user.id, res);
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function refreshTokenController(req, res, next) {
  try {
    const result = await refreshToken(req, res);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}
