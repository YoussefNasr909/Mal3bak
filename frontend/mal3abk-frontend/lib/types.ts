// Court type definition
export interface Court {
  id: string;
  name: string;
  nameEn: string;
  sportType: string;
  city: string;
  cityEn: string;
  address?: string;
  addressEn?: string;
  rating: number;
  reviewCount: number;
  peakPrice: number;
  offPeakPrice: number;
  peakStartTime?: string;
  peakEndTime?: string;
  images: string[];
  amenities: string[];
  amenitiesEn: string[];
  openTime?: string;
  closeTime?: string;
  useOpeningDayForOvernightBookings?: boolean;
  maxPlayers: number;
  description?: string;
  descriptionEn?: string;
  latitude?: number;
  longitude?: number;
  managerId?: string;
  managerName?: string;
  location?: string;
  locationEn?: string;
  status?: "active" | "inactive" | "maintenance";
  totalBookings?: number;
  createdAt?: Date;
  availableSlots?: number;
  displayOrder?: number;
}


export interface CourtClosure {
  id: string;
  courtId: string;
  startDate: string | Date;
  endDate: string | Date;
  reason?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  isTournamentReservation?: boolean;
  tournamentMatchId?: string | null;
  tournamentId?: string | null;
  tournamentRoundNumber?: number | null;
  tournamentMatchNumber?: number | null;
  tournamentTitle?: string | null;
  tournamentStatus?: string | null;
}

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type BookingAttendanceFilter = "checked_in" | "pending";
export type BookingDisplayStatus = BookingStatus | "checked_in";
export type RevenueReportSortBy = "date" | "amount" | "player" | "checkInAt";
export type BookingCustomerTypeFilter = "guest" | "registered";

// Booking type definition
export interface Booking {
  id: string;
  courtId: string;
  courtName: string;
  courtNameEn: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail?: string;
  userAvatar?: string | null;
  // Player properties (for compatibility with mock data)
  playerId?: string;
  playerName?: string;
  playerNameEn?: string;
  date: string;
  startTime: string;
  endTime: string;
  sessionOpenTime?: string;
  sessionCloseTime?: string;
  duration: number;
  totalPrice: number;
  amount?: number; // Alternative to totalPrice
  // Persisted backend status only. "checked_in" is derived in the UI from attendance fields.
  status: BookingStatus;
  paymentStatus: "pending" | "paid" | "refunded";
  paymentMethod?: string;
  checkInCode?: string;
  checkInVerified?: boolean;
  checkedIn?: boolean;
  checkedInAt?: string | Date | null;
  windowState?: "early" | "open" | "late";
  canCheckInNow?: boolean;
  createdAt: string | Date;
  sportType?: string;
  notes?: string;
  courtOpenTime?: string;
  courtImage?: string | null;
  courtCity?: string | null;
  courtCityEn?: string | null;
  courtAddress?: string | null;
  courtAddressEn?: string | null;
  courtCloseTime?: string;
  useOpeningDayForOvernightBookings?: boolean;
  court?: Court;
}

export interface RevenueReportSummary {
  totalRevenue: number;
  checkedInCount: number;
  completedCount: number;
  averageBookingValue: number;
}

export interface BookingCustomerSummary {
  total: number;
  guest: number;
  registered: number;
}

export interface RevenueCustomerSummary {
  total: number;
  guestCount: number;
  registeredCount: number;
  guestRevenue: number;
  registeredRevenue: number;
}

// Payment type definition
export interface Payment {
  id: string;
  bookingId: string;
  courtName?: string;
  courtNameEn?: string;
  courtId?: string;
  amount: number;
  status: "pending" | "completed" | "refunded" | "failed";
  method: string;
  date: string | Date;
  createdAt?: string | Date;
  transactionId?: string;
  userId?: string;
  userName?: string;
  paymentDate?: string | Date;
  dueDate?: string | Date;
  description?: string;
}

// User type definition
export interface User {
  id: string;
  name: string;
  nameEn?: string;
  email: string;
  phone?: string;
  role: "admin" | "manager" | "player";
  avatar?: string;
  createdAt?: string | Date;
  isActive?: boolean;
  lastLogin?: string;
  // Extended fields used in mock data
  city?: string;
  cityEn?: string;
  totalBookings?: number;
  totalSpent?: number;
  membershipLevel?: "silver" | "gold" | "platinum" | string;
  status?: "active" | "inactive" | string;
  joinDate?: string | Date;
  lastActivity?: string | Date;
  level?: number;
  xp?: number;
}

export type NotificationCategory = "booking" | "tournament" | "account" | "system" | "admin";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationDeliveryChannel = "in_app" | "web_push";
export type NotificationDeliveryStatus = "sent" | "failed" | "skipped";

export interface NotificationDeliverySummaryItem {
  status: NotificationDeliveryStatus;
  provider?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
}

export type NotificationDeliverySummary = Partial<
  Record<NotificationDeliveryChannel, NotificationDeliverySummaryItem>
>;

export interface NotificationSummary {
  unreadCount: number;
  urgentUnreadCount: number;
  byCategory: Record<NotificationCategory, number>;
}

export interface NotificationPreference {
  inAppEnabled: boolean;
  webPushEnabled: boolean;
  criticalOnlyOnPush: boolean;
}

export interface SavedPushSubscription {
  id: string;
  endpoint: string;
  userAgent?: string | null;
  lastSeenAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface NotificationPushState {
  configured: boolean;
  vapidPublicKey?: string | null;
  subscriptionCount: number;
  subscriptions: SavedPushSubscription[];
}

// Notification type definition
export interface Notification {
  id: string;
  userId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: "admin" | "manager" | "player" | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  eventKey: string;
  title: string;
  titleAr?: string | null;
  message: string;
  messageAr?: string | null;
  type: "info" | "success" | "warning" | "error";
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
  link?: string;
  metadata?: Record<string, unknown> | null;
  deliverySummary?: NotificationDeliverySummary | null;
}

// Achievement type definition
export interface Achievement {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  icon: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
  unlockedAt?: string;
  xpReward: number;
}

// Analytics data type definition
export interface AnalyticsData {
  totalBookings: number;
  totalRevenue: number;
  totalCourts: number;
  totalUsers?: number;
  activeUsers?: number;
  occupancyRate?: number;
  bookingGrowth?: number;
  revenueGrowth?: number;
  userGrowth?: number;
  courtGrowth?: number;
  monthlyGrowth?: number;
  revenueByMonth?: { month: string; revenue: number; bookings?: number }[];
  monthlyBookings?: { month: string; bookings: number; revenue?: number }[];
  sportDistribution:
    | { sport: string; count: number; percentage: number }[]
    | { sport: string; value: number; color?: string }[];
  peakHours?: { hour: string; bookings: number }[];
  topCourts?: { id: string; name: string; bookings: number; revenue: number }[];
  topCities?: { city: string; bookings: number }[];
  recentActivity?: {
    type: string;
    title: string;
    description: string;
    time: string;
  }[];
}

// Testimonial type definition
export interface Testimonial {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  roleEn: string;
  content: string;
  contentEn: string;
  rating: number;
  image: string;
}

// Team member type definition
export interface TeamMember {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  roleEn: string;
  bio: string;
  bioEn: string;
  image: string;
  social: {
    linkedin?: string;
    twitter?: string;
    email?: string;
  };
  // Extended fields in mock data
  court?: string | null;
  email?: string;
  phone?: string;
  startDate?: string | Date;
  status?: "active" | "inactive" | string;
}

// Audit log type definition
export interface AuditLog {
  id: string;
  action: string;
  actionLabel: { ar: string; en: string } | string;
  userId: string;
  userName?: string;
  user?: string;
  userRole?: string;
  targetType: string;
  targetId: string;
  details?: string;
  detailsEn?: string;
  description?: string;
  timestamp: string | Date;
  ipAddress: string;
  status: "success" | "failed" | "warning";
  createdAt?: string | Date;
}

export interface TournamentCourtSummary {
  id: string;
  name?: string | null;
  nameEn?: string | null;
  city?: string | null;
  cityEn?: string | null;
  sportType?: string | null;
}

export interface TournamentTeam {
  id: string;
  tournamentId: string;
  teamName: string;
  captainUserId: string;
  captainName?: string | null;
  partnerName?: string | null;
  partnerPhone?: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  seed?: number | null;
  groupId?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface TournamentWaitlistEntry {
  id: string;
  tournamentId: string;
  captainUserId: string;
  captainName?: string | null;
  teamName: string;
  partnerName?: string | null;
  partnerPhone?: string | null;
  status: "waiting" | "promoted" | "withdrawn" | "removed";
  notes?: string | null;
  promotedTeamId?: string | null;
  position?: number | null;
  promotedAt?: string | Date | null;
  removedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  roundNumber: number;
  matchNumber: number;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  stage?: "group" | "knockout" | null;
  groupId?: string | null;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
  teamACheckedInAt?: string | Date | null;
  teamBCheckedInAt?: string | Date | null;
  scoreJson?: { teamA?: number[]; teamB?: number[]; resultType?: "standard" | "walkover" | "retired" } | null;
  closureId?: string | null;
  courtId?: string | null;
  courtName?: string | null;
  courtNameEn?: string | null;
  teamAId?: string | null;
  teamAName?: string | null;
  teamBId?: string | null;
  teamBName?: string | null;
  winnerTeamId?: string | null;
  winnerTeamName?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface TournamentActivity {
  id: string;
  tournamentId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: "admin" | "manager" | "player" | null;
  action: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
}

export interface TournamentDrawPreview {
  drawSeed: string;
  teamsPerGroup: number;
  groupsCount: number;
  knockoutTeams: number;
  byes: number;
  groups: Array<{
    groupId: string;
    teams: Array<{ id: string; teamName: string; captainName?: string | null; seed?: number | null }>;
  }>;
  rules: { qualifiersPerGroup: number; tieBreakers: string[] };
}

export interface Tournament {
  id: string;
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  managerId: string;
  managerName?: string | null;
  status: "draft" | "published" | "registration_open" | "registration_closed" | "in_progress" | "completed" | "cancelled";
  format: "single_elimination" | "group_stage_knockout";
  competitionPhase?: "setup" | "registration" | "draw_pending" | "group_stage" | "knockout_stage" | "final" | "completed" | "cancelled";
  teamSize: number;
  maxTeams: number;
  teamsPerGroup: number;
  entryFee?: number | null;
  registrationOpenAt?: string | Date | null;
  registrationCloseAt?: string | Date | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  rules?: string | null;
  coverImage?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  courts: TournamentCourtSummary[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  stats?: {
    totalTeams: number;
    approvedTeams: number;
    pendingTeams: number;
    waitlistCount?: number;
    totalMatches: number;
    completedMatches: number;
    activeRegistrations?: number;
  };
  winner?: { id: string; teamName: string } | null;
  waitlistEntries?: TournamentWaitlistEntry[];
  qualificationRules?: { qualifiersPerGroup: number; tieBreakers: string[] };
  scorePolicy?: { resultTypes: Array<"standard" | "walkover" | "retired">; description?: string };
  activities?: TournamentActivity[];
}
