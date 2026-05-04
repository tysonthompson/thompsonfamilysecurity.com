# Thompson Family Security Landing Page

This build now follows this booking funnel:

`Ads / SEO / QR -> landing page -> quote builder -> book appointment with $50 deposit`

## Files

- `index.html` - landing page, package anchors, quote builder
- `maps-config.js` - client-side Google Maps API key config for address autocomplete
- `styles.css` - responsive styling for the landing page and builder
- `script.js` - client-side quote math, package presets, deposit summary, campaign tracking, booking handoff
- `server.js` - static server plus Stripe Checkout Session creation endpoint

## Pricing model in this build

The quote builder uses these defaults:

- Base package: `1 Camera Installed = $199`
- Extra camera: `$100`
- Outdoor camera upgrade: `$50`
- Same-week install: `$79`
- Extended support / warranty: `$59`
- Difficult mounting / custom wiring: `$89`
- Booking deposit due online: `$50`

Adjust the client-side values in `script.js` and the Stripe price mappings in `server.js` to match your exact offer.

## Stripe setup

Create one-time prices in Stripe for:

- `Booking Deposit`
- `Same-Week Install`
- `Extended Support / Warranty`
- `Doorbell Upgrade`
- `Floodlight Upgrade`
- `Smart Display / Hub Upgrade`

Then set these environment variables before starting the Node server:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `STRIPE_SECRET_KEY`
- `APP_BASE_URL`
- `CURRENCY`
- `STRIPE_PRICE_BOOKING_DEPOSIT`
- `STRIPE_PRICE_SAME_WEEK_INSTALL`
- `STRIPE_PRICE_EXTENDED_SUPPORT`
- `STRIPE_PRICE_DOORBELL_UPGRADE`
- `STRIPE_PRICE_FLOODLIGHT_UPGRADE`
- `STRIPE_PRICE_SMART_DISPLAY`

The server now auto-loads `.env` from the project root on startup.

## Admin security

The admin calendar is now protected by a server-side sign-in screen.

Set these values in `.env` before using the admin page:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Protected routes:

- `/admin.html`
- `/api/bookings`

The server also blocks direct static access to:

- `.env`
- `.env.example`
- anything under `/data/`

For production-grade address autocomplete, add your Google Maps API key to `.env`:

```dotenv
GOOGLE_MAPS_API_KEY=YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_API_KEY
```

Recommended Google setup:

- Enable the Maps JavaScript API and Places API in Google Cloud.
- Restrict the browser API key by HTTP referrer before going live.
- Keep the service area limited to Ottawa in the app logic, even with autocomplete enabled.

## Running locally

Use the Node server for the full funnel:

```powershell
cd c:\projects\thompsonfamilysecurity
node server.js
```

Open `http://localhost:3000`.

## Render deployment

This repo now includes [render.yaml](/abs/path/C:/projects/thompsonfamilysecurity/render.yaml) so Render can run the app as a Node web service with:

```text
node server.js
```

Set these environment variables in Render before deploying:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `APP_BASE_URL`
- `CURRENCY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_BOOKING_DEPOSIT`
- `STRIPE_PRICE_SAME_WEEK_INSTALL`
- `STRIPE_PRICE_EXTENDED_SUPPORT`
- `STRIPE_PRICE_DOORBELL_UPGRADE`
- `STRIPE_PRICE_FLOODLIGHT_UPGRADE`
- `STRIPE_PRICE_SMART_DISPLAY`
- `GOOGLE_MAPS_API_KEY`

Recommended `APP_BASE_URL` format:

```text
https://your-render-service.onrender.com
```

Important note for production:

- [data/bookings.json](/abs/path/C:/projects/thompsonfamilysecurity/data/bookings.json) is now gitignored and should be treated as local/dev-only storage.
- Render instances should not rely on a local JSON file as the long-term source of truth for bookings.
- For real production use, move bookings into a database.

## Notes

- Lead source and campaign values are read from query params like `utm_source`, `utm_campaign`, `lead_source`, and `campaign`.
- The builder sends the quoted total, deposit amount, balance due, package, counts, address, phone, and `quote_id` into Stripe metadata.
- When Google Maps is configured, the builder also sends structured address data like city, province, postal code, country, and place ID.
- Stripe Checkout can handle Apple Pay, Google Pay, and Link for the deposit payment when your Stripe account, domain, and wallet settings are configured correctly.
