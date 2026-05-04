const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const CURRENCY = (process.env.CURRENCY || "cad").toLowerCase();
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET || process.env.STRIPE_SECRET_KEY || "thompson-family-security-admin";
const ADMIN_COOKIE_NAME = "tfs_admin_session";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const PRICE_KEYS = {
  bookingDeposit: "STRIPE_PRICE_BOOKING_DEPOSIT",
  sameWeekInstall: "STRIPE_PRICE_SAME_WEEK_INSTALL",
  extendedSupport: "STRIPE_PRICE_EXTENDED_SUPPORT",
  doorbellUpgrade: "STRIPE_PRICE_DOORBELL_UPGRADE",
  floodlightUpgrade: "STRIPE_PRICE_FLOODLIGHT_UPGRADE",
  smartDisplay: "STRIPE_PRICE_SMART_DISPLAY",
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

ensureDataStore();

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const lines = envContent.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key]) {
      return;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, "[]\n", "utf8");
  }
}

function readBookings() {
  ensureDataStore();
  const raw = fs.readFileSync(BOOKINGS_FILE, "utf8");
  return JSON.parse(raw || "[]");
}

function writeBookings(bookings) {
  ensureDataStore();
  fs.writeFileSync(BOOKINGS_FILE, `${JSON.stringify(bookings, null, 2)}\n`, "utf8");
}

function upsertBooking(booking) {
  const bookings = readBookings();
  const existingIndex = bookings.findIndex(
    (item) =>
      (booking.quoteId && item.quoteId === booking.quoteId) ||
      (booking.checkoutSessionId && item.checkoutSessionId === booking.checkoutSessionId) ||
      (booking.paymentIntentId && item.paymentIntentId === booking.paymentIntentId)
  );

  if (existingIndex >= 0) {
    bookings[existingIndex] = {
      ...bookings[existingIndex],
      ...booking,
      updatedAt: new Date().toISOString(),
    };
  } else {
    bookings.unshift({
      ...booking,
      createdAt: booking.createdAt || new Date().toISOString(),
      updatedAt: booking.updatedAt || new Date().toISOString(),
    });
  }

  writeBookings(bookings);
  return bookings;
}

function findBookingIndex(bookings, references = {}) {
  return bookings.findIndex((item) => {
    if (references.sessionId && item.checkoutSessionId === references.sessionId) {
      return true;
    }

    if (references.paymentIntentId && item.paymentIntentId === references.paymentIntentId) {
      return true;
    }

    if (references.quoteId && item.quoteId === references.quoteId) {
      return true;
    }

    return false;
  });
}

function updateBookingByReferences(references, updater) {
  const bookings = readBookings();
  const index = findBookingIndex(bookings, references);

  if (index === -1) {
    return null;
  }

  bookings[index] = {
    ...bookings[index],
    ...updater(bookings[index]),
    updatedAt: new Date().toISOString(),
  };

  writeBookings(bookings);
  return bookings[index];
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function serveMapsConfig(response) {
  const browserKey = process.env.GOOGLE_MAPS_API_KEY || "";
  const content = `window.TFS_CONFIG = window.TFS_CONFIG || { googleMapsApiKey: ${JSON.stringify(browserKey)} };\n`;

  response.writeHead(200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(content);
}

function readRawRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLength = 0;

    request.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      totalLength += buffer.length;

      if (totalLength > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    request.on("error", reject);
  });
}

async function readRequestBody(request) {
  const rawBody = await readRawRequestBody(request);
  const body = rawBody.toString("utf8");

  try {
    return body ? JSON.parse(body) : {};
  } catch (error) {
    throw new Error("Invalid JSON payload.");
  }
}

function parseCookies(request) {
  const header = request.headers.cookie || "";

  return header.split(";").reduce((cookies, pair) => {
    const trimmed = pair.trim();

    if (!trimmed) {
      return cookies;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      return cookies;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getAdminCookieSettings(request) {
  const secure =
    request.headers["x-forwarded-proto"] === "https" ||
    String(process.env.APP_BASE_URL || "").startsWith("https://");
  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearAdminSession(response, request) {
  response.setHeader("Set-Cookie", getAdminCookieSettings(request));
}

function createAdminSessionCookie(request) {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${ADMIN_USERNAME}|${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(payload, "utf8")
    .digest("hex");
  const value = Buffer.from(`${payload}|${signature}`, "utf8").toString("base64url");
  const secure =
    request.headers["x-forwarded-proto"] === "https" ||
    String(process.env.APP_BASE_URL || "").startsWith("https://");
  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function isAdminAuthenticated(request) {
  if (!ADMIN_PASSWORD) {
    return false;
  }

  const cookies = parseCookies(request);
  const rawValue = cookies[ADMIN_COOKIE_NAME];

  if (!rawValue) {
    return false;
  }

  try {
    const decoded = Buffer.from(rawValue, "base64url").toString("utf8");
    const [username, expiresAt, signature] = decoded.split("|");

    if (!username || !expiresAt || !signature) {
      return false;
    }

    if (username !== ADMIN_USERNAME || Number(expiresAt) < Date.now()) {
      return false;
    }

    const payload = `${username}|${expiresAt}`;
    const expectedSignature = crypto
      .createHmac("sha256", ADMIN_SESSION_SECRET)
      .update(payload, "utf8")
      .digest("hex");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    return (
      expectedBuffer.length === signatureBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
    );
  } catch (error) {
    return false;
  }
}

function requireAdminAuth(request, response, { api = false } = {}) {
  if (isAdminAuthenticated(request)) {
    return true;
  }

  if (api) {
    sendJson(response, 401, { error: "Admin sign-in required." });
    return false;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  response.writeHead(302, {
    Location: `/admin-login.html?next=${encodeURIComponent(requestUrl.pathname)}`,
  });
  response.end();
  return false;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function renderAdminLoginPage({ error = "", next = "/admin.html" } = {}) {
  const errorMarkup = error
    ? `<p class="helper-text admin-login-error" role="alert">${escapeHtml(error)}</p>`
    : `<p class="helper-text">Enter your admin credentials to view bookings.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Sign In | Thompson Family Security</title>
    <meta name="theme-color" content="#102033" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;500;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div class="page-shell success-shell">
      <main class="success-main">
        <section class="success-grid">
          <article class="builder-card success-card admin-login-card">
            <p class="section-kicker">Internal Admin</p>
            <h2>Sign in to view bookings.</h2>
            ${errorMarkup}
            <form class="field-grid" method="post" action="/admin/login">
              <input type="hidden" name="next" value="${escapeHtml(next)}" />
              <label class="field">
                <span>Username</span>
                <input name="username" type="text" autocomplete="username" required />
              </label>
              <label class="field">
                <span>Password</span>
                <input name="password" type="password" autocomplete="current-password" required />
              </label>
              <div class="builder-actions">
                <button class="button button-primary" type="submit">Sign In</button>
                <a class="button button-secondary" href="/">Back To Site</a>
              </div>
            </form>
          </article>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

function readFormBody(request) {
  return readRawRequestBody(request).then((rawBody) =>
    Object.fromEntries(new URLSearchParams(rawBody.toString("utf8")))
  );
}

function isSafeAdminNextPath(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

async function handleAdminLogin(request, response) {
  if (!ADMIN_PASSWORD) {
    sendHtml(
      response,
      500,
      renderAdminLoginPage({
        error: "Admin credentials are not configured on the server yet.",
      })
    );
    return;
  }

  let formData;

  try {
    formData = await readFormBody(request);
  } catch (error) {
    sendHtml(response, 400, renderAdminLoginPage({ error: "Unable to read sign-in form." }));
    return;
  }

  const username = String(formData.username || "").trim();
  const password = String(formData.password || "");
  const next = isSafeAdminNextPath(formData.next) ? formData.next : "/admin.html";

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    sendHtml(
      response,
      401,
      renderAdminLoginPage({
        error: "Incorrect username or password.",
        next,
      })
    );
    return;
  }

  response.writeHead(302, {
    Location: next,
    "Set-Cookie": createAdminSessionCookie(request),
  });
  response.end();
}

function handleAdminLogout(request, response) {
  response.writeHead(302, {
    Location: "/admin-login.html",
    "Set-Cookie": getAdminCookieSettings(request),
  });
  response.end();
}

function getBaseUrl(request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }

  const host = request.headers.host || `localhost:${PORT}`;
  return `http://${host}`;
}

function buildMetadata(payload) {
  return {
    lead_source: payload.leadSource || "direct",
    campaign: payload.campaign || "none",
    package_shown: payload.packageShown || "Builder Direct",
    indoor_count: String(payload.indoorCount || 0),
    outdoor_count: String(payload.outdoorCount || 0),
    doorbell_count: String(payload.doorbellCount || 0),
    total_cameras: String(payload.totalCameras || 1),
    quoted_total: String(payload.quotedTotal || 0),
    deposit_amount: String(payload.depositAmount || 50),
    balance_due: String(payload.balanceDue || 0),
    appointment_date: payload.appointmentDate || "",
    appointment_time: payload.appointmentTime || "",
    address: payload.address || "",
    unit_number: payload.unitNumber || "",
    full_name: payload.fullName || "",
    city: payload.city || "",
    province: payload.province || "",
    postal_code: payload.postalCode || "",
    country: payload.country || "",
    place_id: payload.placeId || "",
    street_number: payload.streetNumber || "",
    route: payload.route || "",
    phone: payload.phone || "",
    email: payload.email || "",
    quote_id: payload.quoteId || "",
  };
}

function getRequiredPrice(key) {
  const envKey = PRICE_KEYS[key];
  const value = process.env[envKey];

  if (!value) {
    throw new Error(`Missing required environment variable: ${envKey}`);
  }

  return value;
}

function getOptionalPrice(key) {
  const envKey = PRICE_KEYS[key];
  return process.env[envKey] || null;
}

function isOttawaAddress(address) {
  const normalized = String(address || "").trim().toLowerCase();
  return (
    normalized.includes("ottawa") ||
    normalized.includes(", on") ||
    normalized.includes(" ontario")
  );
}

function isStructuredOttawaAddress(payload) {
  const city = String(payload.city || "").trim().toLowerCase();
  const province = String(payload.province || "").trim().toLowerCase();
  const country = String(payload.country || "").trim().toLowerCase();
  const postalCode = String(payload.postalCode || "").trim();
  const streetNumber = String(payload.streetNumber || "").trim();
  const route = String(payload.route || "").trim();
  const placeId = String(payload.placeId || "").trim();

  return (
    Boolean(placeId) &&
    Boolean(postalCode) &&
    Boolean(streetNumber) &&
    Boolean(route) &&
    city === "ottawa" &&
    (province === "on" || province === "ontario") &&
    (country === "ca" || country === "canada")
  );
}

function isValidPhoneNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return normalized.length === 10;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizePhoneToE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits : `1${digits}`;
  return normalized.length === 11 ? `+${normalized}` : "";
}

function buildLineItems() {
  return [
    {
      price: getRequiredPrice("bookingDeposit"),
      quantity: 1,
    },
  ];
}

function buildOptionalItems(payload) {
  const optionalItems = [];
  const upsells = [
    ["doorbellUpgrade", 1],
    ["floodlightUpgrade", 1],
    ["smartDisplay", 1],
  ];

  if (payload.installSpeed !== "same_week") {
    upsells.unshift(["sameWeekInstall", 1]);
  }

  if (!payload.extendedSupport) {
    upsells.unshift(["extendedSupport", 1]);
  }

  upsells.forEach(([key, quantity]) => {
    const price = getOptionalPrice(key);

    if (price) {
      optionalItems.push({
        price,
        quantity,
        adjustable_quantity: {
          enabled: false,
        },
      });
    }
  });

  return optionalItems;
}

function createBookingRecord(payload, stripeResult, stripeCustomer) {
  return {
    quoteId: payload.quoteId || "",
    packageShown: payload.packageShown || "Builder Direct",
    leadSource: payload.leadSource || "direct",
    campaign: payload.campaign || "none",
    indoorCount: Number(payload.indoorCount || 0),
    outdoorCount: Number(payload.outdoorCount || 0),
    doorbellCount: Number(payload.doorbellCount || 0),
    totalCameras: Number(payload.totalCameras || 1),
    quotedTotal: Number(payload.quotedTotal || 0),
    depositAmount: Number(payload.depositAmount || 50),
    balanceDue: Number(payload.balanceDue || 0),
    extendedSupport: Boolean(payload.extendedSupport),
    difficultMounting: Boolean(payload.difficultMounting),
    installSpeed: payload.installSpeed || "standard",
    appointmentDate: payload.appointmentDate || "",
    appointmentTime: payload.appointmentTime || "",
    address: payload.address || "",
    unitNumber: payload.unitNumber || "",
    city: payload.city || "",
    province: payload.province || "",
    postalCode: payload.postalCode || "",
    country: payload.country || "",
    placeId: payload.placeId || "",
    streetNumber: payload.streetNumber || "",
    route: payload.route || "",
    phone: payload.phone || "",
    fullName: payload.fullName || "",
    customerEmail: payload.email || "",
    paymentStatus: "awaiting_deposit",
    paidAmount: 0,
    checkoutSessionId: stripeResult.id,
    paymentIntentId:
      typeof stripeResult.payment_intent === "string"
        ? stripeResult.payment_intent
        : stripeResult.payment_intent?.id || "",
    checkoutUrl: stripeResult.url,
    checkoutStatus: stripeResult.status || "open",
    stripePaymentStatus: stripeResult.payment_status || "unpaid",
    stripeCustomerId:
      stripeCustomer?.id ||
      (typeof stripeResult.customer === "string" ? stripeResult.customer : stripeResult.customer?.id || ""),
    notes: "",
  };
}

async function stripeApiRequest(pathname, { method = "GET", body = null } = {}) {
  const response = await fetch(`https://api.stripe.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || "Stripe API request failed.");
  }

  return result;
}

async function findOrCreateStripeCustomer(payload) {
  const email = String(payload.email || "").trim();

  if (!email) {
    return null;
  }

  const phone = normalizePhoneToE164(payload.phone);
  const existingCustomers = await stripeApiRequest(
    `/v1/customers?email=${encodeURIComponent(email)}&limit=1`
  );
  const existingCustomer = existingCustomers.data?.[0];

  if (existingCustomer) {
    const needsPhoneUpdate = phone && existingCustomer.phone !== phone;
    const needsNameUpdate =
      payload.fullName && String(existingCustomer.name || "").trim() !== String(payload.fullName).trim();
    const needsAddressUpdate =
      payload.address &&
      (!existingCustomer.address?.line1 ||
        !existingCustomer.address?.postal_code ||
        !existingCustomer.address?.city);

    if (needsPhoneUpdate || needsNameUpdate || needsAddressUpdate) {
      const updateBody = new URLSearchParams();

      if (needsPhoneUpdate) {
        updateBody.set("phone", phone);
      }

      if (needsNameUpdate) {
        updateBody.set("name", payload.fullName.trim());
      }

      if (needsAddressUpdate) {
        updateBody.set("address[line1]", payload.address || "");
        updateBody.set("address[city]", payload.city || "");
        updateBody.set("address[state]", payload.province || "");
        updateBody.set("address[postal_code]", payload.postalCode || "");
        updateBody.set("address[country]", payload.country || "");
      }

      return stripeApiRequest(`/v1/customers/${encodeURIComponent(existingCustomer.id)}`, {
        method: "POST",
        body: updateBody,
      });
    }

    return existingCustomer;
  }

  const customerBody = new URLSearchParams();
  customerBody.set("email", email);
  customerBody.set("name", String(payload.fullName || "").trim());

  if (phone) {
    customerBody.set("phone", phone);
  }

  if (payload.address) {
    customerBody.set("address[line1]", payload.address || "");
    customerBody.set("address[city]", payload.city || "");
    customerBody.set("address[state]", payload.province || "");
    customerBody.set("address[postal_code]", payload.postalCode || "");
    customerBody.set("address[country]", payload.country || "");
  }

  customerBody.set("metadata[quote_id]", payload.quoteId || "");
  customerBody.set("metadata[lead_source]", payload.leadSource || "direct");

  return stripeApiRequest("/v1/customers", {
    method: "POST",
    body: customerBody,
  });
}

async function fetchStripeSession(sessionId) {
  const stripeSessionUrl = new URL(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`
  );
  stripeSessionUrl.searchParams.append("expand[]", "payment_intent");

  const stripeResponse = await fetch(stripeSessionUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    },
  });

  const stripeResult = await stripeResponse.json();

  if (!stripeResponse.ok) {
    throw new Error(stripeResult.error?.message || "Unable to fetch Stripe session.");
  }

  return stripeResult;
}

function deriveBookingPaymentStatus({ paymentStatus, checkoutStatus, failure = false }) {
  if (failure) {
    return "deposit_failed";
  }

  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
    return "deposit_paid";
  }

  if (checkoutStatus === "complete" || checkoutStatus === "completed") {
    return "deposit_processing";
  }

  return "awaiting_deposit";
}

function updateBookingFromCheckoutSession(session, overrides = {}) {
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  const quoteId = session.client_reference_id || session.metadata?.quote_id || "";
  const paidAmount = Number(session.amount_total || 0) / 100;
  const paymentStatus = deriveBookingPaymentStatus({
    paymentStatus: session.payment_status,
    checkoutStatus: session.status,
    failure: Boolean(overrides.failure),
  });

  return updateBookingByReferences(
    {
      sessionId: session.id,
      paymentIntentId,
      quoteId,
    },
    (booking) => ({
      checkoutSessionId: session.id || booking.checkoutSessionId || "",
      paymentIntentId: paymentIntentId || booking.paymentIntentId || "",
      checkoutStatus: session.status || booking.checkoutStatus || "",
      stripePaymentStatus: session.payment_status || booking.stripePaymentStatus || "unpaid",
      paymentStatus,
      paidAmount:
        paymentStatus === "deposit_paid"
          ? paidAmount
          : paymentStatus === "deposit_failed"
            ? 0
            : booking.paidAmount || 0,
      customerEmail: session.customer_details?.email || booking.customerEmail || "",
    })
  );
}

async function createCheckoutSession(request, response) {
  if (!process.env.STRIPE_SECRET_KEY) {
    sendJson(response, 500, {
      error: "Missing STRIPE_SECRET_KEY. Set your Stripe environment variables before using booking checkout.",
    });
    return;
  }

  let payload;

  try {
    payload = await readRequestBody(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  if (!payload.fullName || !payload.address || !payload.phone || !payload.email || !payload.appointmentDate || !payload.appointmentTime) {
    sendJson(response, 400, {
      error: "Full name, address, phone number, email address, appointment date, and appointment time are required.",
    });
    return;
  }

  if (!isValidPhoneNumber(payload.phone)) {
    sendJson(response, 400, { error: "Enter a valid phone number before booking." });
    return;
  }

  if (!isValidEmail(payload.email)) {
    sendJson(response, 400, { error: "Enter a valid email address before booking." });
    return;
  }

  if (!isStructuredOttawaAddress(payload) && !isOttawaAddress(payload.address)) {
    sendJson(response, 400, { error: "We currently service Ottawa addresses only." });
    return;
  }

  let lineItems;

  try {
    lineItems = buildLineItems();
  } catch (error) {
    sendJson(response, 500, { error: error.message });
    return;
  }

  const optionalItems = buildOptionalItems(payload);
  const baseUrl = getBaseUrl(request);
  const metadata = buildMetadata(payload);
  const stripeBody = new URLSearchParams();
  let stripeCustomer = null;

  stripeBody.set("mode", "payment");
  stripeBody.set(
    "success_url",
    `${baseUrl}/success.html?quote_id=${encodeURIComponent(payload.quoteId || "")}&session_id={CHECKOUT_SESSION_ID}`
  );
  stripeBody.set("cancel_url", `${baseUrl}/booking.html?checkout=canceled`);
  stripeBody.set("client_reference_id", payload.quoteId || "");
  stripeBody.set("billing_address_collection", "required");
  stripeBody.set("phone_number_collection[enabled]", "true");
  stripeBody.set("submit_type", "book");
  stripeBody.set(
    "custom_text[submit][message]",
    "Your $50 deposit reserves your appointment. The remaining balance is due after installation."
  );

  stripeBody.set("payment_method_types[0]", "card");

  try {
    stripeCustomer = await findOrCreateStripeCustomer(payload);
  } catch (error) {
    sendJson(response, 502, {
      error: error.message || "Unable to prepare customer details in Stripe.",
    });
    return;
  }

  if (stripeCustomer?.id) {
    stripeBody.set("customer", stripeCustomer.id);
    stripeBody.set("customer_update[address]", "auto");
    stripeBody.set("customer_update[name]", "auto");
  } else {
    stripeBody.set("customer_creation", "always");
    stripeBody.set("customer_email", payload.email.trim());
  }

  Object.entries(metadata).forEach(([key, value]) => {
    stripeBody.set(`metadata[${key}]`, value);
  });

  lineItems.forEach((item, index) => {
    stripeBody.set(`line_items[${index}][price]`, item.price);
    stripeBody.set(`line_items[${index}][quantity]`, String(item.quantity));
  });

  optionalItems.forEach((item, index) => {
    stripeBody.set(`optional_items[${index}][price]`, item.price);
    stripeBody.set(`optional_items[${index}][quantity]`, String(item.quantity));
    stripeBody.set(`optional_items[${index}][adjustable_quantity][enabled]`, "false");
  });

  try {
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeBody,
    });

    const stripeResult = await stripeResponse.json();

    if (!stripeResponse.ok) {
      sendJson(response, stripeResponse.status, {
        error: stripeResult.error?.message || "Stripe booking session creation failed.",
      });
      return;
    }

    upsertBooking(createBookingRecord(payload, stripeResult, stripeCustomer));

    sendJson(response, 200, {
      id: stripeResult.id,
      url: stripeResult.url,
    });
  } catch (error) {
    sendJson(response, 502, {
      error: "Unable to reach Stripe. Check network access and your API credentials.",
    });
  }
}

async function confirmBooking(request, response) {
  if (!process.env.STRIPE_SECRET_KEY) {
    sendJson(response, 500, { error: "Missing STRIPE_SECRET_KEY." });
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const sessionId = requestUrl.searchParams.get("session_id");

  if (!sessionId) {
    sendJson(response, 400, { error: "Missing session_id." });
    return;
  }

  try {
    const stripeSession = await fetchStripeSession(sessionId);
    const updatedBooking = updateBookingFromCheckoutSession(stripeSession);

    if (!updatedBooking) {
      sendJson(response, 404, { error: "Booking not found for this session." });
      return;
    }

    sendJson(response, 200, { booking: updatedBooking });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Unable to confirm booking." });
  }
}

function listBookings(response) {
  const bookings = readBookings().sort((a, b) => {
    const first = `${a.appointmentDate || ""} ${a.appointmentTime || ""}`.trim();
    const second = `${b.appointmentDate || ""} ${b.appointmentTime || ""}`.trim();
    return first.localeCompare(second);
  });

  sendJson(response, 200, { bookings });
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.join(ROOT_DIR, pathname);
  const relativePath = path.relative(ROOT_DIR, filePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (
    relativePath.startsWith(`data${path.sep}`) ||
    path.basename(filePath).startsWith(".") ||
    relativePath.includes(`${path.sep}.`) ||
    relativePath === ".env" ||
    relativePath === ".env.example"
  ) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/admin-login.html") {
    if (isAdminAuthenticated(request)) {
      response.writeHead(302, { Location: "/admin.html" });
      response.end();
      return;
    }

    sendHtml(
      response,
      200,
      renderAdminLoginPage({
        next: isSafeAdminNextPath(requestUrl.searchParams.get("next"))
          ? requestUrl.searchParams.get("next")
          : "/admin.html",
      })
    );
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/admin/login") {
    handleAdminLogin(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/admin/logout") {
    handleAdminLogout(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/create-checkout-session") {
    createCheckoutSession(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/bookings") {
    if (!requireAdminAuth(request, response, { api: true })) {
      return;
    }
    listBookings(response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/bookings/confirm") {
    confirmBooking(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/maps-config.js") {
    serveMapsConfig(response);
    return;
  }

  if (request.method === "GET") {
    if (requestUrl.pathname === "/admin.html" && !requireAdminAuth(request, response)) {
      return;
    }
    serveStatic(request, response);
    return;
  }

  response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Thompson Family Security preview running at http://localhost:${PORT}`);
});
