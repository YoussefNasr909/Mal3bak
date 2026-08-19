import type {
  Court,
  Booking,
  BookingHoldStatus,
  BookingAttendanceFilter,
  BookingCustomerSummary,
  BookingCustomerTypeFilter,
  Notification,
  NotificationCategory,
  NotificationPreference,
  NotificationPriority,
  NotificationPushState,
  RevenueCustomerSummary,
  NotificationSummary,
  RevenueReportSortBy,
  RevenueReportSummary,
} from "./types"
import { config } from "./config"

// Minimal API client for the Express backend... (rest of header comment)
export type ApiValidationError = {
  path?: (string | number)[]
  message: string
}

export type ApiErrorBody = {
  message?: string
  errors?: ApiValidationError[]
}

export class ApiError extends Error {
  status: number
  body?: ApiErrorBody

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export class NetworkError extends Error {
  constructor(message = "Network connection failed") {
    super(message)
    this.name = "NetworkError"
  }
}

const NOTIFICATIONS_REFRESH_EVENT = "mal3bk:notifications:refresh"
const AUTH_REQUEST_TIMEOUT_MS = 5000

type NextFetchOptions = RequestInit & {
  next?: {
    revalidate?: number | false
    tags?: string[]
  }
  timeoutMs?: number
}


function buildUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`
  const base = typeof window === "undefined" ? config.serverApiUrl : config.apiBaseUrl
  return `${base}${path}`
}

function emitNotificationsRefresh() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT))
}

function buildRequestHeaders(options: NextFetchOptions = {}) {
  const headers = new Headers(options.headers || {})
  const hasBody = options.body !== undefined && options.body !== null
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  return headers
}

function createTimedFetchOptions(options: NextFetchOptions = {}) {
  const { timeoutMs, signal, ...rest } = options

  if (!timeoutMs || timeoutMs <= 0) {
    return {
      fetchOptions: {
        ...rest,
        signal,
      } as RequestInit,
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort(new Error("Request timed out"))
  }, timeoutMs)

  const handleExternalAbort = () => controller.abort()

  if (signal) {
    if (signal.aborted) {
      handleExternalAbort()
    } else {
      signal.addEventListener("abort", handleExternalAbort, { once: true })
    }
  }

  return {
    fetchOptions: {
      ...rest,
      signal: controller.signal,
    } as RequestInit,
    cleanup: () => {
      clearTimeout(timeoutId)
      if (signal) {
        signal.removeEventListener("abort", handleExternalAbort)
      }
    },
  }
}

function isAuthPath(path: string) {
  return path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout") ||
    path.startsWith("/auth/forgot-password") ||
    path.startsWith("/auth/reset-password")
}

let refreshRequestInFlight: Promise<boolean> | null = null

async function tryRefreshSession() {
  if (refreshRequestInFlight) return refreshRequestInFlight

  refreshRequestInFlight = (async () => {
    const { fetchOptions, cleanup } = createTimedFetchOptions({ timeoutMs: AUTH_REQUEST_TIMEOUT_MS })
    try {
      const res = await fetch(buildUrl("/auth/refresh"), {
        ...fetchOptions,
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: (() => {
          const refreshHeaders = new Headers()
          refreshHeaders.set("x-skip-auth-refresh", "1")
          refreshHeaders.set("Content-Type", "application/json")
          return refreshHeaders
        })(),
      })
      return res.ok
    } catch {
      return false
    } finally {
      cleanup()
      refreshRequestInFlight = null
    }
  })()

  return refreshRequestInFlight
}

async function parseJsonSafe(res: Response): Promise<any | null> {
  const contentType = res.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function apiFetch<T>(path: string, options: NextFetchOptions = {}, allowAuthRetry = true): Promise<T> {
  const url = buildUrl(path)
  const { fetchOptions, cleanup } = createTimedFetchOptions(options)

  let res: Response
  try {
    res = await fetch(url, {
      ...fetchOptions,
      credentials: "include",
      // Only set no-store if not explicitly overridden by next caching or cache options
      cache: options.cache || (options.next ? undefined : "no-store"),
      headers: buildRequestHeaders(options),
    })
  } catch (err: any) {
    cleanup()
    console.error("Fetch failure (Connectivity issue?):", err)
    if (err?.name === "AbortError") {
      throw new NetworkError("Request timed out. Please try again.")
    }
    throw new NetworkError(err.message || "Failed to connect to server")
  }
  cleanup()

  const body = (await parseJsonSafe(res)) as ApiErrorBody | any | null


if (!res.ok) {
  const skipAuthRefresh = typeof Headers !== "undefined"
    ? new Headers(options.headers || {}).get("x-skip-auth-refresh") === "1"
    : false

  if (
    allowAuthRetry &&
    typeof window !== "undefined" &&
    res.status === 401 &&
    !skipAuthRefresh &&
    !isAuthPath(path)
  ) {
    const refreshed = await tryRefreshSession()
    if (refreshed) {
      return apiFetch<T>(path, {
        ...options,
        headers: (() => {
          const retryHeaders = new Headers(options.headers || {})
          retryHeaders.set("x-skip-auth-refresh", "1")
          return retryHeaders
        })(),
      }, false)
    }
  }
    // Treat 500, 502, 503, 504 as potential connectivity issues if no structured body exists
    const isProxyError = res.status >= 500 && (!body || typeof body !== "object" || !body.message)
    const isConnectivityStatus = res.status === 502 || res.status === 503 || res.status === 504 || (res.status === 500 && isProxyError)

    if (isConnectivityStatus) {
      throw new NetworkError(`Server connectivity issue (${res.status})`)
    }

    const msg =
      (body && typeof body.message === "string" && body.message) ||
      res.statusText ||
      "Request failed"
    throw new ApiError(msg, res.status, body || undefined)
  }

  return (body as T) ?? ({} as T)
}

// -------------------------
// Uploads
// -------------------------

async function uploadWithAuthRetry(path: string, formData: FormData, failureMessage: string, allowAuthRetry = true) {
  let res: Response
  try {
    res = await fetch(buildUrl(path), {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      body: formData,
      headers: (() => {
        const uploadHeaders = new Headers()
        uploadHeaders.set("x-upload-request", "1")
        return uploadHeaders
      })(),
    })
  } catch (err: any) {
    throw new NetworkError(err.message || "Failed to connect to server")
  }

  const body = await parseJsonSafe(res)

  if (!res.ok) {
    if (allowAuthRetry && typeof window !== "undefined" && res.status === 401) {
      const refreshed = await tryRefreshSession()
      if (refreshed) {
        return uploadWithAuthRetry(path, formData, failureMessage, false)
      }
    }

    const isProxyError = res.status >= 500 && (!body || typeof body !== "object")
    const isConnectivityStatus = res.status === 502 || res.status === 503 || res.status === 504 || (res.status === 500 && isProxyError)

    if (isConnectivityStatus) {
      throw new NetworkError(`Server connectivity issue (${res.status})`)
    }

    const errorBody = body as ApiErrorBody | null
    const msg =
      (errorBody && typeof errorBody.message === "string" && errorBody.message) ||
      res.statusText ||
      failureMessage

    throw new ApiError(msg, res.status, errorBody || undefined)
  }

  return body
}

export async function uploadImages(files: File[]) {
  const formData = new FormData()
  files.forEach((file) => formData.append("files", file))

  const successBody = (await uploadWithAuthRetry("/uploads/images", formData, "Failed to upload images")) as
    | { urls: string[] }
    | null
  return successBody ?? { urls: [] }
}

export async function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append("file", file)

  const successBody = (await uploadWithAuthRetry("/uploads/avatar", formData, "Failed to upload avatar")) as
    | { url: string }
    | null
  return successBody ?? { url: "" }
}

// -------------------------
// Auth endpoints
// -------------------------

export type AuthRole = "admin" | "manager" | "player"

export type ApiUserStats = {
  totalBookings: number
  completedBookings: number
  cancelledBookings: number
  upcomingBookings: number
  favoriteCourts: number
  totalCourts: number
}

export type ApiUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  avatar?: string | null
  role: AuthRole
  createdAt: string
  stats?: ApiUserStats | null

  // Manager fields (optional)
  businessName?: string | null
  businessNameEn?: string | null
  description?: string | null
  descriptionEn?: string | null
  license?: string | null
  subscriptionPlan?: "starter" | "pro" | "enterprise" | null
}

export type RegisterRequest = {
  name: string
  email: string
  phone: string
  password: string
}

export type LoginRequest = {
  email: string
  password: string
  remember?: boolean
}

export async function authRegister(payload: RegisterRequest) {
  return apiFetch<{ user: ApiUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 15000,
  })
}

export async function authLogin(payload: LoginRequest) {
  return apiFetch<{ user: ApiUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 15000,
  })
}

export async function authSession() {
  return apiFetch<{ user: ApiUser }>("/auth/session", {
    method: "GET",
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  })
}

export async function authMe() {
  return apiFetch<{ user: ApiUser }>("/auth/me", {
    method: "GET",
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  })
}

export async function authLogout() {
  return apiFetch<{ ok: true }>("/auth/logout", {
    method: "POST",
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  })
}

export async function authRefresh() {
  return apiFetch<{ ok: true }>("/auth/refresh", {
    method: "POST",
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  })
}

export async function authForgotPassword(payload: { email: string }) {
  return apiFetch<{ ok: true }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs: 15000,
  })
}

export async function authResetPassword(payload: {
  userId: string
  token: string
  newPassword: string
}) {
  return apiFetch<{ ok: true }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

// -------------------------
// User Profiles & Settings
// -------------------------

export async function updateProfile(payload: {
  name?: string
  email?: string
  phone?: string | null
  avatar?: string | null
}) {
  const result = await apiFetch<{ user: ApiUser }>("/auth/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export async function changePassword(payload: {
  currentPassword: string
  newPassword: string
}) {
  return apiFetch<{ ok: true; signedOut?: boolean }>("/auth/password", {
    method: "PUT",
    body: JSON.stringify(payload),
  })
}

export async function deleteAccount() {
  return apiFetch<void>("/auth/account", {
    method: "DELETE",
  })
}

// -------------------------
// Admin User Management
// -------------------------

export type AdminUser = {
  id: string
  name: string
  email: string
  phone?: string | null
  avatar?: string | null
  role: AuthRole
  isActive: boolean
  deletedAt?: string | null
  createdAt: string
  updatedAt: string

  // Manager fields (optional)
  businessName?: string | null
  businessNameEn?: string | null
  description?: string | null
  descriptionEn?: string | null
  license?: string | null
  subscriptionPlan?: "starter" | "pro" | "enterprise" | null
}

export type AdminListUsersResponse = {
  items: AdminUser[]
  total: number
  page: number
  limit: number
  pages: number
}

export type AdminListUsersParams = {
  q?: string
  role?: AuthRole
  isActive?: boolean
  includeDeleted?: boolean
  excludeWalkIns?: boolean
  page?: number
  limit?: number
  sortBy?: "createdAt" | "name"
  order?: "asc" | "desc"
}

export type AdminUserCounts = {
  total: number
  active: number
  inactive: number
  byRole: {
    admin: number
    manager: number
    player: number
  }
}

function toQueryString(params: Record<string, any>) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return
    sp.set(k, String(v))
  })
  const s = sp.toString()
  return s ? `?${s}` : ""
}

export async function adminListUsers(params: AdminListUsersParams = {}) {
  const qs = toQueryString({
    q: params.q,
    role: params.role,
    isActive: typeof params.isActive === "boolean" ? String(params.isActive) : undefined,
    includeDeleted:
      typeof params.includeDeleted === "boolean" ? String(params.includeDeleted) : undefined,
    excludeWalkIns:
      typeof params.excludeWalkIns === "boolean" ? String(params.excludeWalkIns) : undefined,
    page: params.page,
    limit: params.limit,
    sortBy: params.sortBy,
    order: params.order,
  })

  return apiFetch<AdminListUsersResponse>(`/admin/users${qs}`, { method: "GET" })
}

export async function adminGetUserCounts(params: Pick<AdminListUsersParams, "q" | "role" | "includeDeleted" | "excludeWalkIns"> = {}) {
  const qs = toQueryString({
    q: params.q,
    role: params.role,
    includeDeleted:
      typeof params.includeDeleted === "boolean" ? String(params.includeDeleted) : undefined,
    excludeWalkIns:
      typeof params.excludeWalkIns === "boolean" ? String(params.excludeWalkIns) : undefined,
  })

  return apiFetch<AdminUserCounts>(`/admin/users/counts${qs}`, { method: "GET" })
}

export async function adminGetUser(id: string) {
  return apiFetch<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(id)}`, {
    method: "GET",
  })
}

export type AdminCreateUserRequest = {
  name: string
  email: string
  phone?: string
  password: string
  role: AuthRole
  isActive?: boolean

  // Manager fields (optional)
  businessName?: string
  businessNameEn?: string
  description?: string
  descriptionEn?: string
  license?: string
  subscriptionPlan?: "starter" | "pro" | "enterprise"
}

export async function adminCreateUser(payload: AdminCreateUserRequest) {
  return apiFetch<{ user: AdminUser }>("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export type AdminUpdateUserRequest = {
  name?: string
  email?: string
  phone?: string
  role?: AuthRole
  isActive?: boolean

  // Manager fields (optional)
  businessName?: string
  businessNameEn?: string
  description?: string
  descriptionEn?: string
  license?: string
  subscriptionPlan?: "starter" | "pro" | "enterprise"
}

export async function adminUpdateUser(id: string, payload: AdminUpdateUserRequest) {
  const result = await apiFetch<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export async function adminUpdateUserStatus(id: string, isActive: boolean) {
  const result = await apiFetch<{ user: AdminUser }>(
    `/admin/users/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }
  )
  emitNotificationsRefresh()
  return result
}

export async function adminUpdateUserRole(id: string, role: AuthRole) {
  const result = await apiFetch<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  })
  emitNotificationsRefresh()
  return result
}

export async function adminDeleteUser(id: string) {
  return apiFetch<{}>(`/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

export async function adminCreatePasswordResetLink(
  id: string,
  payload?: { expiresInMinutes?: number }
) {
  const result = await apiFetch<{ resetUrl: string; expiresAt: string }>(
    `/admin/users/${encodeURIComponent(id)}/reset-password-link`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }
  )
  emitNotificationsRefresh()
  return result
}

export async function adminGetDashboardStats() {
  return apiFetch<{
    totalUsers: number;
    totalCourts: number;
    totalBookings: number;
    grossRevenue: number;
    confirmedAmount: number;
    checkedInAmount?: number;
    completedAmount: number;
    bookingCounts: {
      confirmed: number;
      pending: number;
      completed: number;
      cancelled: number;
      no_show: number;
      checked_in?: number;
    };
    usersBreakdown: {
      players: number;
      managers: number;
      admins: number;
    };
    todayBookings: number;
  }>("/admin/dashboard-stats", {
    method: "GET",
  })
}

// -------------------------
// Courts
// -------------------------

export type ListCourtsParams = {
  q?: string
  city?: string
  sportType?: string
  status?: "active" | "inactive" | "maintenance"
  managerId?: string
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
  date?: string
  slotMinutes?: number
  onlyAvailable?: boolean
  sortBy?: string
  sortOrder?: "asc" | "desc"
  amenities?: string
  courtIds?: string
}

export type ListCourtsResponse = {
  items: Court[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
    truncated?: boolean
    totalIsLowerBound?: boolean
    scanMaxRows?: number
  }
}

export type AvailabilityResponse = {
  courtId: string
  date: string
  slotMinutes: number
  slots: Array<{ date?: string; start: string; end: string; available: boolean; closureReason?: string | null; unavailableReason?: string | null }>
}

export type CourtClosurePayload =
  | {
      mode?: "single"
      fullDay?: boolean
      date?: string
      startDate?: string
      endDate?: string
      reason?: string | null
    }
  | {
      mode: "daily"
      fullDay?: boolean
      rangeStartDate: string
      rangeEndDate: string
      dailyStartTime?: string
      dailyEndTime?: string
      reason?: string | null
    }

export type CourtPayload = Partial<Court> & {
  name: string
  nameEn: string
  sportType: string
  city: string
  cityEn: string
  peakPrice: number
  offPeakPrice: number
  peakStartTime: string
  peakEndTime: string
  openTime: string
  closeTime: string
  useOpeningDayForOvernightBookings?: boolean
}

export async function listCourts(params: ListCourtsParams = {}) {
  return apiFetch<ListCourtsResponse>(`/courts${toQueryString(params)}`, {
    method: "GET",
  })
}

// Simple in-memory cache for public courts to improve perceived performance
const publicCourtsCache = new Map<string, { data: ListCourtsResponse; expiry: number }>();
const MAX_PUBLIC_COURTS_CACHE_ENTRIES = 40

export function clearPublicCourtsCache() {
  publicCourtsCache.clear()
}


export async function listPublicCourts(params: ListCourtsParams = {}) {
  const qs = toQueryString(params);
  const cacheKey = qs;
  
  if (typeof window !== "undefined") {
    const cached = publicCourtsCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
  }

  const data = await apiFetch<ListCourtsResponse>(`/courts/public${qs}`, {
    method: "GET",
    next: { revalidate: 60 }, // 🚀 Cache for 1 minute
  });

  if (typeof window !== "undefined") {
    const now = Date.now()
    for (const [key, entry] of publicCourtsCache.entries()) {
      if (entry.expiry <= now) publicCourtsCache.delete(key)
    }
    while (publicCourtsCache.size >= MAX_PUBLIC_COURTS_CACHE_ENTRIES) {
      const oldestKey = publicCourtsCache.keys().next().value
      if (!oldestKey) break
      publicCourtsCache.delete(oldestKey)
    }
    // Cache for 2 minutes in the browser
    publicCourtsCache.set(cacheKey, { data, expiry: now + 120000 });
  }

  return data;
}

export async function listTopBookedPublicCourts(params: { limit?: number } = {}) {
  const qs = toQueryString({ limit: params.limit ?? 3 });
  const cacheKey = `top-booked${qs}`;

  if (typeof window !== "undefined") {
    const cached = publicCourtsCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
  }

  const data = await apiFetch<ListCourtsResponse>(`/courts/public/top-booked${qs}`, {
    method: "GET",
    next: { revalidate: 60 },
  });

  if (typeof window !== "undefined") {
    publicCourtsCache.set(cacheKey, { data, expiry: Date.now() + 120000 });
  }

  return data;
}

export async function getCourt(id: string) {
  return apiFetch<{ court: Court }>(`/courts/${encodeURIComponent(id)}`, {
    method: "GET",
  })
}

export async function getPublicCourt(id: string) {
  return apiFetch<{ court: Court }>(`/courts/public/${encodeURIComponent(id)}`, {
    method: "GET",
    next: { revalidate: 300 }, // 🚀 Cache for 5 minutes
  })
}

export async function getCourtAvailability(
  id: string,
  params: { date: string; slotMinutes?: number }
) {
  return apiFetch<AvailabilityResponse>(
    `/courts/${encodeURIComponent(id)}/availability${toQueryString(params)}`,
    { method: "GET" }
  )
}

export async function getPublicCourtAvailability(
  id: string,
  params: { date: string; slotMinutes?: number }
) {
  return apiFetch<AvailabilityResponse>(
    `/courts/public/${encodeURIComponent(id)}/availability${toQueryString(params)}`,
    { method: "GET" }
  )
}

export async function createCourt(payload: CourtPayload) {
  const result = await apiFetch<{ court: Court }>(`/courts`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  return result
}

export async function updateCourt(courtId: string, payload: Partial<CourtPayload>) {
  const result = await apiFetch<any>(`/courts/${courtId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  return result
}

export async function deleteCourt(courtId: string) {
  const result = await apiFetch<void>(`/courts/${courtId}`, {
    method: "DELETE",
  })
  clearPublicCourtsCache()
  return result
}

export async function reorderCourts(courtIds: string[]) {
  const result = await apiFetch<{ items: Court[] }>(`/admin/courts/order`, {
    method: "PATCH",
    body: JSON.stringify({ courtIds }),
  })
  clearPublicCourtsCache()
  return result
}


export async function listCourtClosures(courtId: string) {
  return apiFetch<{ items: import("@/lib/types").CourtClosure[] }>(`/courts/${encodeURIComponent(courtId)}/closures`, {
    method: "GET",
  })
}

export async function createCourtClosure(courtId: string, payload: CourtClosurePayload) {
  const result = await apiFetch<{ closure: import("@/lib/types").CourtClosure }>(`/courts/${encodeURIComponent(courtId)}/closures`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  return result
}

export async function updateCourtClosure(closureId: string, payload: Partial<CourtClosurePayload>) {
  const result = await apiFetch<{ closure: import("@/lib/types").CourtClosure }>(`/courts/closures/${encodeURIComponent(closureId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  return result
}

export async function deleteCourtClosure(closureId: string) {
  const result = await apiFetch<void>(`/courts/closures/${encodeURIComponent(closureId)}`, {
    method: "DELETE",
  })
  clearPublicCourtsCache()
  return result
}

export async function deleteAllCourtClosures(courtId: string) {
  const result = await apiFetch<{ deletedCount: number; protectedTournamentCount?: number; message?: string }>(`/courts/${encodeURIComponent(courtId)}/closures`, {
    method: "DELETE",
  })
  clearPublicCourtsCache()
  return result
}

// -------- Favorites --------

export async function getFavorites() {
  return apiFetch<{ items: Court[] }>(`/courts/favorites`)
}

export async function toggleFavorite(courtId: string) {
  return apiFetch<{ favorited: boolean }>(`/courts/${courtId}/favorite`, {
    method: "POST",
  })
}

// -------------------------
// Bookings
// -------------------------

export type ListBookingsParams = {
  mine?: boolean
  q?: string
  courtId?: string
  courtIds?: string
  managerId?: string
  date?: string
  dateFrom?: string
  dateTo?: string
  status?: string
  // Attendance is a derived filter, not a persisted booking status.
  attendance?: BookingAttendanceFilter
  customerType?: BookingCustomerTypeFilter
  bucket?: "upcoming" | "history" | "past" | "current" | "future"
  paymentStatus?: "pending" | "paid" | "failed" | "refunded"
  includeSummary?: boolean
  page?: number
  limit?: number
  sortBy?: "date" | "amount" | "status" | "createdAt" | "player" | "court"
  order?: "asc" | "desc"
}

export type ListBookingsResponse = {
  items: Booking[]
  total: number
  page: number
  limit: number
  pages: number
  summary?: {
    total: number
    checked_in: number
    confirmed: number
    pending: number
    completed: number
    cancelled: number
    no_show: number
  }
  customerSummary?: BookingCustomerSummary
}

export type RevenueReportParams = {
  q?: string
  courtId?: string
  dateFrom?: string
  dateTo?: string
  customerType?: BookingCustomerTypeFilter
  page?: number
  limit?: number
  sortBy?: RevenueReportSortBy
  order?: "asc" | "desc"
}

export type RevenueReportResponse = {
  items: Booking[]
  total: number
  page: number
  limit: number
  pages: number
  summary: RevenueReportSummary
  customerSummary: RevenueCustomerSummary
}

export interface CreateBookingPayload {
  courtId: string
  date: string
  startTime: string
  endTime: string
  notes?: string | null
  totalPrice?: number
  couponCode?: string | null
}

export interface CreateManualBookingPayload {
  courtId: string
  date: string
  startTime: string
  endTime: string
  notes?: string | null
  userId?: string
  guestName?: string
  guestPhone?: string
  paymentMethod?: string
  paymentStatus?: "pending" | "paid" | "failed" | "refunded"
  discountType?: "percentage" | "fixed"
  discountValue?: number
}

export interface ManualBookingCustomerLookup {
  id: string
  name: string
  phone: string
  email: string
}

export async function listBookings(params: ListBookingsParams = {}) {
  return apiFetch<ListBookingsResponse>(`/bookings${toQueryString(params)}`, {
    method: "GET",
  })
}

export async function getBooking(id: string) {
  return apiFetch<{ booking: Booking }>(`/bookings/${encodeURIComponent(id)}`, {
    method: "GET",
  })
}

export async function getBookingHoldStatus(id: string) {
  return apiFetch<BookingHoldStatus>(`/bookings/${encodeURIComponent(id)}/hold-status`, {
    method: "GET",
  })
}

export async function createBooking(payload: CreateBookingPayload) {
  const result = await apiFetch<{ booking: Booking; code: string }>(`/bookings`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  emitNotificationsRefresh()
  return result
}

export async function createManualBooking(payload: CreateManualBookingPayload) {
  const result = await apiFetch<{ booking: Booking; code: string }>(`/bookings/manual`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  emitNotificationsRefresh()
  return result
}

export async function lookupManualBookingCustomerByPhone(phone: string) {
  return apiFetch<{ user: ManualBookingCustomerLookup | null }>(
    `/bookings/manual-customer?phone=${encodeURIComponent(phone)}`,
    {
      method: "GET",
    }
  )
}

export async function updateBooking(
  id: string,
  payload: Partial<{ status: string; notes: string | null }>
) {
  const result = await apiFetch<{ booking: Booking }>(`/bookings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
  clearPublicCourtsCache()
  emitNotificationsRefresh()
  return result
}

export async function updateBookingStatus(id: string, status: string) {
  return updateBooking(id, { status })
}

export async function deleteBooking(id: string) {
  const result = await apiFetch<void>(`/bookings/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  clearPublicCourtsCache()
  emitNotificationsRefresh()
  return result
}
export async function cancelBooking(id: string, options?: { lang?: string }) {
  const result = await apiFetch<{ booking: Booking }>(`/bookings/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ lang: options?.lang ?? "en" }),
  })
  clearPublicCourtsCache()
  emitNotificationsRefresh()
  return result
}

export async function checkInBooking(id: string, lang?: string) {
  return apiFetch<{ booking: Booking; message?: string }>(
    `/bookings/${encodeURIComponent(id)}/check-in`,
    {
      method: "POST",
      body: JSON.stringify({ lang }),
    }
  )
}

export async function checkOutBooking(id: string, lang?: string) {
  return apiFetch<{ booking: Booking; message?: string }>(
    `/bookings/${encodeURIComponent(id)}/check-out`,
    {
      method: "POST",
      body: JSON.stringify({ lang }),
    }
  )
}

export async function verifyBookingCode(code: string, lang?: string) {
  return apiFetch<{ booking: Booking; message?: string }>(`/bookings/verify-code`, {
    method: "POST",
    body: JSON.stringify({ code, lang }),
  })
}

export type BookedSlot = {
  date: string
  startTime: string
  endTime: string
  reason?: string | null
  status?: string
  useOpeningDayForOvernightBookings?: boolean
}

export type BookedSlotsResponse = {
  courtId: string
  date: string
  openTime: string
  closeTime: string
  bookedSlots: BookedSlot[]
  bookingSlots?: BookedSlot[]
  closureSlots?: BookedSlot[]
}

export async function getBookedSlots(courtId: string, date: string) {
  return apiFetch<BookedSlotsResponse>(
    `/bookings/availability?courtId=${encodeURIComponent(courtId)}&date=${encodeURIComponent(date)}`,
    { method: "GET" }
  )
}

export async function managerGetDashboardStats() {
  return apiFetch<{
    totalBookings: number;
    grossRevenue: number;
    confirmedAmount: number;
    completedAmount: number;
    bookingCounts: {
      confirmed: number;
      pending: number;
      completed: number;
      cancelled: number;
      no_show: number;
      checked_in?: number;
    };
    todayBookings: number;
  }>("/bookings/dashboard-stats", {
    method: "GET",
  })
}

export async function managerGetRevenueReport(params: RevenueReportParams = {}) {
  return apiFetch<RevenueReportResponse>(`/bookings/revenue-report${toQueryString(params)}`, {
    method: "GET",
  })
}

export async function adminGetRevenueReport(params: RevenueReportParams = {}) {
  return apiFetch<RevenueReportResponse>(`/admin/revenue-report${toQueryString(params)}`, {
    method: "GET",
  })
}

// -------------------------
// Tournaments
// -------------------------

export type TournamentStatus =
  | "draft"
  | "published"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed"
  | "cancelled"

export type TournamentListParams = {
  q?: string
  status?: TournamentStatus
  mine?: boolean
  page?: number
  limit?: number
  sortBy?: "createdAt" | "startDate" | "title" | "status"
  order?: "asc" | "desc"
}

export type TournamentPayload = {
  title: string
  titleAr?: string | null
  description?: string | null
  descriptionAr?: string | null
  teamsPerGroup: number
  maxTeams: number
  entryFee?: number | null
  registrationOpenAt?: string | null
  registrationCloseAt?: string | null
  startDate?: string | null
  endDate?: string | null
  rules?: string | null
  coverImage?: string | null
  courtIds: string[]
  managerId?: string
}

export type TournamentTeamPayload = {
  teamName: string
  partnerName: string
  partnerPhone?: string | null
  notes?: string | null
}

export type TournamentWaitlistPayload = TournamentTeamPayload

export type TournamentMatchSchedulePayload = {
  courtId: string
  startAt: string
  endAt: string
}

export type TournamentMatchResultPayload = {
  winnerTeamId: string
  score?: { teamA?: number[]; teamB?: number[]; resultType?: "standard" | "walkover" | "retired" }
}

export type TournamentBulkReviewPayload = {
  teamIds: string[]
  status: "approved" | "rejected"
  notes?: string | null
}

export type TournamentMatchCheckInPayload = {
  teamId: string
  checkedIn?: boolean
}

export async function listTournaments(params: TournamentListParams = {}) {
  return apiFetch<{ items: import("@/lib/types").Tournament[]; total: number; page: number; limit: number; pages: number }>(`/tournaments${toQueryString(params)}`, {
    method: "GET",
  })
}

export async function getTournament(tournamentId: string) {
  return apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}`, {
    method: "GET",
  })
}

export async function getPublicTournament(tournamentId: string) {
  return apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/public/${encodeURIComponent(tournamentId)}`, {
    method: "GET",
  })
}

export async function createTournament(payload: TournamentPayload) {
  return apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function deleteTournament(tournamentId: string) {
  return apiFetch<{ success: true }>(`/tournaments/${encodeURIComponent(tournamentId)}`, {
    method: "DELETE",
  })
}

export async function updateTournament(tournamentId: string, payload: Partial<TournamentPayload>) {
  return apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function publishTournament(tournamentId: string) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}/publish`, { method: "POST" })
  emitNotificationsRefresh()
  return result
}

export async function openTournamentRegistration(tournamentId: string) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}/open-registration`, { method: "POST" })
  emitNotificationsRefresh()
  return result
}

export async function closeTournamentRegistration(tournamentId: string) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}/close-registration`, { method: "POST" })
  emitNotificationsRefresh()
  return result
}

export async function cancelTournament(tournamentId: string) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}/cancel`, { method: "POST" })
  emitNotificationsRefresh()
  return result
}

export async function completeTournament(tournamentId: string) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}/complete`, { method: "POST" })
  emitNotificationsRefresh()
  return result
}

export async function registerTournamentTeam(tournamentId: string, payload: TournamentTeamPayload) {
  const result = await apiFetch<{ team: import("@/lib/types").TournamentTeam }>(`/tournaments/${encodeURIComponent(tournamentId)}/register`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export async function joinTournamentWaitlist(tournamentId: string, payload: TournamentWaitlistPayload) {
  const result = await apiFetch<{ entry: import("@/lib/types").TournamentWaitlistEntry }>(`/tournaments/${encodeURIComponent(tournamentId)}/waitlist`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export async function withdrawTournamentWaitlistEntry(tournamentId: string, entryId: string) {
  const result = await apiFetch<{ entry: import("@/lib/types").TournamentWaitlistEntry; message?: string }>(`/tournaments/${encodeURIComponent(tournamentId)}/waitlist/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  })
  emitNotificationsRefresh()
  return result
}

export async function promoteTournamentWaitlistEntry(tournamentId: string, entryId: string) {
  const result = await apiFetch<{ entry: import("@/lib/types").TournamentWaitlistEntry; team: import("@/lib/types").TournamentTeam; message?: string }>(`/tournaments/${encodeURIComponent(tournamentId)}/waitlist/${encodeURIComponent(entryId)}/promote`, {
    method: "POST",
  })
  emitNotificationsRefresh()
  return result
}

export async function promoteNextTournamentWaitlistEntry(tournamentId: string) {
  const result = await apiFetch<{ entry: import("@/lib/types").TournamentWaitlistEntry; team: import("@/lib/types").TournamentTeam; message?: string }>(`/tournaments/${encodeURIComponent(tournamentId)}/waitlist/promote-next`, {
    method: "POST",
  })
  emitNotificationsRefresh()
  return result
}

export async function withdrawTournamentTeam(tournamentId: string, teamId: string) {
  const result = await apiFetch<{ team: import("@/lib/types").TournamentTeam; message?: string }>(`/tournaments/${encodeURIComponent(tournamentId)}/register/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
  })
  emitNotificationsRefresh()
  return result
}

export async function approveTournamentTeam(tournamentId: string, teamId: string, payload?: { notes?: string | null }) {
  const result = await apiFetch<{ team: import("@/lib/types").TournamentTeam }>(`/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(teamId)}/approve`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  })
  emitNotificationsRefresh()
  return result
}

export async function rejectTournamentTeam(tournamentId: string, teamId: string, payload?: { notes?: string | null }) {
  const result = await apiFetch<{ team: import("@/lib/types").TournamentTeam }>(`/tournaments/${encodeURIComponent(tournamentId)}/teams/${encodeURIComponent(teamId)}/reject`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  })
  emitNotificationsRefresh()
  return result
}

export async function bulkReviewTournamentTeams(tournamentId: string, payload: TournamentBulkReviewPayload) {
  const result = await apiFetch<{ teams: import("@/lib/types").TournamentTeam[] }>(`/tournaments/${encodeURIComponent(tournamentId)}/teams/bulk-review`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export type TournamentImportTeamRow = {
  teamName: string
  captainUserId?: string | null
  captainEmail?: string | null
  captainPhone?: string | null
  captainName?: string | null
  partnerName: string
  partnerPhone?: string | null
  notes?: string | null
  status?: "pending" | "approved"
}

export async function importTournamentTeams(tournamentId: string, payload: { mode?: "active" | "waitlist"; teams: TournamentImportTeamRow[] }) {
  const result = await apiFetch<{
    imported: import("@/lib/types").TournamentTeam[]
    waitlisted: import("@/lib/types").TournamentWaitlistEntry[]
    failed: Array<{ rowNumber: number; teamName?: string | null; reason: string }>
  }>(`/tournaments/${encodeURIComponent(tournamentId)}/teams/import`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export async function previewTournamentDraw(tournamentId: string, drawSeed?: string) {
  const suffix = drawSeed ? `?drawSeed=${encodeURIComponent(drawSeed)}` : ""
  return apiFetch<{ preview: import("@/lib/types").TournamentDrawPreview }>(`/tournaments/${encodeURIComponent(tournamentId)}/draw-preview${suffix}`)
}

export async function generateTournamentBracket(tournamentId: string, payload?: { drawSeed?: string; drawGroups?: Array<{ groupId?: string; teamIds: string[] }> }) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament }>(`/tournaments/${encodeURIComponent(tournamentId)}/generate-bracket`, { method: "POST", body: JSON.stringify(payload || {}) })
  emitNotificationsRefresh()
  return result
}

export async function autoScheduleTournamentMatches(tournamentId: string, payload?: { startAt?: string; durationMinutes?: number; gapMinutes?: number; courtIds?: string[] }) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament; scheduledCount: number; skipped: Array<{ matchId: string; roundNumber: number; matchNumber: number }> }>(`/tournaments/${encodeURIComponent(tournamentId)}/auto-schedule`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  })
  emitNotificationsRefresh()
  return result
}

export async function scheduleTournamentMatch(tournamentId: string, matchId: string, payload: TournamentMatchSchedulePayload) {
  const result = await apiFetch<{ match: import("@/lib/types").TournamentMatch }>(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/schedule`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

export async function checkInTournamentMatchTeam(tournamentId: string, matchId: string, payload: TournamentMatchCheckInPayload) {
  return apiFetch<{ match: import("@/lib/types").TournamentMatch }>(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/check-in`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function sendTournamentMatchReminder(tournamentId: string, matchId: string) {
  const result = await apiFetch<{ success: boolean; match: import("@/lib/types").TournamentMatch }>(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/reminder`, {
    method: "POST",
  })
  emitNotificationsRefresh()
  return result
}

export async function recordTournamentMatchResult(tournamentId: string, matchId: string, payload: TournamentMatchResultPayload) {
  const result = await apiFetch<{ tournament: import("@/lib/types").Tournament; match: import("@/lib/types").TournamentMatch }>(`/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/result`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  emitNotificationsRefresh()
  return result
}

// -------------------------
// Notifications
// -------------------------

export type ListNotificationsParams = {
  page?: number
  limit?: number
  unreadOnly?: boolean
  category?: NotificationCategory
  priority?: NotificationPriority | "important"
}

export type ListNotificationsResponse = {
  items: Notification[]
  total: number
  page: number
  limit: number
  pages: number
  unreadCount: number
  summary: NotificationSummary
}

export type NotificationPreferencesResponse = {
  preferences: NotificationPreference
  push: NotificationPushState
}

export type UpdateNotificationPreferencesPayload = Partial<NotificationPreference>

export type CreatePushSubscriptionPayload = {
  endpoint: string
  p256dhKey: string
  authKey: string
  userAgent?: string | null
}

export async function listNotifications(params: ListNotificationsParams = {}) {
  return apiFetch<ListNotificationsResponse>(`/notifications${toQueryString({
    page: params.page,
    limit: params.limit,
    unreadOnly: typeof params.unreadOnly === "boolean" ? String(params.unreadOnly) : undefined,
    category: params.category,
    priority: params.priority,
  })}`, {
    method: "GET",
  })
}

export async function getNotificationPreferences() {
  return apiFetch<NotificationPreferencesResponse>("/notification-preferences", {
    method: "GET",
  })
}

export async function updateNotificationPreferences(payload: UpdateNotificationPreferencesPayload) {
  return apiFetch<NotificationPreferencesResponse>("/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function createPushSubscription(payload: CreatePushSubscriptionPayload) {
  return apiFetch<{ subscription: NotificationPushState["subscriptions"][number] }>("/push-subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function deletePushSubscription(endpoint: string) {
  return apiFetch<{ deletedCount: number }>("/push-subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  })
}

export async function markNotificationRead(
  notificationId: string,
  options?: { emitRefresh?: boolean },
) {
  const result = await apiFetch<{ notification: Notification; unreadCount: number }>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
  )
  if (options?.emitRefresh !== false) {
    emitNotificationsRefresh()
  }
  return result
}

export async function markAllNotificationsRead(options?: { emitRefresh?: boolean }) {
  const result = await apiFetch<{ updatedCount: number; unreadCount: number }>(
    `/notifications/read-all`,
    { method: "POST" },
  )
  if (options?.emitRefresh !== false) {
    emitNotificationsRefresh()
  }
  return result
}

export async function deleteNotification(
  notificationId: string,
  options?: { emitRefresh?: boolean },
) {
  const result = await apiFetch<{ deletedId: string; unreadCount: number }>(
    `/notifications/${encodeURIComponent(notificationId)}`,
    { method: "DELETE" },
  )
  if (options?.emitRefresh !== false) {
    emitNotificationsRefresh()
  }
  return result
}

export async function clearReadNotifications(options?: { emitRefresh?: boolean }) {
  const result = await apiFetch<{ deletedCount: number; unreadCount: number }>(
    `/notifications`,
    { method: "DELETE" },
  )
  if (options?.emitRefresh !== false) {
    emitNotificationsRefresh()
  }
  return result
}

export async function createPaymobCheckoutSession(params: {
  bookingId?: string
  courtId?: string
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
  couponCode?: string
  paymentMethodType?: "card" | "wallet" | "apple_pay" | "all"
}) {
  try {
    return await apiFetch<{
      bookingId: string
      paymentId: string
      clientSecret: string
      checkoutUrl: string
      amount: number
      currency: string
    }>(`/payments/create-checkout-session`, {
      method: "POST",
      body: JSON.stringify(params),
    })
  } catch (error: any) {
    console.error("Paymob checkout session error:", {
      message: error?.message,
      status: error?.status,
      body: error?.body,
      params,
    })
    throw error
  }
}

export async function refundPayment(paymentIdOrBookingId: string, customAmount?: number) {
  return await apiFetch<{
    ok: boolean
    message: string
    data: any
  }>(`/payments/refund/${paymentIdOrBookingId}`, {
    method: "POST",
    body: JSON.stringify(customAmount ? { amount: customAmount } : {}),
  })
}

// -------------------------
// Coupons & Promo Codes
// -------------------------

export async function validateCoupon(params: {
  code: string
  courtId: string
  bookingAmount: number
}) {
  return await apiFetch<import("@/lib/types").ValidateCouponResponse>(`/coupons/validate`, {
    method: "POST",
    body: JSON.stringify(params),
  })
}

export async function listCoupons(params: {
  courtId?: string
  isActive?: boolean
  search?: string
  page?: number
  limit?: number
} = {}) {
  return await apiFetch<{
    items: import("@/lib/types").Coupon[]
    pagination: {
      total: number
      page: number
      limit: number
      totalPages: number
    }
  }>(`/coupons${toQueryString(params)}`, {
    method: "GET",
  })
}

export async function createCoupon(payload: {
  code: string
  description?: string
  discountType: "percentage" | "fixed"
  discountValue: number
  minBookingAmount?: number | null
  maxDiscountCap?: number | null
  maxUses?: number | null
  maxUsesPerUser?: number | null
  startDate?: string | null
  expiresAt?: string | null
  courtId?: string | null
  isActive?: boolean
}) {
  return await apiFetch<{
    success: boolean
    message: string
    coupon: import("@/lib/types").Coupon
  }>(`/coupons`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateCoupon(
  id: string,
  payload: Partial<{
    description?: string
    discountType?: "percentage" | "fixed"
    discountValue?: number
    minBookingAmount?: number | null
    maxDiscountCap?: number | null
    maxUses?: number | null
    maxUsesPerUser?: number | null
    startDate?: string | null
    expiresAt?: string | null
    courtId?: string | null
    isActive?: boolean
  }>,
) {
  return await apiFetch<{
    success: boolean
    message: string
    coupon: import("@/lib/types").Coupon
  }>(`/coupons/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function deleteCoupon(id: string) {
  return await apiFetch<{ success: boolean; message: string }>(`/coupons/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

export { NOTIFICATIONS_REFRESH_EVENT }

