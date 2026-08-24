import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD || "Demo1234!";
const ALLOW_PRODUCTION_SEED = String(process.env.ALLOW_PRODUCTION_SEED || "").toLowerCase() === "true";
const EXTRA_MANAGERS = Number(process.env.SEED_MANAGERS || 12);
const EXTRA_PLAYERS = Number(process.env.SEED_PLAYERS || 240);
const EXTRA_WALKIN_PLAYERS = Number(process.env.SEED_WALKIN_PLAYERS || 36);
const COURTS_PER_MANAGER = Number(process.env.SEED_COURTS_PER_MANAGER || 4);
const BOOKINGS_PER_COURT = Number(process.env.SEED_BOOKINGS_PER_COURT || 120);
const MANUAL_BOOKINGS_PER_COURT = Number(process.env.SEED_MANUAL_BOOKINGS_PER_COURT || 25);
const FAVORITES_PER_PLAYER = Number(process.env.SEED_FAVORITES_PER_PLAYER || 3);
const TOURNAMENT_MANAGER_EMAIL = process.env.SEED_TOURNAMENT_MANAGER_EMAIL || "manager@demo.com";

const SPORTS = ["padel", "football", "tennis", "basketball", "volleyball", "squash"];
const CITIES = [
  { ar: "القاهرة", en: "Cairo" },
  { ar: "الجيزة", en: "Giza" },
  { ar: "الإسكندرية", en: "Alexandria" },
  { ar: "المنصورة", en: "Mansoura" },
  { ar: "الساحل الشمالي", en: "North Coast" },
  { ar: "الزقازيق", en: "Zagazig" },
];

const SHARED_SEED_IMAGE = "/Hero.jpg";

const IMAGES_BY_SPORT = {
  padel: [SHARED_SEED_IMAGE],
  football: [SHARED_SEED_IMAGE],
  tennis: [SHARED_SEED_IMAGE],
  basketball: [SHARED_SEED_IMAGE],
  volleyball: [SHARED_SEED_IMAGE],
  squash: [SHARED_SEED_IMAGE],
};

const TOURNAMENT_IMAGE = SHARED_SEED_IMAGE;
const TEAM_NAME_PREFIXES = [
  "Falcons",
  "Titans",
  "Aces",
  "Strikers",
  "Smashers",
  "Royals",
  "Blazers",
  "Rockets",
  "Warriors",
  "Legends",
  "Comets",
  "Wolves",
  "Phoenix",
  "Panthers",
  "Storm",
  "Vipers",
  "Knights",
  "Spartans",
  "Giants",
  "Champions",
];
const TEAM_NAME_SUFFIXES = [
  "Cairo",
  "Giza",
  "Prime",
  "Elite",
  "Stars",
  "United",
  "Crew",
  "Masters",
  "Squad",
  "Club",
  "Doubles",
  "Force",
  "Line",
  "League",
  "Wave",
  "Point",
  "Pulse",
  "Drive",
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function addHours(date, hours) {
  return addMinutes(date, hours * 60);
}

function addDays(date, days) {
  return addMinutes(date, days * 1440);
}

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeStr(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPhone(i) {
  return `010${String(10000000 + i).slice(-8)}`;
}

function buildWalkInPhone(i) {
  return `011${String(20000000 + i).slice(-8)}`;
}

function buildWalkInEmail(phone, i) {
  return `guest_${phone}_seed_${i + 1}@walkin.local`;
}

function buildPartnerPhone(index) {
  return `012${String(30000000 + index).slice(-8)}`;
}

function timeToMinutes(value) {
  const [hh, mm] = String(value).split(":").map(Number);
  return hh * 60 + mm;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

function isPeakHour(time, peakStartStr = "18:00", peakEndStr = "06:00") {
  const slotMin = timeToMinutes(time);
  const startMin = timeToMinutes(peakStartStr);
  const endMin = timeToMinutes(peakEndStr);

  if (endMin < startMin) {
    return slotMin >= startMin || slotMin < endMin;
  }

  return slotMin >= startMin && slotMin < endMin;
}

function calculateBookingPrice(court, startDate, durationHours) {
  const peak = Number(court.peakPrice || court.offPeakPrice || 0);
  const offPeak = Number(court.offPeakPrice || peak || 0);
  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();

  let total = 0;
  for (let i = 0; i < durationHours; i += 1) {
    const slotTime = minutesToTime(startMinutes + i * 60);
    total += isPeakHour(slotTime) ? peak : offPeak;
  }
  return total;
}

function makeCourtData(manager, index) {
  const sport = SPORTS[index % SPORTS.length];
  const city = CITIES[index % CITIES.length];

  // 24h support: index % 4 === 0 will be 24h (00:00 to 00:00)
  const is24h = index % 4 === 0;

  // Special case for the "Count after-midnight hours" feature
  const isSpecialOvernight = index === 7 || index === 17;
  const isEarlyBird = index === 3 || index === 13;
  const isStandardOvernight = !is24h && !isSpecialOvernight && index % 5 === 0;

  let openTime, closeTime, useOpeningDayMode = false;

  if (is24h) {
    openTime = "00:00";
    closeTime = "00:00";
  } else if (isSpecialOvernight) {
    // Exactly the case requested by user: 08:00 -> 03:00 with Mode ON
    openTime = "08:00";
    closeTime = "03:00";
    useOpeningDayMode = true;
  } else if (isEarlyBird) {
    // Opens very early
    openTime = "05:00";
    closeTime = "23:00";
  } else if (isStandardOvernight) {
    // Normal overnight 16:00 -> 04:00
    openTime = "16:00";
    closeTime = "04:00";
    // Half of these have Mode ON
    useOpeningDayMode = index % 2 === 0;
  } else {
    // Regular day court
    openTime = index % 3 === 0 ? "06:00" : "08:00";
    closeTime = "23:00";
  }

  const offPeakPrice = 120 + (index % 8) * 20;
  const peakPrice = offPeakPrice + 60 + (index % 4) * 10;

  return {
    name: `${manager.businessName} - ${sport.toUpperCase()} ${index + 1}${is24h ? " (24H)" : ""}${useOpeningDayMode ? ' (Mode ON)' : ''}`,
    nameEn: `${manager.businessNameEn} - ${sport.toUpperCase()} ${index + 1}${is24h ? " (24H)" : ""}${useOpeningDayMode ? ' (Mode ON)' : ''}`,
    sportType: sport,
    city: city.ar,
    cityEn: city.en,
    address: `Street ${index + 1}, ${city.ar}`,
    addressEn: `Street ${index + 1}, ${city.en}`,
    location: `${city.ar} - Location ${index + 1}`,
    locationEn: `${city.en} - Location ${index + 1}`,
    openTime,
    closeTime,
    peakPrice,
    offPeakPrice,
    useOpeningDayForOvernightBookings: useOpeningDayMode,
    images: IMAGES_BY_SPORT[sport] || [SHARED_SEED_IMAGE],
    amenities: ["parking", "showers", sport === "football" ? "lights" : "cafe"],
    amenitiesEn: ["Parking", "Showers", sport === "football" ? "Lights" : "Cafe"],
    description: `ملعب ${sport} ممتاز للتجربة والاختبار. ${useOpeningDayMode ? 'يدعم حجز ساعات ما بعد منتصف الليل ضمن اليوم السابق.' : ''}`,
    descriptionEn: `Great ${sport} court for testing and demo data. ${useOpeningDayMode ? 'Supports after-midnight booking within the previous day.' : ''}`,
    rating: Number((3.8 + (index % 12) * 0.1).toFixed(1)),
    reviewCount: 8 + (index % 40),
    totalBookings: 0,
    maxPlayers: sport === "football" ? 14 : sport === "basketball" ? 10 : 4,
    managerId: manager.id,
  };
}

// ─── Demo manager overnight-mode courts ──────────────────────────────────────
// These 6 courts are created ONLY for the demo manager account so the manager
// dashboard shows every possible "Group late-night slots with previous day" case.
const DEMO_OVERNIGHT_COURT_SPECS = [
  {
    label: "Short Overnight",
    labelAr: "ليلي قصير",
    sport: "padel",
    openTime: "10:00",
    closeTime: "02:00",
    modeOn: true,
    offPeakPrice: 150,
    peakPrice: 230,
    city: CITIES[0],
    description: "Closes at 02:00 AM – 16h operating window. Mode ON: 23:00-02:00 slots belong to the opening day.",
    descriptionAr: "تغلق عند 02:00 ص – نافذة تشغيل 16 ساعة. الوضع مفعّل: فترات 23:00-02:00 تنتمي ليوم الافتتاح.",
  },
  {
    label: "Standard Overnight",
    labelAr: "ليلي قياسي",
    sport: "football",
    openTime: "08:00",
    closeTime: "03:00",
    modeOn: true,
    offPeakPrice: 200,
    peakPrice: 300,
    city: CITIES[1],
    description: "Opens 08:00, closes 03:00 AM next day. Classic overnight case with Mode ON enabled.",
    descriptionAr: "تفتح 08:00 وتغلق 03:00 ص اليوم التالي. الحالة الليلية الكلاسيكية مع تفعيل الوضع.",
  },
  {
    label: "Long Overnight",
    labelAr: "ليلي طويل",
    sport: "tennis",
    openTime: "14:00",
    closeTime: "04:00",
    modeOn: true,
    offPeakPrice: 120,
    peakPrice: 200,
    city: CITIES[2],
    description: "Opens at 14:00, closes 04:00 AM – 14h window. Tests deep after-midnight bookings (01:00-04:00).",
    descriptionAr: "تفتح 14:00 وتغلق 04:00 ص – نافذة 14 ساعة. تختبر الحجوزات العميقة بعد منتصف الليل.",
  },
  {
    label: "Late-Night Specialist",
    labelAr: "متخصص الليل المتأخر",
    sport: "basketball",
    openTime: "20:00",
    closeTime: "06:00",
    modeOn: true,
    offPeakPrice: 100,
    peakPrice: 160,
    city: CITIES[3],
    description: "Pure night court – opens 20:00, closes 06:00 AM. All bookings after midnight belong to the previous day.",
    descriptionAr: "ملعب ليلي بحت – يفتح 20:00 ويغلق 06:00 ص. جميع الحجوزات بعد منتصف الليل تنتمي لليوم السابق.",
  },
  {
    label: "Day + Overnight Combo",
    labelAr: "نهاري وليلي معاً",
    sport: "volleyball",
    openTime: "06:00",
    closeTime: "01:00",
    modeOn: true,
    offPeakPrice: 130,
    peakPrice: 190,
    city: CITIES[4],
    description: "Longest window: 06:00 to 01:00 AM (19h). Covers morning, peak evening and post-midnight in one day.",
    descriptionAr: "أطول نافذة: 06:00 إلى 01:00 ص (19 ساعة). يغطي الصباح وذروة المساء وما بعد منتصف الليل في يوم واحد.",
  },
  {
    label: "Mode ON – OFF Compare",
    labelAr: "مقارنة الوضع مفعّل/معطّل",
    sport: "squash",
    openTime: "16:00",
    closeTime: "02:00",
    modeOn: false,          // Mode OFF – same hours but Mode disabled, so managers can compare
    offPeakPrice: 110,
    peakPrice: 170,
    city: CITIES[5],
    description: "Same overnight hours (16:00-02:00) but Mode OFF. Use alongside the others to compare date grouping behaviour.",
    descriptionAr: "نفس الساعات الليلية (16:00-02:00) لكن الوضع معطّل. استخدمه بجانب الملاعب الأخرى لمقارنة تجميع التواريخ.",
  },
];

function makeDemoOvernightCourtData(manager, spec, slotIndex) {
  const modeTag = spec.modeOn ? " (Mode ON)" : " (Mode OFF)";
  return {
    name: `Demo - ${spec.labelAr} ${slotIndex + 1}${modeTag}`,
    nameEn: `Demo - ${spec.label} ${slotIndex + 1}${modeTag}`,
    sportType: spec.sport,
    city: spec.city.ar,
    cityEn: spec.city.en,
    address: `Demo Street ${slotIndex + 1}, ${spec.city.ar}`,
    addressEn: `Demo Street ${slotIndex + 1}, ${spec.city.en}`,
    location: `${spec.city.ar} – Demo Overnight Zone`,
    locationEn: `${spec.city.en} – Demo Overnight Zone`,
    openTime: spec.openTime,
    closeTime: spec.closeTime,
    peakPrice: spec.peakPrice,
    offPeakPrice: spec.offPeakPrice,
    useOpeningDayForOvernightBookings: spec.modeOn,
    images: IMAGES_BY_SPORT[spec.sport] || [SHARED_SEED_IMAGE],
    amenities: ["parking", "showers", "cafe"],
    amenitiesEn: ["Parking", "Showers", "Cafe"],
    description: spec.descriptionAr,
    descriptionEn: spec.description,
    rating: Number((4.0 + slotIndex * 0.1).toFixed(1)),
    reviewCount: 15 + slotIndex * 5,
    totalBookings: 0,
    maxPlayers: spec.sport === "football" ? 14 : spec.sport === "basketball" ? 10 : 4,
    managerId: manager.id,
  };
}

/**
 * Seed rich overnight-mode bookings for the demo manager's special courts.
 * Covers every scenario the demo manager needs to see:
 *  – confirmed early-morning (01:00-02:00) with date = previous operating day
 *  – midnight-crossing booking (23:00-01:00)
 *  – completed at deep early morning (02:00-04:00)
 *  – no_show at 01:00 AM yesterday
 *  – walk-in at 02:00 AM (cash, checked in)
 *  – live/upcoming (near now)
 *  – historical spread over -60 to +30 days
 *  – Mode OFF court with same hours for comparison
 */
async function seedDemoOvernightBookings({
  demoOvernightCourts,
  demoPlayer,
  registeredPlayers,
  walkInPlayers,
  now,
}) {
  const rows = [];

  for (let ci = 0; ci < demoOvernightCourts.length; ci++) {
    const court = demoOvernightCourts[ci];
    const isModeOn = court.useOpeningDayForOvernightBookings === true;

    // ── A. Pinned "showcase" bookings ──────────────────────────────────────

    // A1. Early-morning confirmed (tomorrow 01:00) – date = today (previous operating day) when Mode ON
    const earlyMorningTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 1, 0, 0);
    rows.push(buildBookingData(court, demoPlayer, earlyMorningTomorrow, 1, "confirmed", {
      date: isModeOn ? toDateStr(now) : toDateStr(earlyMorningTomorrow),
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A1: 01:00 AM tomorrow – date = ${isModeOn ? "today (prev operating day)" : "tomorrow (calendar day)"}`,
      paymentStatus: "paid",
    }));

    // A2. Midnight-crossing booking: starts tonight 23:00, ends 01:00 AM
    const midnightStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0);
    rows.push(buildBookingData(court, demoPlayer, midnightStart, 2, "confirmed", {
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A2: Midnight-crossing 23:00→01:00`,
      paymentStatus: "pending",
    }));

    // A3. Completed deep early morning yesterday (02:00 AM) – date = 2 days ago when Mode ON
    const deepEarlyYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 2, 0, 0);
    rows.push(buildBookingData(court, demoPlayer, deepEarlyYesterday, 1, "completed", {
      date: isModeOn ? toDateStr(addDays(deepEarlyYesterday, -1)) : toDateStr(deepEarlyYesterday),
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A3: Completed 02:00 AM today – assigned to ${isModeOn ? "yesterday" : "today"} operating day`,
      paymentStatus: "paid",
      checkedIn: true,
      checkInVerified: true,
    }));

    // A4. No-show at 01:00 AM yesterday
    const noShowYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 1, 0, 0);
    rows.push(buildBookingData(court, pick(registeredPlayers), noShowYesterday, 1, "no_show", {
      date: isModeOn ? toDateStr(addDays(noShowYesterday, -1)) : toDateStr(noShowYesterday),
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A4: No-show at 01:00 AM yesterday`,
      paymentStatus: "paid",
    }));

    // A5. Walk-in at 02:00 AM tomorrow (cash, checked in) – date = today when Mode ON
    const walkInTomorrow2am = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0);
    if (walkInPlayers.length > 0) {
      rows.push(buildBookingData(court, pick(walkInPlayers), walkInTomorrow2am, 1, "completed", {
        date: isModeOn ? toDateStr(now) : toDateStr(walkInTomorrow2am),
        notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A5: Walk-in cash at 02:00 AM – date = ${isModeOn ? "today" : "tomorrow"}`,
        paymentMethod: "cash",
        paymentStatus: "paid",
        checkedIn: true,
        checkInVerified: true,
      }));
    }

    // A6. Booking crossing midnight with 3-hour duration (22:00→01:00)
    const longMidnightStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0);
    rows.push(buildBookingData(court, pick(registeredPlayers), longMidnightStart, 3, "confirmed", {
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A6: 3-hour midnight-crossing 22:00→01:00`,
      paymentStatus: "pending",
    }));

    // A7. Cancelled overnight booking (late cancel)
    const cancelledStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 0, 0);
    rows.push(buildBookingData(court, pick(registeredPlayers), cancelledStart, 2, "cancelled", {
      date: isModeOn ? toDateStr(addDays(cancelledStart, 0)) : toDateStr(cancelledStart),
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Showcase A7: Cancelled 23:00 booking from 2 days ago`,
      paymentStatus: "refunded",
    }));

    // A8. Upcoming in 45 minutes (real-time dashboard)
    const upcomingNight = addMinutes(now, 45);
    rows.push(buildBookingData(court, pick(registeredPlayers), upcomingNight, 1, "confirmed", {
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Dashboard: Upcoming in 45 min`,
    }));

    // A9. Live right now – started 20 minutes ago
    const liveNow = addMinutes(now, -20);
    rows.push(buildBookingData(court, pick(registeredPlayers), liveNow, 1.5, "confirmed", {
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Dashboard: Live booking right now`,
      checkedIn: true,
      checkInVerified: true,
    }));

    // A10. Just finished 15 minutes ago
    const justFinished = addMinutes(now, -75);
    rows.push(buildBookingData(court, pick(registeredPlayers), justFinished, 1, "completed", {
      notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Dashboard: Just finished 15 min ago`,
      checkedIn: true,
      checkInVerified: true,
      paymentStatus: "paid",
    }));

    // A11. Continuous sequence of bookings for "Today" from 08:00 AM to 03:00 AM 
    // to strictly verify the sorting and filtering order for the manager.
    if (court.openTime === "08:00" && court.closeTime === "03:00") {
      const todayHours = [8, 12, 18, 21];
      const tomorrowHours = [0, 1, 2];
      
      for (const h of todayHours) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0);
        rows.push(buildBookingData(court, pick(registeredPlayers), d, 1, "confirmed", {
          notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Sequence: Today ${h}:00`,
        }));
      }
      for (const h of tomorrowHours) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, 0, 0);
        rows.push(buildBookingData(court, pick(registeredPlayers), d, 1, "confirmed", {
          date: isModeOn ? toDateStr(now) : toDateStr(d),
          notes: `[Mode ${isModeOn ? "ON" : "OFF"}] Sequence: Tomorrow 0${h}:00 AM (Late Night Tail)`,
        }));
      }
    }

  }

  return rows;
}

function buildBookingData(court, user, start, durationHours, status, opts = {}) {
  const end = addMinutes(start, durationHours * 60);
  const amount = calculateBookingPrice(court, start, durationHours);

  return {
    courtId: court.id,
    userId: user.id,
    date: opts.date || toDateStr(start),
    startTime: toTimeStr(start),
    endTime: toTimeStr(end),
    sessionOpenTime: court.openTime,
    sessionCloseTime: court.closeTime,
    useOpeningDayForOvernightBookings:
      opts.useOpeningDayForOvernightBookings ??
      (court.useOpeningDayForOvernightBookings === true),
    duration: durationHours,
    totalPrice: amount,
    amount,
    status,
    paymentStatus:
      (status === "confirmed" && court.allowOnlinePayment === true)
        ? "paid"
        : opts.paymentStatus ||
      (status === "completed" || status === "no_show" || opts.checkedIn
        ? "paid"
        : status === "cancelled"
        ? "refunded"
        : "pending"),
    paymentMethod:
      opts.paymentMethod ??
      (status === "confirmed" && court.allowOnlinePayment === true
        ? "card"
        : pick(["cash", "wallet", "card", null])),
    checkInCode: randomCode(),
    checkInVerified: Boolean(opts.checkInVerified),
    checkedIn: Boolean(opts.checkedIn),
    checkedInAt: opts.checkedIn ? addMinutes(start, randomInt(3, 10)) : null,
    notes: opts.notes || null,
  };
}

function pickStatusForSlot(statuses, start, durationHours, now) {
  const end = addMinutes(start, durationHours * 60);
  const openStatuses = statuses.filter(
    (status) => status === "pending" || status === "confirmed",
  );
  const closedStatuses = statuses.filter(
    (status) =>
      status === "completed" ||
      status === "cancelled" ||
      status === "no_show",
  );

  if (end <= now && closedStatuses.length > 0) {
    return pick(closedStatuses);
  }

  if (openStatuses.length > 0) {
    return pick(openStatuses);
  }

  return pick(statuses);
}

function buildTeamName(tournamentTitle, index) {
  const prefix = TEAM_NAME_PREFIXES[index % TEAM_NAME_PREFIXES.length];
  const suffix = TEAM_NAME_SUFFIXES[Math.floor(index / TEAM_NAME_PREFIXES.length) % TEAM_NAME_SUFFIXES.length];
  const shortTitle = tournamentTitle
    .replace(/\b(Cup|Open|Classic|League|Championship|Showcase|Masters|Clash|Challenge|Series)\b/gi, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");

  return `${prefix} ${shortTitle || "Team"} ${suffix}`.replace(/\s+/g, " ").trim();
}

function getTournamentBlueprints(now) {
  return [
    {
      key: "draft-hidden",
      title: "City Padel Draft Cup",
      titleAr: "كأس البادل التجريبي - مسودة",
      description: "Draft-only tournament seed to test hidden states before publishing.",
      descriptionAr: "بطولة مسودة لاختبار الحالات قبل النشر.",
      rules: "Draft mode only. Used to validate hidden tournament states and empty tabs.",
      status: "draft",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 250,
      registrationOpenAt: addDays(now, 5),
      registrationCloseAt: addDays(now, 10),
      startDate: addDays(now, 12),
      endDate: addDays(now, 13),
      assignedCourtCount: 2,
      teamSpecs: [],
      matchSpecs: [],
    },
    {
      key: "published-upcoming",
      title: "Summer Courts Challenger",
      titleAr: "تحدي الملاعب الصيفي",
      description: "Published tournament with future registration window.",
      descriptionAr: "بطولة منشورة مع نافذة تسجيل مستقبلية.",
      rules: "Registration opens automatically on the configured date.",
      status: "published",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 300,
      registrationOpenAt: addDays(now, 2),
      registrationCloseAt: addDays(now, 8),
      startDate: addDays(now, 10),
      endDate: addDays(now, 11),
      assignedCourtCount: 3,
      teamSpecs: [],
      matchSpecs: [],
    },
    {
      key: "open-mixed-statuses",
      title: "Weekend Padel Mixer",
      titleAr: "مهرجان البادل لعطلة الأسبوع",
      description: "Registration is open with pending, approved, rejected and withdrawn teams.",
      descriptionAr: "التسجيل مفتوح مع فرق معلقة ومقبولة ومرفوضة ومنسحبة.",
      rules: "Managers can review pending teams while the demo player sees their own pending entry.",
      status: "registration_open",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 200,
      registrationOpenAt: addDays(now, -2),
      registrationCloseAt: addDays(now, 4),
      startDate: addDays(now, 6),
      endDate: addDays(now, 7),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "pending", useDemoPlayer: true, notes: "Demo player application waiting for manager approval." },
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2 },
        { status: "pending", notes: "Pending phone verification from partner." },
        { status: "rejected", notes: "Rejected because the partner confirmation was missing." },
        { status: "withdrawn", notes: "Captain requested withdrawal before closing registration." },
      ],
      matchSpecs: [],
    },
    {
      key: "open-full-house",
      title: "Full House Padel Open",
      titleAr: "البطولة المفتوحة - اكتمال العدد",
      description: "Open registration but already full to test the full-capacity state.",
      descriptionAr: "التسجيل مفتوح لكن العدد اكتمل لاختبار حالة الامتلاء.",
      rules: "Exactly max active teams are already inside the tournament.",
      status: "registration_open",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 350,
      registrationOpenAt: addDays(now, -3),
      registrationCloseAt: addDays(now, 2),
      startDate: addDays(now, 5),
      endDate: addDays(now, 6),
      assignedCourtCount: 3,
      teamSpecs: [
        { status: "approved", seed: 1, useDemoPlayer: true },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
        { status: "pending" },
        { status: "pending" },
        { status: "approved", seed: 5 },
        { status: "approved", seed: 6 },
        { status: "rejected", notes: "Rejected after full bracket capacity was reached." },
        { status: "withdrawn", notes: "Withdrew after confirming another tournament." },
      ],
      matchSpecs: [],
    },
    {
      key: "open-free-entry",
      title: "Community Free Entry Classic",
      titleAr: "كلاسيك المجتمع - بدون رسوم",
      description: "Free tournament to verify zero-fee rendering and small registrations.",
      descriptionAr: "بطولة مجانية لاختبار عرض الرسوم الصفرية والتسجيلات القليلة.",
      rules: "Free entry community event. Good for testing empty winner and light team counts.",
      status: "registration_open",
      maxTeams: 4,
      teamsPerGroup: 4,
      entryFee: null,
      registrationOpenAt: addDays(now, -1),
      registrationCloseAt: addDays(now, 6),
      startDate: addDays(now, 9),
      endDate: addDays(now, 9),
      assignedCourtCount: 1,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "pending" },
        { status: "pending", notes: "Needs manager review before approval." },
      ],
      matchSpecs: [],
    },
    {
      key: "closed-no-bracket",
      title: "Manager Review Cup",
      titleAr: "كأس مراجعة المدير",
      description: "Registration is closed before the bracket has been generated.",
      descriptionAr: "تم إغلاق التسجيل قبل إنشاء الشجرة.",
      rules: "Useful for validating closed-registration messages with zero matches.",
      status: "registration_closed",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 275,
      registrationOpenAt: addDays(now, -10),
      registrationCloseAt: addDays(now, -2),
      startDate: addDays(now, 2),
      endDate: addDays(now, 3),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
        { status: "pending", notes: "Late pending entry left for review history." },
        { status: "rejected", notes: "Rejected by staff after duplicate submission." },
      ],
      matchSpecs: [],
    },
    {
      key: "closed-bracket-ready",
      title: "Knockout Bracket Showcase",
      titleAr: "عرض الشجرة الإقصائية",
      description: "Bracket generated with TBD later rounds and no scheduled matches yet.",
      descriptionAr: "تم إنشاء الشجرة مع أدوار لاحقة غير مكتملة وبدون جدولة بعد.",
      rules: "Good for bracket rendering with multiple rounds and TBD slots.",
      status: "registration_closed",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 320,
      registrationOpenAt: addDays(now, -12),
      registrationCloseAt: addDays(now, -4),
      startDate: addDays(now, 1),
      endDate: addDays(now, 2),
      assignedCourtCount: 3,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
        { status: "approved", seed: 5 },
        { status: "approved", seed: 6 },
        { status: "approved", seed: 7 },
        { status: "approved", seed: 8 },
      ],
      matchSpecs: [
        { stage: "knockout", roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 7, status: "pending" },
        { stage: "knockout", roundNumber: 1, matchNumber: 2, teamA: 3, teamB: 4, status: "pending" },
        { stage: "knockout", roundNumber: 1, matchNumber: 3, teamA: 1, teamB: 6, status: "pending" },
        { stage: "knockout", roundNumber: 1, matchNumber: 4, teamA: 2, teamB: 5, status: "pending" },
        { stage: "knockout", roundNumber: 2, matchNumber: 1, status: "pending" },
        { stage: "knockout", roundNumber: 2, matchNumber: 2, status: "pending" },
        { stage: "knockout", roundNumber: 3, matchNumber: 1, status: "pending" },
      ],
    },
    {
      key: "in-progress-live",
      title: "Live Finals Arena",
      titleAr: "ساحة النهائيات المباشرة",
      description: "Live tournament with completed, scheduled and pending rounds together.",
      descriptionAr: "بطولة جارية فيها مباريات مكتملة ومجدولة ومعلقة معًا.",
      rules: "Includes a scheduled match that already ended so the UI can record a result.",
      status: "in_progress",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 400,
      registrationOpenAt: addDays(now, -14),
      registrationCloseAt: addDays(now, -7),
      startDate: addDays(now, -1),
      endDate: addDays(now, 1),
      assignedCourtCount: 3,
      teamSpecs: [
        { status: "approved", seed: 1, useDemoPlayer: true },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
        { status: "approved", seed: 5 },
        { status: "approved", seed: 6 },
        { status: "approved", seed: 7 },
        { status: "approved", seed: 8 },
      ],
      matchSpecs: [
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 7, winner: 0, status: "completed",
          courtIndex: 0, startAt: addHours(now, -22), endAt: addHours(now, -20.5),
          scoreJson: { teamA: [6, 6], teamB: [2, 4] },
        },
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 2, teamA: 3, teamB: 4, winner: 3, status: "completed",
          courtIndex: 1, startAt: addHours(now, -20), endAt: addHours(now, -18.5),
          scoreJson: { teamA: [7, 6], teamB: [5, 4] },
        },
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 3, teamA: 1, teamB: 6, winner: 1, status: "completed",
          courtIndex: 2, startAt: addHours(now, -18), endAt: addHours(now, -16.5),
          scoreJson: { teamA: [6, 4, 6], teamB: [3, 6, 3] },
        },
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 4, teamA: 2, teamB: 5, winner: 2, status: "completed",
          courtIndex: 0, startAt: addHours(now, -16), endAt: addHours(now, -14.5),
          scoreJson: { teamA: [6, 6], teamB: [4, 1] },
        },
        {
          stage: "knockout",
          roundNumber: 2, matchNumber: 1, teamA: 0, teamB: 3, winner: 0, status: "completed",
          courtIndex: 1, startAt: addHours(now, -12), endAt: addHours(now, -10.5),
          scoreJson: { teamA: [6, 7], teamB: [4, 5] },
        },
        {
          stage: "knockout",
          roundNumber: 2, matchNumber: 2, teamA: 1, teamB: 2, status: "scheduled",
          courtIndex: 2, startAt: addHours(now, -3), endAt: addHours(now, -1.5),
          createClosure: true,
        },
        {
          stage: "knockout",
          roundNumber: 3, matchNumber: 1, teamA: 0, status: "pending",
        },
      ],
    },
    {
      key: "in-progress-upcoming",
      title: "Today Match Ladder",
      titleAr: "سلم مباريات اليوم",
      description: "In-progress tournament with future scheduled matches and protected closures.",
      descriptionAr: "بطولة جارية مع مباريات مستقبلية وجدولة محمية بالإغلاقات.",
      rules: "Useful for schedule buttons and court closure manager previews.",
      status: "in_progress",
      maxTeams: 4,
      teamsPerGroup: 4,
      entryFee: 180,
      registrationOpenAt: addDays(now, -9),
      registrationCloseAt: addDays(now, -3),
      startDate: addHours(now, -1),
      endDate: addDays(now, 1),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
      ],
      matchSpecs: [
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 3, status: "scheduled",
          courtIndex: 0, startAt: addHours(now, 4), endAt: addHours(now, 5.5),
          createClosure: true,
        },
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 2, teamA: 1, teamB: 2, status: "scheduled",
          courtIndex: 1, startAt: addHours(now, 6), endAt: addHours(now, 7.5),
          createClosure: true,
        },
        { stage: "knockout", roundNumber: 2, matchNumber: 1, status: "pending" },
      ],
    },
    {
      key: "completed-championship",
      title: "Champions Weekend Finals",
      titleAr: "نهائيات الأبطال الأسبوعية",
      description: "Finished tournament with a confirmed winner and complete score history.",
      descriptionAr: "بطولة منتهية مع فائز مؤكد وتاريخ نتائج كامل.",
      rules: "Use this to verify winner badges and fully completed brackets.",
      status: "completed",
      maxTeams: 4,
      teamsPerGroup: 4,
      entryFee: 500,
      registrationOpenAt: addDays(now, -20),
      registrationCloseAt: addDays(now, -15),
      startDate: addDays(now, -12),
      endDate: addDays(now, -11),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2, useDemoPlayer: true },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
      ],
      matchSpecs: [
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 3, winner: 0, status: "completed",
          courtIndex: 0, startAt: addDays(now, -12), endAt: addHours(addDays(now, -12), 1.5),
          scoreJson: { teamA: [6, 6], teamB: [1, 3] },
        },
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 2, teamA: 1, teamB: 2, winner: 1, status: "completed",
          courtIndex: 1, startAt: addHours(addDays(now, -12), 2), endAt: addHours(addDays(now, -12), 3.5),
          scoreJson: { teamA: [6, 7], teamB: [4, 5] },
        },
        {
          stage: "knockout",
          roundNumber: 2, matchNumber: 1, teamA: 0, teamB: 1, winner: 1, status: "completed",
          courtIndex: 0, startAt: addDays(now, -11), endAt: addHours(addDays(now, -11), 1.5),
          scoreJson: { teamA: [4, 6, 5], teamB: [6, 4, 7] },
        },
      ],
    },
    {
      key: "open-empty-no-teams",
      title: "Empty Registration Sandbox",
      titleAr: "Empty Registration Sandbox",
      description: "Registration is open with zero teams to test empty team, empty bracket and public CTA UI.",
      descriptionAr: "Registration is open with zero teams to test empty team, empty bracket and public CTA UI.",
      rules: "No teams have registered yet.",
      status: "registration_open",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 150,
      registrationOpenAt: addDays(now, -1),
      registrationCloseAt: addDays(now, 7),
      startDate: addDays(now, 12),
      endDate: addDays(now, 13),
      assignedCourtCount: 2,
      teamSpecs: [],
      matchSpecs: [],
    },
    {
      key: "open-pending-review-queue",
      title: "Pending Review Queue Cup",
      titleAr: "Pending Review Queue Cup",
      description: "Only pending applications, for manager approve/reject UI.",
      descriptionAr: "Only pending applications, for manager approve/reject UI.",
      rules: "Every entry is pending manager review.",
      status: "registration_open",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 225,
      registrationOpenAt: addDays(now, -3),
      registrationCloseAt: addDays(now, 5),
      startDate: addDays(now, 8),
      endDate: addDays(now, 9),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "pending", useDemoPlayer: true, notes: "Demo player pending approval." },
        { status: "pending", notes: "Waiting for partner phone confirmation." },
        { status: "pending", notes: "Needs manager approval." },
        { status: "pending", notes: "Pending payment confirmation." },
      ],
      matchSpecs: [],
    },
    {
      key: "open-no-courts-assigned",
      title: "No Courts Assigned Cup",
      titleAr: "No Courts Assigned Cup",
      description: "No courts assigned, to test scheduling warnings and empty courts UI.",
      descriptionAr: "No courts assigned, to test scheduling warnings and empty courts UI.",
      rules: "Assign courts before scheduling matches.",
      status: "registration_open",
      maxTeams: 4,
      teamsPerGroup: 4,
      entryFee: 175,
      registrationOpenAt: addDays(now, -2),
      registrationCloseAt: addDays(now, 4),
      startDate: addDays(now, 7),
      endDate: addDays(now, 7),
      assignedCourtCount: 0,
      teamSpecs: [
        { status: "approved", seed: 1, useDemoPlayer: true },
        { status: "approved", seed: 2 },
      ],
      matchSpecs: [],
    },
    {
      key: "closed-two-team-final",
      title: "Two Team Final Test",
      titleAr: "Two Team Final Test",
      description: "Smallest possible bracket with two approved teams and one pending final.",
      descriptionAr: "Smallest possible bracket with two approved teams and one pending final.",
      rules: "Single final only.",
      status: "registration_closed",
      maxTeams: 2,
      teamsPerGroup: 2,
      entryFee: 100,
      registrationOpenAt: addDays(now, -8),
      registrationCloseAt: addDays(now, -1),
      startDate: addDays(now, 1),
      endDate: addDays(now, 1),
      assignedCourtCount: 1,
      teamSpecs: [
        { status: "approved", seed: 1, useDemoPlayer: true },
        { status: "approved", seed: 2 },
      ],
      matchSpecs: [
        { stage: "knockout", roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 1, status: "pending" },
      ],
    },
    {
      key: "live-match-ready-to-score",
      title: "Ready To Score Match",
      titleAr: "Ready To Score Match",
      description: "A scheduled match already ended, useful for record-result buttons.",
      descriptionAr: "A scheduled match already ended, useful for record-result buttons.",
      rules: "Past scheduled match should be ready for score entry.",
      status: "in_progress",
      maxTeams: 4,
      teamsPerGroup: 4,
      entryFee: 250,
      registrationOpenAt: addDays(now, -11),
      registrationCloseAt: addDays(now, -4),
      startDate: addDays(now, -1),
      endDate: addDays(now, 1),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "approved", seed: 1, useDemoPlayer: true },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
      ],
      matchSpecs: [
        { stage: "knockout", roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 3, status: "scheduled", courtIndex: 0, startAt: addHours(now, -4), endAt: addHours(now, -2.5), createClosure: true },
        { stage: "knockout", roundNumber: 1, matchNumber: 2, teamA: 1, teamB: 2, status: "scheduled", courtIndex: 1, startAt: addHours(now, 3), endAt: addHours(now, 4.5), createClosure: true },
        { stage: "knockout", roundNumber: 2, matchNumber: 1, status: "pending" },
      ],
    },
    {
      key: "live-with-cancelled-match",
      title: "Interrupted Match Cup",
      titleAr: "Interrupted Match Cup",
      description: "In-progress bracket containing completed, cancelled and pending matches.",
      descriptionAr: "In-progress bracket containing completed, cancelled and pending matches.",
      rules: "Cancelled match remains visible in bracket history.",
      status: "in_progress",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 260,
      registrationOpenAt: addDays(now, -15),
      registrationCloseAt: addDays(now, -8),
      startDate: addDays(now, -2),
      endDate: addDays(now, 2),
      assignedCourtCount: 3,
      teamSpecs: [
        { status: "approved", seed: 1, useDemoPlayer: true },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
        { status: "approved", seed: 5 },
        { status: "approved", seed: 6 },
        { status: "approved", seed: 7 },
        { status: "approved", seed: 8 },
      ],
      matchSpecs: [
        { stage: "knockout", roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 7, winner: 0, status: "completed", scoreJson: { teamA: [6, 6], teamB: [3, 4] }, courtIndex: 0, startAt: addHours(now, -20), endAt: addHours(now, -18.5) },
        { stage: "knockout", roundNumber: 1, matchNumber: 2, teamA: 3, teamB: 4, status: "cancelled", courtIndex: 1, startAt: addHours(now, -18), endAt: addHours(now, -16.5) },
        { stage: "knockout", roundNumber: 1, matchNumber: 3, teamA: 1, teamB: 6, status: "pending" },
        { stage: "knockout", roundNumber: 1, matchNumber: 4, teamA: 2, teamB: 5, status: "pending" },
        { stage: "knockout", roundNumber: 2, matchNumber: 1, teamA: 0, status: "pending" },
        { stage: "knockout", roundNumber: 2, matchNumber: 2, status: "pending" },
        { stage: "knockout", roundNumber: 3, matchNumber: 1, status: "pending" },
      ],
    },
    {
      key: "completed-free-mini-cup",
      title: "Free Mini Cup Winner",
      titleAr: "Free Mini Cup Winner",
      description: "Free completed tournament for zero-fee champion UI.",
      descriptionAr: "Free completed tournament for zero-fee champion UI.",
      rules: "Free event with completed final and champion visible.",
      status: "completed",
      maxTeams: 2,
      teamsPerGroup: 2,
      entryFee: null,
      registrationOpenAt: addDays(now, -18),
      registrationCloseAt: addDays(now, -12),
      startDate: addDays(now, -10),
      endDate: addDays(now, -10),
      assignedCourtCount: 1,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2, useDemoPlayer: true },
      ],
      matchSpecs: [
        { stage: "knockout", roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 1, winner: 1, status: "completed", courtIndex: 0, startAt: addDays(now, -10), endAt: addHours(addDays(now, -10), 1.5), scoreJson: { teamA: [4, 6, 5], teamB: [6, 4, 7] } },
      ],
    },
    {
      key: "cancelled-registration",
      title: "Storm Cancelled Cup",
      titleAr: "كأس الإلغاء المفاجئ",
      description: "Cancelled tournament after collecting several registrations.",
      descriptionAr: "بطولة أُلغيت بعد استقبال عدة تسجيلات.",
      rules: "Useful for cancelled-state rendering with teams but no matches.",
      status: "cancelled",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 225,
      registrationOpenAt: addDays(now, -6),
      registrationCloseAt: addDays(now, 1),
      startDate: addDays(now, 3),
      endDate: addDays(now, 4),
      assignedCourtCount: 2,
      teamSpecs: [
        { status: "approved" },
        { status: "approved" },
        { status: "pending" },
        { status: "rejected", notes: "Rejected before cancellation due to duplicate account." },
        { status: "withdrawn", useDemoPlayer: true, notes: "Demo player withdrew before the tournament was cancelled." },
      ],
      matchSpecs: [],
    },
    {
      key: "cancelled-with-bracket",
      title: "Bracketed Cancelled Masters",
      titleAr: "الماسترز الملغاة بعد الشجرة",
      description: "Cancelled tournament after bracket generation with cancelled matches.",
      descriptionAr: "بطولة أُلغيت بعد إنشاء الشجرة مع مباريات ملغاة.",
      rules: "Validates cancelled tournaments that still carry historical bracket data.",
      status: "cancelled",
      maxTeams: 8,
      teamsPerGroup: 4,
      entryFee: 290,
      registrationOpenAt: addDays(now, -18),
      registrationCloseAt: addDays(now, -10),
      startDate: addDays(now, -2),
      endDate: addDays(now, 1),
      assignedCourtCount: 3,
      teamSpecs: [
        { status: "approved", seed: 1 },
        { status: "approved", seed: 2 },
        { status: "approved", seed: 3 },
        { status: "approved", seed: 4 },
        { status: "approved", seed: 5 },
        { status: "approved", seed: 6 },
        { status: "approved", seed: 7 },
        { status: "approved", seed: 8 },
      ],
      matchSpecs: [
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 1, teamA: 0, teamB: 7, status: "cancelled",
          courtIndex: 0, startAt: addHours(now, -6), endAt: addHours(now, -4.5),
        },
        {
          stage: "knockout",
          roundNumber: 1, matchNumber: 2, teamA: 3, teamB: 4, status: "cancelled",
          courtIndex: 1, startAt: addHours(now, -5), endAt: addHours(now, -3.5),
        },
        { stage: "knockout", roundNumber: 1, matchNumber: 3, teamA: 1, teamB: 6, status: "pending" },
        { stage: "knockout", roundNumber: 1, matchNumber: 4, teamA: 2, teamB: 5, status: "pending" },
        { stage: "knockout", roundNumber: 2, matchNumber: 1, status: "pending" },
        { stage: "knockout", roundNumber: 2, matchNumber: 2, status: "pending" },
        { stage: "knockout", roundNumber: 3, matchNumber: 1, status: "pending" },
      ],
    },
  ];
}

// ─── helpers for group-stage blueprints ──────────────────────────────────────
function groupSpec(g, round, match, tA, tB, winner, status, scoreJson, startOffset, endOffset, now) {
  return {
    stage: "group", groupId: g, roundNumber: round, matchNumber: match,
    teamA: tA, teamB: tB, winner, status, scoreJson,
    ...(startOffset != null ? { startAt: addHours(now, startOffset), endAt: addHours(now, endOffset) } : {}),
  };
}

/**
 * Build the 6 round-robin match specs for a group of 4 teams.
 * Teams are referenced by their index in the blueprint.teamSpecs array.
 * Round-robin schedule (Berger): (0v3,1v2) (0v1,3v2) (0v2,1v3)
 */
function groupOf4Specs(g, t0, t1, t2, t3, results, baseMatch, now) {
  // results: array of 6 entries, each { winner, score, startOff, endOff }
  // match order: r1m1=t0vt3, r1m2=t1vt2, r2m3=t0vt1, r2m4=t3vt2, r3m5=t0vt2, r3m6=t1vt3
  const pairs = [
    [t0, t3], [t1, t2],
    [t0, t1], [t3, t2],
    [t0, t2], [t1, t3],
  ];
  return pairs.map(([tA, tB], i) => {
    const r = results[i] || {};
    return groupSpec(
      g,
      Math.floor(i / 2) + 1,
      baseMatch + i,
      tA, tB,
      r.winner ?? null,
      r.winner !== undefined ? "completed" : "pending",
      r.score || null,
      r.startOff ?? null,
      r.endOff ?? null,
      now,
    );
  });
}

function getTournamentGroupBlueprints(now) {
  // ── 16-team / 4-groups-of-4 World Cup format ─────────────────────────────
  // Groups A-D, each has 4 teams. Top 2 from each group advance to QF.
  // teamSpecs indices:
  //   A: 0,1,2,3  |  B: 4,5,6,7  |  C: 8,9,10,11  |  D: 12,13,14,15
  return [
    {
      key: "group-stage-live",
      title: "Mal3abk Cup – Group Stage",
      titleAr: "كأس ملاعبك – مرحلة المجموعات",
      description: "16-team cup: 4 groups of 4 in full round-robin. Top 2 from each group advance. Groups A & B partially played; C & D not started.",
      descriptionAr: "16 فريق في 4 مجموعات، كل مجموعة تلعب دور ذهاب وإياب كامل. أفضل فريقين من كل مجموعة يتأهلان.",
      rules: "Top 2 from each group advance to the quarter-finals. Tie-breaker: wins → PTS → game difference → games won → seed.",
      status: "in_progress",
      maxTeams: 16,
      teamsPerGroup: 4,
      entryFee: 400,
      registrationOpenAt: addDays(now, -25),
      registrationCloseAt: addDays(now, -14),
      startDate: addDays(now, -3),
      endDate: addDays(now, 6),
      assignedCourtCount: 4,
      teamSpecs: [
        // Group A
        { status: "approved", seed: 1,  groupId: "A" },
        { status: "approved", seed: 2,  groupId: "A", useDemoPlayer: true },
        { status: "approved", seed: 3,  groupId: "A" },
        { status: "approved", seed: 4,  groupId: "A" },
        // Group B
        { status: "approved", seed: 5,  groupId: "B" },
        { status: "approved", seed: 6,  groupId: "B" },
        { status: "approved", seed: 7,  groupId: "B" },
        { status: "approved", seed: 8,  groupId: "B" },
        // Group C
        { status: "approved", seed: 9,  groupId: "C" },
        { status: "approved", seed: 10, groupId: "C" },
        { status: "approved", seed: 11, groupId: "C" },
        { status: "approved", seed: 12, groupId: "C" },
        // Group D
        { status: "approved", seed: 13, groupId: "D" },
        { status: "approved", seed: 14, groupId: "D" },
        { status: "approved", seed: 15, groupId: "D" },
        { status: "approved", seed: 16, groupId: "D" },
      ],
      matchSpecs: [
        // ── Group A (Berger: r1=0v3,1v2 | r2=0v1,3v2 | r3=0v2,1v3) ───────
        groupSpec("A",1, 1, 0,3, 0,"completed",{teamA:[6,7],teamB:[4,5]}, -50,-48.5, now),
        groupSpec("A",1, 2, 1,2, 1,"completed",{teamA:[6,6],teamB:[2,3]}, -50,-48.5, now),
        groupSpec("A",2, 3, 0,1, 0,"completed",{teamA:[7,6],teamB:[5,4]}, -26,-24.5, now),
        groupSpec("A",2, 4, 3,2, 2,"completed",{teamA:[3,4],teamB:[6,7]}, -26,-24.5, now),
        groupSpec("A",3, 5, 0,2, null,"pending",null, null,null, now),
        groupSpec("A",3, 6, 1,3, null,"pending",null, null,null, now),
        // ── Group B (r1=4v7,5v6 | r2=4v5,7v6 | r3=4v6,5v7) ───────────
        groupSpec("B",1, 7, 4,7, 4,"completed",{teamA:[6,6],teamB:[3,4]}, -49,-47.5, now),
        groupSpec("B",1, 8, 5,6, 5,"completed",{teamA:[7,6],teamB:[5,4]}, -49,-47.5, now),
        groupSpec("B",2, 9, 4,5, null,"pending",null, null,null, now),
        groupSpec("B",2,10, 7,6, null,"pending",null, null,null, now),
        groupSpec("B",3,11, 4,6, null,"pending",null, null,null, now),
        groupSpec("B",3,12, 5,7, null,"pending",null, null,null, now),
        // ── Group C – all pending ─────────────────────────────────
        groupSpec("C",1,13,  8,11, null,"pending",null, null,null, now),
        groupSpec("C",1,14,  9,10, null,"pending",null, null,null, now),
        groupSpec("C",2,15,  8, 9, null,"pending",null, null,null, now),
        groupSpec("C",2,16, 11,10, null,"pending",null, null,null, now),
        groupSpec("C",3,17,  8,10, null,"pending",null, null,null, now),
        groupSpec("C",3,18,  9,11, null,"pending",null, null,null, now),
        // ── Group D – all pending ─────────────────────────────────
        groupSpec("D",1,19, 12,15, null,"pending",null, null,null, now),
        groupSpec("D",1,20, 13,14, null,"pending",null, null,null, now),
        groupSpec("D",2,21, 12,13, null,"pending",null, null,null, now),
        groupSpec("D",2,22, 15,14, null,"pending",null, null,null, now),
        groupSpec("D",3,23, 12,14, null,"pending",null, null,null, now),
        groupSpec("D",3,24, 13,15, null,"pending",null, null,null, now),
      ],
    },
    {
      key: "group-stage-completed",
      title: "Mal3abk Champions Cup – Completed",
      titleAr: "كأس أبطال ملاعبك – مكتملة",
      description: "16-team World Cup style tournament completed. Full group stage plus knockout rounds with a confirmed champion.",
      descriptionAr: "بطولة 16 فريق على طراز كأس العالم منتهية. مرحلة مجموعات كاملة مع أدوار إقصائية وبطل مؤكد.",
      rules: "Top 2 from each group advanced to quarter-finals. Tie-breaker: wins → PTS → game difference → games won.",
      status: "completed",
      maxTeams: 16,
      teamsPerGroup: 4,
      entryFee: 500,
      registrationOpenAt: addDays(now, -55),
      registrationCloseAt: addDays(now, -45),
      startDate: addDays(now, -40),
      endDate: addDays(now, -28),
      assignedCourtCount: 3,
      teamSpecs: [
        { status: "approved", seed: 1,  groupId: "A" },
        { status: "approved", seed: 2,  groupId: "A" },
        { status: "approved", seed: 3,  groupId: "A" },
        { status: "approved", seed: 4,  groupId: "A" },
        { status: "approved", seed: 5,  groupId: "B" },
        { status: "approved", seed: 6,  groupId: "B" },
        { status: "approved", seed: 7,  groupId: "B" },
        { status: "approved", seed: 8,  groupId: "B" },
        { status: "approved", seed: 9,  groupId: "C" },
        { status: "approved", seed: 10, groupId: "C" },
        { status: "approved", seed: 11, groupId: "C" },
        { status: "approved", seed: 12, groupId: "C" },
        { status: "approved", seed: 13, groupId: "D", useDemoPlayer: true },
        { status: "approved", seed: 14, groupId: "D" },
        { status: "approved", seed: 15, groupId: "D" },
        { status: "approved", seed: 16, groupId: "D" },
      ],
      matchSpecs: [
        // ── Group A: t0,t1 qualify ───────────────────────────────────
        groupSpec("A",1, 1, 0,3, 0,"completed",{teamA:[6,6],teamB:[3,2]}, -960,-958.5, now),
        groupSpec("A",1, 2, 1,2, 1,"completed",{teamA:[6,6],teamB:[4,3]}, -958,-956.5, now),
        groupSpec("A",2, 3, 0,1, 0,"completed",{teamA:[7,6],teamB:[5,4]}, -936,-934.5, now),
        groupSpec("A",2, 4, 3,2, 2,"completed",{teamA:[3,6],teamB:[6,3]}, -934,-932.5, now),
        groupSpec("A",3, 5, 0,2, 0,"completed",{teamA:[6,4,6],teamB:[4,6,3]}, -912,-910.5, now),
        groupSpec("A",3, 6, 1,3, 1,"completed",{teamA:[6,6],teamB:[2,1]}, -910,-908.5, now),
        // ── Group B: t4,t5 qualify ───────────────────────────────────
        groupSpec("B",1, 7, 4,7, 4,"completed",{teamA:[6,6],teamB:[4,3]}, -959,-957.5, now),
        groupSpec("B",1, 8, 5,6, 5,"completed",{teamA:[7,6],teamB:[5,4]}, -957,-955.5, now),
        groupSpec("B",2, 9, 4,5, 4,"completed",{teamA:[6,4,6],teamB:[4,6,4]}, -935,-933.5, now),
        groupSpec("B",2,10, 7,6, 6,"completed",{teamA:[4,5],teamB:[6,7]}, -933,-931.5, now),
        groupSpec("B",3,11, 4,6, 4,"completed",{teamA:[6,6],teamB:[3,2]}, -911,-909.5, now),
        groupSpec("B",3,12, 5,7, 5,"completed",{teamA:[6,6],teamB:[1,2]}, -909,-907.5, now),
        // ── Group C: t8,t9 qualify ──────────────────────────────────
        groupSpec("C",1,13,  8,11, 8,"completed",{teamA:[6,6],teamB:[2,3]}, -961,-959.5, now),
        groupSpec("C",1,14,  9,10, 9,"completed",{teamA:[6,6],teamB:[3,4]}, -959,-957.5, now),
        groupSpec("C",2,15,  8, 9, 8,"completed",{teamA:[6,7],teamB:[4,5]}, -937,-935.5, now),
        groupSpec("C",2,16, 11,10,10,"completed",{teamA:[4,5],teamB:[6,7]}, -935,-933.5, now),
        groupSpec("C",3,17,  8,10, 8,"completed",{teamA:[6,6],teamB:[1,3]}, -913,-911.5, now),
        groupSpec("C",3,18,  9,11, 9,"completed",{teamA:[6,6],teamB:[2,1]}, -911,-909.5, now),
        // ── Group D: t12,t13 qualify ────────────────────────────────
        groupSpec("D",1,19, 12,15,12,"completed",{teamA:[6,6],teamB:[3,4]}, -962,-960.5, now),
        groupSpec("D",1,20, 13,14,13,"completed",{teamA:[6,6],teamB:[4,3]}, -960,-958.5, now),
        groupSpec("D",2,21, 12,13,12,"completed",{teamA:[6,4,6],teamB:[4,6,4]}, -938,-936.5, now),
        groupSpec("D",2,22, 15,14,14,"completed",{teamA:[4,6],teamB:[6,4]}, -936,-934.5, now),
        groupSpec("D",3,23, 12,14,12,"completed",{teamA:[6,6],teamB:[2,3]}, -914,-912.5, now),
        groupSpec("D",3,24, 13,15,13,"completed",{teamA:[6,6],teamB:[1,3]}, -912,-910.5, now),
        // ── Quarter-finals (cup pairing: A1vD2, D1vA2, B1vC2, C1vB2) ──
        { stage:"knockout",roundNumber:1,matchNumber:25,teamA:0, teamB:13,winner:0, status:"completed",scoreJson:{teamA:[6,6],teamB:[3,4]},startAt:addDays(now,-34),endAt:addHours(addDays(now,-34),1.5) },
        { stage:"knockout",roundNumber:1,matchNumber:26,teamA:12,teamB:1, winner:12,status:"completed",scoreJson:{teamA:[6,7],teamB:[4,5]},startAt:addHours(addDays(now,-34),2),endAt:addHours(addDays(now,-34),3.5) },
        { stage:"knockout",roundNumber:1,matchNumber:27,teamA:4, teamB:9, winner:4, status:"completed",scoreJson:{teamA:[6,4,7],teamB:[4,6,5]},startAt:addHours(addDays(now,-34),4),endAt:addHours(addDays(now,-34),5.5) },
        { stage:"knockout",roundNumber:1,matchNumber:28,teamA:8, teamB:5, winner:8, status:"completed",scoreJson:{teamA:[7,6],teamB:[5,4]},startAt:addHours(addDays(now,-34),6),endAt:addHours(addDays(now,-34),7.5) },
        // ── Semi-finals ─────────────────────────────────────────────
        { stage:"knockout",roundNumber:2,matchNumber:29,teamA:0, teamB:12,winner:0, status:"completed",scoreJson:{teamA:[6,6],teamB:[4,3]},startAt:addDays(now,-31),endAt:addHours(addDays(now,-31),1.5) },
        { stage:"knockout",roundNumber:2,matchNumber:30,teamA:4, teamB:8, winner:4, status:"completed",scoreJson:{teamA:[6,4,6],teamB:[4,6,4]},startAt:addHours(addDays(now,-31),2),endAt:addHours(addDays(now,-31),3.5) },
        // ── Final ──────────────────────────────────────────────────
        { stage:"knockout",roundNumber:3,matchNumber:31,teamA:0, teamB:4, winner:0, status:"completed",scoreJson:{teamA:[7,6,6],teamB:[5,4,4]},startAt:addDays(now,-28),endAt:addHours(addDays(now,-28),2) },
      ],
    },
  ];
}

async function seedTournaments({ managers, courts, registeredPlayers, now }) {
  console.log("Creating tournaments...");

  const demoPlayer = registeredPlayers[0];
  if (!demoPlayer) {
    throw new Error("Seed requires at least one registered player to create tournament teams.");
  }

  const managerCourts = managers.reduce((acc, manager) => {
    acc[manager.id] = courts.filter((court) => court.managerId === manager.id);
    return acc;
  }, {});

  const blueprints = [...getTournamentBlueprints(now), ...getTournamentGroupBlueprints(now)];
  const tournamentManager = managers.find((manager) => manager.email === TOURNAMENT_MANAGER_EMAIL) || managers[0];
  const counters = {
    tournaments: 0,
    teams: 0,
    matches: 0,
    closures: 0,
    tournamentCourts: 0,
  };

  let captainCursor = 1;
  let teamNameCursor = 0;

  const nextCaptain = (usedCaptainIds, options = {}) => {
    if (options.useDemoPlayer && !usedCaptainIds.has(demoPlayer.id)) {
      usedCaptainIds.add(demoPlayer.id);
      return demoPlayer;
    }

    for (let i = 0; i < registeredPlayers.length * 2; i += 1) {
      const player = registeredPlayers[captainCursor % registeredPlayers.length];
      captainCursor += 1;
      if (!usedCaptainIds.has(player.id)) {
        usedCaptainIds.add(player.id);
        return player;
      }
    }

    const fallback = registeredPlayers.find((player) => !usedCaptainIds.has(player.id));
    if (!fallback) {
      throw new Error("Ran out of unique captains while creating tournament teams.");
    }
    usedCaptainIds.add(fallback.id);
    return fallback;
  };

  for (let i = 0; i < blueprints.length; i += 1) {
    const blueprint = blueprints[i];
    const manager = tournamentManager;
    const managerCourtPool = managerCourts[manager.id] || [];
    const assignedCourts = (managerCourtPool.length ? managerCourtPool : courts).slice(
      0,
      Math.min(blueprint.assignedCourtCount ?? 2, managerCourtPool.length || courts.length),
    );

    // Use a transaction for each tournament to ensure all related records are created together
    await prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          title: blueprint.title,
          titleAr: blueprint.titleAr,
          description: blueprint.description,
          descriptionAr: blueprint.descriptionAr,
          managerId: manager.id,
          status: blueprint.status,
          format: "group_stage_knockout",
          teamSize: 2,
          maxTeams: blueprint.maxTeams,
          teamsPerGroup: blueprint.teamsPerGroup ?? 4,
          entryFee: blueprint.entryFee,
          registrationOpenAt: blueprint.registrationOpenAt,
          registrationCloseAt: blueprint.registrationCloseAt,
          startDate: blueprint.startDate,
          endDate: blueprint.endDate,
          rules: blueprint.rules,
          coverImage: TOURNAMENT_IMAGE,
        },
      });
      counters.tournaments += 1;

      if (assignedCourts.length > 0) {
        await tx.tournamentCourt.createMany({
          data: assignedCourts.map((court) => ({
            tournamentId: tournament.id,
            courtId: court.id,
          })),
        });
        counters.tournamentCourts += assignedCourts.length;
      }

      const usedCaptainIds = new Set();
      const teamRecords = [];

      for (let teamIndex = 0; teamIndex < blueprint.teamSpecs.length; teamIndex += 1) {
        const spec = blueprint.teamSpecs[teamIndex];
        const captain = nextCaptain(usedCaptainIds, spec);
        const teamName = spec.teamName || buildTeamName(blueprint.title, teamNameCursor + teamIndex);
        const team = await tx.tournamentTeam.create({
          data: {
            tournamentId: tournament.id,
            teamName,
            captainUserId: captain.id,
            partnerName: spec.partnerName || `Partner ${teamNameCursor + teamIndex + 1}`,
            partnerPhone: spec.partnerPhone || buildPartnerPhone(teamNameCursor + teamIndex + 1),
            status: spec.status,
            seed: spec.seed ?? null,
            groupId: spec.groupId || null,
            notes: spec.notes || null,
          },
        });
        teamRecords.push(team);
        counters.teams += 1;
      }

      for (const matchSpec of blueprint.matchSpecs) {
        let closureId = null;
        const court = Number.isInteger(matchSpec.courtIndex) ? assignedCourts[matchSpec.courtIndex] || null : null;
        const shouldCreateClosure = Boolean(matchSpec.createClosure && court && matchSpec.startAt && matchSpec.endAt);

        if (shouldCreateClosure) {
          const closure = await tx.courtClosure.create({
            data: {
              courtId: court.id,
              startDate: matchSpec.startAt,
              endDate: matchSpec.endAt,
              reason: `Tournament reservation - ${blueprint.title} - Round ${matchSpec.roundNumber} Match ${matchSpec.matchNumber}`,
            },
          });
          closureId = closure.id;
          counters.closures += 1;
        }

        await tx.tournamentMatch.create({
          data: {
            tournamentId: tournament.id,
            roundNumber: matchSpec.roundNumber,
            matchNumber: matchSpec.matchNumber,
            stage: matchSpec.stage || null,
            groupId: matchSpec.groupId || null,
            teamAId: Number.isInteger(matchSpec.teamA) ? teamRecords[matchSpec.teamA]?.id || null : null,
            teamBId: Number.isInteger(matchSpec.teamB) ? teamRecords[matchSpec.teamB]?.id || null : null,
            winnerTeamId: Number.isInteger(matchSpec.winner) ? teamRecords[matchSpec.winner]?.id || null : null,
            courtId: court?.id || null,
            startAt: matchSpec.startAt || null,
            endAt: matchSpec.endAt || null,
            status: matchSpec.status,
            scoreJson: matchSpec.scoreJson || null,
            closureId,
          },
        });
        counters.matches += 1;
      }
    });
    teamNameCursor += blueprint.teamSpecs.length;
  }

  console.log(`Created ${counters.tournaments} tournaments for ${tournamentManager.email}.`);
  return counters;
}

async function main() {
  if (process.env.NODE_ENV === "production" && !ALLOW_PRODUCTION_SEED) {
    throw new Error(
      "Refusing to run prisma/seed.js in production without ALLOW_PRODUCTION_SEED=true.",
    );
  }

  console.log("Clearing existing data...");

  await prisma.favorite.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.tournamentMatch.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.tournamentCourt.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.courtClosure.deleteMany();
  await prisma.court.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 12);

  console.log("Creating base accounts...");
  await prisma.user.create({
    data: {
      name: "Demo Admin",
      email: "admin@demo.com",
      password: hashedPassword,
      role: "admin",
    },
  });

  await prisma.user.create({
    data: {
      name: "Demo Manager",
      email: "manager@demo.com",
      password: hashedPassword,
      role: "manager",
      businessName: "Demo Sports Hub",
      businessNameEn: "Demo Sports Hub",
      description: "حساب مدير للاختبار",
      descriptionEn: "Manager test account",
    },
  });

  await prisma.user.create({
    data: {
      name: "Demo Player",
      email: "player@demo.com",
      phone: "01000000001",
      password: hashedPassword,
      role: "player",
    },
  });

  console.log("Creating extra users...");
  const managerData = Array.from({ length: EXTRA_MANAGERS }, (_, i) => ({
    name: `Manager ${i + 1}`,
    email: `manager${i + 1}@demo.com`,
    password: hashedPassword,
    role: "manager",
    businessName: `Arena ${i + 1}`,
    businessNameEn: `Arena ${i + 1}`,
    description: `مدير رقم ${i + 1}`,
    descriptionEn: `Seeded manager ${i + 1}`,
  }));

  const playerData = Array.from({ length: EXTRA_PLAYERS }, (_, i) => ({
    name: `Player ${i + 1}`,
    email: `player${i + 1}@demo.com`,
    phone: buildPhone(i + 2),
    password: hashedPassword,
    role: "player",
  }));

  const walkInPlayerData = Array.from({ length: EXTRA_WALKIN_PLAYERS }, (_, i) => {
    const phone = buildWalkInPhone(i + 1);
    return {
      name: `Walk-in Guest ${i + 1}`,
      email: buildWalkInEmail(phone, i),
      phone,
      password: hashedPassword,
      role: "player",
    };
  });

  if (managerData.length) {
    await prisma.user.createMany({ data: managerData });
  }

  if (playerData.length) {
    await prisma.user.createMany({ data: playerData });
  }

  if (walkInPlayerData.length) {
    await prisma.user.createMany({ data: walkInPlayerData });
  }

  const managers = await prisma.user.findMany({
    where: { role: "manager" },
    orderBy: { createdAt: "asc" },
  });

  const registeredPlayers = await prisma.user.findMany({
    where: {
      role: "player",
      NOT: {
        email: {
          endsWith: "@walkin.local",
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const walkInPlayers = await prisma.user.findMany({
    where: {
      role: "player",
      email: {
        endsWith: "@walkin.local",
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!registeredPlayers.length) {
    throw new Error("Seed requires at least one registered player. Increase SEED_PLAYERS or leave it at the default.");
  }

  console.log("Creating courts...");
  const courts = [];
  let globalCourtIndex = 0;

  const demoPlayer = registeredPlayers.find(p => p.email === "player@demo.com");
  const demoManager = managers.find(m => m.email === "manager@demo.com");

  for (const manager of managers) {
    for (let i = 0; i < COURTS_PER_MANAGER; i += 1) {
      const courtData = makeCourtData(manager, globalCourtIndex);
      const createdCourt = await prisma.court.create({ data: courtData });
      courts.push(createdCourt);
      globalCourtIndex += 1;
    }
  }

  // Create dedicated overnight-mode courts for the demo manager
  const demoOvernightCourts = [];
  if (demoManager) {
    console.log("Creating demo overnight-mode courts for demo manager...");
    for (let si = 0; si < DEMO_OVERNIGHT_COURT_SPECS.length; si++) {
      const spec = DEMO_OVERNIGHT_COURT_SPECS[si];
      const courtData = makeDemoOvernightCourtData(demoManager, spec, si);
      const createdCourt = await prisma.court.create({ data: courtData });
      demoOvernightCourts.push(createdCourt);
      courts.push(createdCourt);
    }
    console.log(`Created ${demoOvernightCourts.length} demo overnight-mode courts.`);
  }

  console.log(`Created ${courts.length} courts total.`);

  if (!courts.length) {
    throw new Error("No courts were created. Aborting seed.");
  }

  console.log("Creating favorites...");
  const favoriteRows = [];

  const demoManagerCourts = courts.filter(c => c.managerId === demoManager?.id);

  // Ensure Demo Player favorites ALL Demo Manager courts
  if (demoPlayer && demoManagerCourts.length > 0) {
    for (const court of demoManagerCourts) {
      favoriteRows.push({
        userId: demoPlayer.id,
        courtId: court.id,
      });
    }
  }

  for (const player of registeredPlayers.slice(0, Math.min(registeredPlayers.length, 120))) {
    const used = new Set();

    for (let i = 0; i < Math.min(FAVORITES_PER_PLAYER, courts.length); i += 1) {
      let idx = randomInt(0, courts.length - 1);
      while (used.has(idx)) idx = randomInt(0, courts.length - 1);
      used.add(idx);

      favoriteRows.push({
        userId: player.id,
        courtId: courts[idx].id,
      });
    }
  }

  if (favoriteRows.length) {
    await prisma.favorite.createMany({
      data: favoriteRows,
      skipDuplicates: true,
    });
  }

  console.log("Creating closures...");
  const now = new Date();

  const closures = courts.slice(0, Math.min(8, courts.length)).map((court, i) => ({
    courtId: court.id,
    startDate: addMinutes(now, (i + 1) * 1440),
    endDate: addMinutes(now, (i + 1) * 1440 + 180),
    reason: `Scheduled maintenance ${i + 1}`,
  }));

  if (closures.length) {
    await prisma.courtClosure.createMany({ data: closures });
  }

  const tournamentCounters = await seedTournaments({
    managers,
    courts,
    registeredPlayers,
    now,
  });

  console.log("Creating bookings...");

  // Seed rich overnight-mode bookings for demo overnight courts first
  if (demoOvernightCourts.length > 0) {
    console.log("Creating demo overnight-mode bookings...");
    const overnightBookingRows = await seedDemoOvernightBookings({
      demoOvernightCourts,
      demoPlayer,
      registeredPlayers,
      walkInPlayers,
      now,
    });
    const validCourtIdsEarly = new Set(courts.map((c) => String(c.id)));
    const invalidOvernightBookings = overnightBookingRows.filter((b) => !validCourtIdsEarly.has(String(b.courtId)));
    if (invalidOvernightBookings.length > 0) {
      throw new Error(`Found ${invalidOvernightBookings.length} invalid overnight booking courtIds.`);
    }
    for (let i = 0; i < overnightBookingRows.length; i += 500) {
      await prisma.booking.createMany({ data: overnightBookingRows.slice(i, i + 500) });
    }
    // Update totalBookings for demo overnight courts
    const overnightCounts = overnightBookingRows.reduce((acc, b) => {
      const k = String(b.courtId); acc[k] = (acc[k] || 0) + 1; return acc;
    }, {});
    for (const court of demoOvernightCourts) {
      await prisma.court.update({
        where: { id: court.id },
        data: { totalBookings: overnightCounts[String(court.id)] || 0 },
      });
    }
    console.log(`Created ${overnightBookingRows.length} demo overnight-mode bookings.`);
  }

  const statuses = ["pending", "confirmed", "completed", "cancelled", "no_show"];
  const manualStatuses = ["confirmed", "completed", "cancelled", "no_show"];
  const bookingRows = [];

  for (let cIdx = 0; cIdx < courts.length; cIdx += 1) {
    const court = courts[cIdx];
    const isModeOn = court.useOpeningDayForOvernightBookings === true;
    const isDemoManagerCourt = court.managerId === demoManager?.id;

    // 1. Create specific test cases for the "Operating Day" feature
    if (isModeOn) {
      const targetPlayer = isDemoManagerCourt ? demoPlayer : pick(registeredPlayers);
      // Create a booking for tomorrow at 01:00 AM. With opening-day mode ON,
      // the stored snapshot preserves that it belongs to the previous operating day.
      const earlyMorningStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 1, 0, 0);
      bookingRows.push(buildBookingData(court, targetPlayer, earlyMorningStart, 1, "confirmed", {
        date: toDateStr(addDays(earlyMorningStart, -1)),
        notes: "Feature Test: 01:00 AM booking belonging to previous operating day"
      }));

      // Create a missed booking from yesterday early morning
      const missedEarlyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 1, 0, 0);
      bookingRows.push(buildBookingData(court, targetPlayer, missedEarlyStart, 1, "no_show", {
        date: toDateStr(addDays(missedEarlyStart, -1)),
        notes: "Feature Test: Missed 01:00 AM booking from yesterday logical day"
      }));

      // Create a booking crossing midnight: 23:00 to 01:00
      const midnightCrossStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0);
      bookingRows.push(buildBookingData(court, targetPlayer, midnightCrossStart, 2, "confirmed", {
        notes: "Feature Test: Midnight-crossing booking (23:00-01:00)"
      }));

      // Add a Walk-in for the "Mode ON" case
      const walkInEarlyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0);
      bookingRows.push(buildBookingData(court, pick(walkInPlayers), walkInEarlyStart, 1, "completed", {
        date: toDateStr(addDays(walkInEarlyStart, -1)),
        notes: "Feature Test: Walk-in at 02:00 AM for previous operating day",
        paymentMethod: "cash",
        paymentStatus: "paid",
        checkedIn: true,
        checkInVerified: true
      }));
    }

    // 2. Create some "Live" bookings for right now to test dashboard
    // Upcoming shortly
    const upcomingStart = addMinutes(now, 15);
    bookingRows.push(buildBookingData(court, pick(registeredPlayers), upcomingStart, 1, "confirmed", {
      notes: "Dashboard Test: Upcoming booking in 15 mins"
    }));

    // Started 30 mins ago
    const liveStart = addMinutes(now, -30);
    bookingRows.push(buildBookingData(court, pick(registeredPlayers), liveStart, 1.5, "confirmed", {
      notes: "Dashboard Test: Live booking happening right now",
      checkedIn: true,
      checkInVerified: true
    }));

    // Just ended 10 mins ago
    const endedStart = addMinutes(now, -70);
    bookingRows.push(buildBookingData(court, pick(registeredPlayers), endedStart, 1, "completed", {
      notes: "Dashboard Test: Recently ended booking",
      checkedIn: true,
      checkInVerified: true
    }));

    // 3. Specific bookings for Demo Player on Demo Manager courts
    if (isDemoManagerCourt && demoPlayer) {
      for (let i = 0; i < 40; i++) {
        const dayOffset = randomInt(-60, 30);
        const startHour = pick([8, 10, 12, 14, 16, 18, 20, 22, 23, 0, 1, 2]);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, startHour, 0, 0, 0);
        const durationHours = pick([1, 1, 2]);
        const status = pickStatusForSlot(statuses, start, durationHours, now);

        const opts = {
          notes: "Demo Player Specific Booking"
        };
        if (status === "completed") {
          Object.assign(opts, { paymentStatus: "paid", checkedIn: true, checkInVerified: true });
        } else if (status === "confirmed") {
          Object.assign(opts, { paymentStatus: pick(["paid", "pending"]) });
        }

        bookingRows.push(buildBookingData(court, demoPlayer, start, durationHours, status, opts));
      }
    }

    // Clean sequential realistic schedule instead of random scattering
    const basePeakHours = [18, 20, 22];
    if (court.openTime <= "08:00") basePeakHours.unshift(10, 16);
    if (isModeOn && court.closeTime >= "02:00") basePeakHours.push(0, 1);

    let generalBookingsCreated = 0;
    for (let dayOffset = -30; dayOffset <= 30; dayOffset++) {
      if (generalBookingsCreated >= BOOKINGS_PER_COURT) break;
      if (Math.random() > 0.8) continue; // Skip a few random days to keep the calendar organic

      for (const startHour of basePeakHours) {
        if (generalBookingsCreated >= BOOKINGS_PER_COURT) break;
        
        const user = pick(registeredPlayers);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, startHour, 0, 0, 0);
        
        // Perfectly spaced durations to guarantee absolutely 0 overlap
        const durationHours = (startHour >= 18 && startHour !== 0 && startHour !== 1) ? 2 : 1;
        const status = pickStatusForSlot(statuses, start, durationHours, now);
        const opts = {};

        if (status === "completed") {
          Object.assign(opts, { paymentStatus: "paid", checkedIn: true, checkInVerified: true });
        } else if (status === "confirmed") {
          Object.assign(opts, { paymentStatus: pick(["paid", "pending"]) });
        } else if (status === "cancelled") {
          Object.assign(opts, { paymentStatus: "refunded" });
        }

        bookingRows.push(buildBookingData(court, user, start, durationHours, status, opts));
        generalBookingsCreated++;
      }
    }

    let manualBookingsCreated = 0;
    for (let dayOffset = -21; dayOffset <= 21; dayOffset++) {
      if (manualBookingsCreated >= MANUAL_BOOKINGS_PER_COURT) break;
      if (Math.random() > 0.4) continue;
      
      const startHour = pick([12, 14]);
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, startHour, 0, 0, 0);
      
      const useRegisteredCustomer = registeredPlayers.length > 0 && (walkInPlayers.length === 0 || Math.random() > 0.3);
      const user = useRegisteredCustomer ? pick(registeredPlayers) : pick(walkInPlayers);
      
      const durationHours = 1;
      const status = pickStatusForSlot(manualStatuses, start, durationHours, now);
      const opts = {
        notes: useRegisteredCustomer
          ? `Registered customer: ${user.name} | Phone: ${user.phone || "N/A"}`
          : `Walk-in: ${user.name} | Phone: ${user.phone || "N/A"}`,
        paymentMethod: "cash",
        paymentStatus: status === "cancelled" ? "refunded" : "paid",
      };

      if (status === "completed") {
        Object.assign(opts, { checkedIn: true, checkInVerified: true });
      }

      bookingRows.push(buildBookingData(court, user, start, durationHours, status, opts));
      manualBookingsCreated++;
    }
  }

  const validCourtIds = new Set(courts.map((c) => String(c.id)));
  const invalidBookings = bookingRows.filter((b) => !validCourtIds.has(String(b.courtId)));

  if (invalidBookings.length > 0) {
    console.log("Invalid bookings sample:", invalidBookings.slice(0, 5));
    throw new Error(`Found ${invalidBookings.length} bookings with invalid courtId.`);
  }

  for (let i = 0; i < bookingRows.length; i += 500) {
    await prisma.booking.createMany({
      data: bookingRows.slice(i, i + 500),
    });
  }

  const bookingCounts = bookingRows.reduce((acc, booking) => {
    const key = String(booking.courtId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  for (const court of courts) {
    await prisma.court.update({
      where: { id: court.id },
      data: { totalBookings: bookingCounts[String(court.id)] || 0 },
    });
  }

  console.log("\nSeed complete.");
  console.log("Admins: 1");
  console.log(`Managers: ${managers.length}`);
  console.log(`Registered Players: ${registeredPlayers.length}`);
  console.log(`Walk-in Players: ${walkInPlayers.length}`);
  console.log(`Players Total: ${registeredPlayers.length + walkInPlayers.length}`);
  console.log(`Courts: ${courts.length} (includes ${demoOvernightCourts.length} demo overnight-mode courts)`);
  console.log(`Bookings: ${bookingRows.length} (+ demo overnight-mode bookings seeded separately)`);
  console.log(`Favorites: ${favoriteRows.length}`);
  console.log(`Tournaments: ${tournamentCounters.tournaments}`);
  console.log(`Tournament Courts: ${tournamentCounters.tournamentCourts}`);
  console.log(`Tournament Teams: ${tournamentCounters.teams}`);
  console.log(`Tournament Matches: ${tournamentCounters.matches}`);
  console.log(`Tournament Closures: ${tournamentCounters.closures}`);
  if (demoOvernightCourts.length > 0) {
    console.log("\nDemo overnight-mode courts created for manager@demo.com:");
    DEMO_OVERNIGHT_COURT_SPECS.forEach((spec, i) => {
      console.log(`  [${i + 1}] ${spec.label} | ${spec.openTime}→${spec.closeTime} | Mode ${spec.modeOn ? "ON" : "OFF"}`);
    });
  }

  console.log("\nLogin accounts:");
  console.log(`Admin   -> admin@demo.com / ${SEED_PASSWORD}`);
  console.log(`Manager -> manager@demo.com / ${SEED_PASSWORD}`);
  console.log(`Player  -> player@demo.com / ${SEED_PASSWORD}`);

  console.log("\nYou can increase or decrease the amount using these env vars before seeding:");
  console.log(
    "SEED_MANAGERS, SEED_PLAYERS, SEED_WALKIN_PLAYERS, SEED_COURTS_PER_MANAGER, SEED_BOOKINGS_PER_COURT, SEED_MANUAL_BOOKINGS_PER_COURT, SEED_FAVORITES_PER_PLAYER, SEED_PASSWORD",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
