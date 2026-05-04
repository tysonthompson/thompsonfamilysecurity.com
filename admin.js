const calendarGrid = document.querySelector("#admin-calendar-grid");
const calendarMonth = document.querySelector("#admin-calendar-month");
const listDate = document.querySelector("#admin-list-date");
const bookingsList = document.querySelector("#admin-bookings-list");
const detailTitle = document.querySelector("#admin-detail-title");
const detailIntro = document.querySelector("#admin-detail-intro");
const selectedAppointment = document.querySelector("#admin-selected-appointment");
const bookingMeta = document.querySelector("#admin-booking-meta");
const bookingFields = document.querySelector("#admin-booking-fields");
const prevMonthButton = document.querySelector("#admin-prev-month");
const nextMonthButton = document.querySelector("#admin-next-month");
const DISPLAY_CURRENCY = "CAD";

let bookings = [];
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = "";
let selectedBookingId = "";

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: DISPLAY_CURRENCY,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateKey) {
  if (!dateKey) {
    return "No appointment selected yet";
  }

  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function createStatusBadge(label, modifier) {
  return `<span class="admin-status ${modifier}">${label}</span>`;
}

function getPaymentStatusView(paymentStatus) {
  switch (paymentStatus) {
    case "deposit_paid":
      return { label: "Deposit Paid", modifier: "is-good" };
    case "deposit_processing":
      return { label: "Deposit Processing", modifier: "is-pending" };
    case "deposit_failed":
      return { label: "Deposit Failed", modifier: "is-pending" };
    default:
      return { label: "Awaiting Deposit", modifier: "is-pending" };
  }
}

function getBookingsForDate(dateKey) {
  return bookings.filter((booking) => booking.appointmentDate === dateKey);
}

function renderCalendar() {
  calendarGrid.replaceChildren();

  calendarMonth.textContent = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

  const startDay = currentMonth.getDay();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

  for (let i = 0; i < startDay; i += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    calendarGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const dateKey = formatDateKey(date);
    const items = getBookingsForDate(dateKey);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-calendar-day";

    if (selectedDate === dateKey) {
      button.classList.add("is-selected");
    }

    button.innerHTML = `
      <span class="admin-day-number">${day}</span>
      <span class="admin-day-count">${items.length ? `${items.length} booking${items.length === 1 ? "" : "s"}` : "No bookings"}</span>
    `;

    button.addEventListener("click", () => {
      selectedDate = dateKey;
      renderCalendar();
      renderBookingsList();
    });

    calendarGrid.append(button);
  }
}

function renderBookingsList() {
  const dateKey = selectedDate || formatDateKey(new Date());
  const dayBookings = getBookingsForDate(dateKey);
  listDate.textContent = `Bookings for ${formatDisplayDate(dateKey)}`;
  bookingsList.replaceChildren();

  if (!dayBookings.length) {
    bookingsList.innerHTML = `<p class="summary-intro">No bookings scheduled for this date yet.</p>`;
    if (selectedBookingId && !bookings.some((booking) => booking.quoteId === selectedBookingId)) {
      selectedBookingId = "";
      renderBookingDetail(null);
    }
    return;
  }

  dayBookings.forEach((booking) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-booking-item";

    if (selectedBookingId === booking.quoteId) {
      button.classList.add("is-selected");
    }

    const statusView = getPaymentStatusView(booking.paymentStatus);

    button.innerHTML = `
      <div>
        <strong>${booking.appointmentTime}</strong>
        <span>${booking.packageShown}</span>
      </div>
      <div>
        ${createStatusBadge(statusView.label, statusView.modifier)}
        <span>${booking.address}</span>
      </div>
    `;

    button.addEventListener("click", () => {
      selectedBookingId = booking.quoteId;
      renderBookingsList();
      renderBookingDetail(booking);
    });

    bookingsList.append(button);
  });

  const selectedBooking =
    dayBookings.find((booking) => booking.quoteId === selectedBookingId) || dayBookings[0];
  selectedBookingId = selectedBooking.quoteId;
  renderBookingDetail(selectedBooking);
}

function renderBookingDetail(booking) {
  if (!booking) {
    detailTitle.textContent = "Select a booking";
    detailIntro.textContent = "Click a booking from the calendar or the daily list to review customer details, camera counts, payment status, and quote totals.";
    selectedAppointment.textContent = "No booking selected yet";
    bookingMeta.innerHTML = "";
    bookingFields.innerHTML = "";
    return;
  }

  detailTitle.textContent = booking.packageShown;
  detailIntro.textContent = `${booking.address}${booking.unitNumber ? `, ${booking.unitNumber}` : ""}`;
  selectedAppointment.textContent = `${formatDisplayDate(booking.appointmentDate)} at ${booking.appointmentTime}`;

  const statusView = getPaymentStatusView(booking.paymentStatus);
  const paymentBadge = createStatusBadge(statusView.label, statusView.modifier);

  bookingMeta.innerHTML = `
    <div class="admin-meta-grid">
      <div><span>Quoted total</span><strong>${formatCurrency(booking.quotedTotal)}</strong></div>
      <div><span>Paid so far</span><strong>${formatCurrency(booking.paidAmount)}</strong></div>
      <div><span>Balance remaining</span><strong>${formatCurrency(booking.balanceDue)}</strong></div>
      <div><span>Status</span><strong>${paymentBadge}</strong></div>
    </div>
  `;

  bookingFields.innerHTML = `
    <p class="tracking-title">Customer and quote info</p>
    <ul class="feature-list compact">
      <li><span>Name: ${booking.fullName || "Not provided"}</span></li>
      <li><span>Phone: ${booking.phone || "Not provided"}</span></li>
      <li><span>Quote ID: ${booking.quoteId}</span></li>
      <li><span>Lead source: ${booking.leadSource || "direct"}</span></li>
      <li><span>Campaign: ${booking.campaign || "none"}</span></li>
      <li><span>Indoor / Outdoor / Doorbell: ${booking.indoorCount} / ${booking.outdoorCount} / ${booking.doorbellCount}</span></li>
      <li><span>Install speed: ${booking.installSpeed === "same_week" ? "Same-week" : "Standard"}</span></li>
      <li><span>Extended support: ${booking.extendedSupport ? "Yes" : "No"}</span></li>
      <li><span>Difficult mounting: ${booking.difficultMounting ? "Yes" : "No"}</span></li>
      <li><span>Checkout session: ${booking.checkoutSessionId || "Not created"}</span></li>
      <li><span>Customer email: ${booking.customerEmail || "Not available yet"}</span></li>
    </ul>
  `;
}

async function loadBookings() {
  const response = await fetch("/api/bookings");
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Unable to load bookings.");
  }

  bookings = result.bookings || [];

  if (!selectedDate) {
    selectedDate = bookings[0]?.appointmentDate || formatDateKey(new Date());
  }

  renderCalendar();
  renderBookingsList();
}

prevMonthButton.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

loadBookings().catch((error) => {
  bookingsList.innerHTML = `<p class="summary-intro">${error.message}</p>`;
});
