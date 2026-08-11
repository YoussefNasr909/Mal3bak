import {
  createCourtService,
  getCourtByIdService,
  listCourtsService,
  updateCourtService,
  deleteCourtService,
  getCourtAvailabilityService,
  listPublicCourtsService,
  listTopBookedPublicCourtsService,
  reorderCourtsService,
  getPublicCourtByIdService,
  getPublicCourtAvailabilityService,
  listCourtClosuresService,
  createCourtClosureService,
  updateCourtClosureService,
  deleteCourtClosureService,
  deleteAllCourtClosuresService,

  toggleFavoriteService,
  listFavoritesService,
} from "./courts.service.js";

// -------- Dashboard (admin/manager) --------
export async function createCourt(req, res, next) {
  try {
    const court = await createCourtService(req.body, req.user);
    return res.status(201).json({ court });
  } catch (e) {
    next(e);
  }
}

export async function getCourt(req, res, next) {
  try {
    const court = await getCourtByIdService(req.params.courtId, req.user);
    return res.json({ court });
  } catch (e) {
    next(e);
  }
}

export async function listCourts(req, res, next) {
  try {
    const result = await listCourtsService(req.validatedQuery ?? req.query, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}


export async function updateCourt(req, res, next) {
  try {
    const court = await updateCourtService(req.params.courtId, req.body, req.user);
    return res.json({ court });
  } catch (e) {
    next(e);
  }
}

export async function deleteCourt(req, res, next) {
  try {
    await deleteCourtService(req.params.courtId, req.user);
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function getAvailability(req, res, next) {
  try {
    const result = await getCourtAvailabilityService(
      req.params.courtId,
      req.validatedQuery ?? req.query,
      req.user
    );
    return res.json(result);
  } catch (e) {
    next(e);
  }
}


export async function listCourtClosures(req, res, next) {
  try {
    const items = await listCourtClosuresService(req.params.courtId, req.user);
    return res.json({ items });
  } catch (e) {
    next(e);
  }
}

export async function createCourtClosure(req, res, next) {
  try {
    const result = await createCourtClosureService(req.params.courtId, req.body, req.user);
    if (Array.isArray(result)) {
      return res.status(201).json({ closures: result, count: result.length });
    }
    return res.status(201).json({ closure: result });
  } catch (e) {
    next(e);
  }
}

export async function updateCourtClosure(req, res, next) {
  try {
    const closure = await updateCourtClosureService(req.params.closureId, req.body, req.user);
    return res.json({ closure });
  } catch (e) {
    next(e);
  }
}

export async function deleteCourtClosure(req, res, next) {
  try {
    await deleteCourtClosureService(req.params.closureId, req.user);
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function deleteAllCourtClosures(req, res, next) {
  try {
    const result = await deleteAllCourtClosuresService(req.params.courtId, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}


export async function reorderCourts(req, res, next) {
  try {
    const result = await reorderCourtsService(req.body?.courtIds, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// -------- Public (player/guest) active only --------
export async function listTopBookedPublicCourts(req, res, next) {
  try {
    const result = await listTopBookedPublicCourtsService(req.validatedQuery ?? req.query);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function listPublicCourts(req, res, next) {
  try {
    const result = await listPublicCourtsService(req.validatedQuery ?? req.query);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getPublicCourt(req, res, next) {
  try {
    const court = await getPublicCourtByIdService(req.params.courtId);
    return res.json({ court });
  } catch (e) {
    next(e);
  }
}

export async function getPublicAvailability(req, res, next) {
  try {
    const result = await getPublicCourtAvailabilityService(req.params.courtId, req.validatedQuery ?? req.query);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

// -------- Favorites (Player Only) --------
export async function toggleFavorite(req, res, next) {
  try {
    const result = await toggleFavoriteService(req.params.courtId, req.user.id);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function listFavorites(req, res, next) {
  try {
    const result = await listFavoritesService(req.user.id);
    return res.json({ items: result });
  } catch (e) {
    next(e);
  }
}
