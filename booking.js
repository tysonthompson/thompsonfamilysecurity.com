const BOOKING_STORAGE_KEY = "tfs_quote";
const SERVICE_CITY = "Ottawa";
const SERVICE_PROVINCE = "ON";
const SERVICE_COUNTRY = "CA";
const DISPLAY_CURRENCY = "CAD";
const OTTAWA_BOUNDS = {
  north: 45.537,
  south: 45.213,
  west: -76.353,
  east: -75.246,
};
const OTTAWA_STREETS = [
  "Bank St",
  "Rideau St",
  "Elgin St",
  "Wellington St",
  "Somerset St W",
  "Somerset St E",
  "Baseline Rd",
  "Carling Ave",
  "Merivale Rd",
  "Bronson Ave",
  "Montreal Rd",
  "St Laurent Blvd",
  "Innes Rd",
  "Ogilvie Rd",
  "Heron Rd",
  "Walkley Rd",
  "Hunt Club Rd",
  "Riverside Dr",
  "Prince of Wales Dr",
  "Fisher Ave",
  "Greenbank Rd",
  "Woodroffe Ave",
  "Meadowlands Dr",
  "Robertson Rd",
  "Hazeldean Rd",
  "Strandherd Dr",
  "Eagleson Rd",
  "Tenth Line Rd",
  "Trim Rd",
  "Jeanne d'Arc Blvd",
  "Orleans Blvd",
  "Kanata Ave",
  "March Rd",
  "Queen Mary St",
  "Clyde Ave",
];
const TIMESLOTS = ["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"];

const bookingForm = document.querySelector("#booking-form");
const bookingButton = document.querySelector("#booking-button");
const bookingPackageLabel = document.querySelector("#booking-package-label");
const fullNameInput = document.querySelector("#full-name");
const addressInput = document.querySelector("#address");
const unitNumberInput = document.querySelector("#unit-number");
const phoneInput = document.querySelector("#phone");
const emailInput = document.querySelector("#email");
const phoneStatus = document.querySelector("#phone-status");
const installSpeedInput = document.querySelector("#install-speed");
const addressFeedback = document.querySelector("#address-feedback");
const addressSuggestions = document.querySelector("#ottawa-address-suggestions");
const cityInput = document.querySelector("#city");
const provinceInput = document.querySelector("#province");
const postalCodeInput = document.querySelector("#postal-code");
const countryInput = document.querySelector("#country");
const placeIdInput = document.querySelector("#place-id");
const streetNumberInput = document.querySelector("#street-number");
const routeInput = document.querySelector("#route");
const addressStatus = document.querySelector("#address-status");
const appointmentDateInput = document.querySelector("#appointment-date");
const appointmentTimeInput = document.querySelector("#appointment-time");
const calendarGrid = document.querySelector("#calendar-grid");
const calendarMonthLabel = document.querySelector("#calendar-month-label");
const calendarFeedback = document.querySelector("#calendar-feedback");
const prevMonthButton = document.querySelector("#prev-month");
const nextMonthButton = document.querySelector("#next-month");
const timeslotGrid = document.querySelector("#timeslot-grid");
const selectedAppointmentText = document.querySelector("#selected-appointment-text");

const summaryTargets = {
  totalCameras: document.querySelector("#summary-total-cameras"),
  indoor: document.querySelector("#summary-indoor"),
  outdoor: document.querySelector("#summary-outdoor"),
  doorbell: document.querySelector("#summary-doorbell"),
  total: document.querySelector("#summary-total"),
  deposit: document.querySelector("#summary-deposit"),
  balance: document.querySelector("#summary-balance"),
  package: document.querySelector("#tracking-package"),
  quote: document.querySelector("#tracking-quote"),
  campaign: document.querySelector("#tracking-campaign"),
};

let googleAutocomplete = null;
let quote = loadQuote();
let currentMonth = createMonthStart(new Date());

function loadQuote() {
  const storedQuote = window.sessionStorage.getItem(BOOKING_STORAGE_KEY);

  if (!storedQuote) {
    window.location.href = "/";
    return null;
  }

  return JSON.parse(storedQuote);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: DISPLAY_CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

function getNormalizedPhoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("1")) {
    return digits.slice(1, 11);
  }

  return digits;
}

function formatPhoneNumber(value) {
  const digits = getNormalizedPhoneDigits(value).slice(0, 10);

  if (!digits.length) {
    return "";
  }

  if (digits.length < 4) {
    return digits;
  }

  if (digits.length < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function getPhoneValidation(value) {
  const digits = getNormalizedPhoneDigits(value);

  if (!digits.length) {
    return {
      valid: false,
      message: "Enter a phone number so we can confirm your appointment.",
    };
  }

  if (digits.length !== 10) {
    return {
      valid: false,
      message: "Enter a valid 10-digit phone number.",
    };
  }

  return {
    valid: true,
    message: "Phone number verified.",
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function updatePhoneStatus(validation) {
  phoneStatus.textContent = validation.valid ? "Verified phone number" : "Phone number not verified yet";
  phoneStatus.classList.toggle("is-verified", validation.valid);
}

function refreshPhoneFeedback() {
  const validation = getPhoneValidation(phoneInput.value);
  updatePhoneStatus(validation);
  return validation;
}

function unlockAddressInput() {
  if (addressInput.hasAttribute("readonly")) {
    addressInput.removeAttribute("readonly");
  }
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function clearStructuredAddress() {
  cityInput.value = "";
  provinceInput.value = "";
  postalCodeInput.value = "";
  countryInput.value = "";
  placeIdInput.value = "";
  streetNumberInput.value = "";
  routeInput.value = "";
}

function hasVerifiedStructuredAddress() {
  return Boolean(
    placeIdInput.value &&
      streetNumberInput.value &&
      routeInput.value &&
      postalCodeInput.value &&
      normalizeText(cityInput.value) === normalizeText(SERVICE_CITY) &&
      (normalizeText(provinceInput.value) === normalizeText(SERVICE_PROVINCE) ||
        normalizeText(provinceInput.value) === "ontario") &&
      (normalizeText(countryInput.value) === normalizeText(SERVICE_COUNTRY) ||
        normalizeText(countryInput.value) === "canada")
  );
}

function getAddressValidation(addressValue) {
  const normalizedAddress = normalizeText(addressValue);
  const city = normalizeText(cityInput.value);
  const province = normalizeText(provinceInput.value);
  const country = normalizeText(countryInput.value);

  if (!normalizedAddress) {
    return {
      valid: false,
      message: `Enter your ${SERVICE_CITY} service address to continue.`,
    };
  }

  if (placeIdInput.value) {
    return hasVerifiedStructuredAddress()
      ? { valid: true, message: `${SERVICE_CITY} service area confirmed.` }
      : {
          valid: false,
          message: `Choose a full ${SERVICE_CITY} address from the suggestions so we can verify it.`,
        };
  }

  return {
    valid: false,
    message: `Choose a full ${SERVICE_CITY} address from the suggestions so we can verify it.`,
  };
}

function updateAddressFeedback(validation) {
  addressFeedback.textContent = validation.message;
  addressFeedback.style.color = validation.valid ? "var(--accent)" : "var(--primary-deep)";
  addressStatus.textContent = validation.valid ? `Verified ${SERVICE_CITY} service address` : "Address not verified yet";
  addressStatus.classList.toggle("is-verified", validation.valid);
}

function refreshAddressFeedback() {
  updateAddressFeedback(getAddressValidation(addressInput.value));
}

function buildFallbackAddressSuggestions(rawValue) {
  const trimmedValue = rawValue.trim();

  if (trimmedValue.length < 2) {
    return [];
  }

  const houseNumberMatch = trimmedValue.match(/^(\d+)\s*(.*)$/);
  const houseNumber = houseNumberMatch ? houseNumberMatch[1] : "";
  const streetFragment = (houseNumberMatch ? houseNumberMatch[2] : trimmedValue).toLowerCase();

  return OTTAWA_STREETS.filter((street) => street.toLowerCase().includes(streetFragment))
    .slice(0, 8)
    .map((street) =>
      houseNumber ? `${houseNumber} ${street}, ${SERVICE_CITY}, ON` : `${street}, ${SERVICE_CITY}, ON`
    );
}

function refreshFallbackSuggestions() {
  if (googleAutocomplete) {
    addressSuggestions.replaceChildren();
    return;
  }

  const suggestions = buildFallbackAddressSuggestions(addressInput.value);
  addressSuggestions.replaceChildren();

  suggestions.forEach((suggestion) => {
    const option = document.createElement("option");
    option.value = suggestion;
    addressSuggestions.append(option);
  });
}

function applyPlaceToAddressFields(place) {
  if (!place?.address_components) {
    return;
  }

  let streetAddress = "";
  let postalCode = "";
  let locality = "";
  let province = "";
  let country = "";
  let streetNumber = "";
  let route = "";
  let fullFormattedAddress = "";

  if (typeof place.formatted_address === "string" && place.formatted_address.trim()) {
    fullFormattedAddress = place.formatted_address.trim();
  }

  for (const component of place.address_components) {
    const componentType = component.types[0];

    switch (componentType) {
      case "street_number":
        streetNumber = component.long_name;
        streetAddress = `${component.long_name} ${streetAddress}`;
        break;
      case "route":
        route = component.short_name;
        streetAddress += component.short_name;
        break;
      case "postal_code":
        postalCode = `${component.long_name}${postalCode}`;
        break;
      case "postal_code_suffix":
        postalCode = `${postalCode}-${component.long_name}`;
        break;
      case "locality":
        locality = component.long_name;
        break;
      case "postal_town":
        if (!locality) {
          locality = component.long_name;
        }
        break;
      case "administrative_area_level_1":
        province = component.short_name;
        break;
      case "country":
        country = component.short_name;
        break;
      default:
        break;
    }
  }

  if (fullFormattedAddress) {
    addressInput.value = fullFormattedAddress;
  } else if (streetAddress) {
    const pieces = [streetAddress];
    if (locality) {
      pieces.push(locality);
    }
    if (province) {
      pieces.push(province);
    }
    if (postalCode) {
      pieces.push(postalCode);
    }
    if (country) {
      pieces.push(country);
    }
    addressInput.value = pieces.join(", ");
  }

  cityInput.value = locality;
  provinceInput.value = province;
  postalCodeInput.value = postalCode;
  countryInput.value = country;
  placeIdInput.value = place.place_id || "";
  streetNumberInput.value = streetNumber;
  routeInput.value = route;
  refreshAddressFeedback();
  unitNumberInput.focus();
}

function initializeGoogleAutocomplete() {
  if (googleAutocomplete || !window.google?.maps?.places?.Autocomplete) {
    return false;
  }

  addressInput.removeAttribute("list");
  addressSuggestions.replaceChildren();

  googleAutocomplete = new window.google.maps.places.Autocomplete(addressInput, {
    componentRestrictions: { country: SERVICE_COUNTRY.toLowerCase() },
    fields: ["address_components", "formatted_address", "geometry", "place_id"],
    types: ["address"],
    bounds: new window.google.maps.LatLngBounds(
      { lat: OTTAWA_BOUNDS.south, lng: OTTAWA_BOUNDS.west },
      { lat: OTTAWA_BOUNDS.north, lng: OTTAWA_BOUNDS.east }
    ),
    strictBounds: false,
  });

  googleAutocomplete.addListener("place_changed", () => {
    const place = googleAutocomplete.getPlace();
    applyPlaceToAddressFields(place);
  });

  updateAddressFeedback({
    valid: false,
    message: `Start typing your ${SERVICE_CITY} address and choose a suggestion.`,
  });

  return true;
}

function handleGoogleMapsFailure(reason) {
  googleAutocomplete = null;
  addressInput.setAttribute("list", "ottawa-address-suggestions");
  updateAddressFeedback({
    valid: false,
    message:
      "Google address autocomplete is not available right now, so local Ottawa suggestions are being used instead.",
  });

  if (reason) {
    console.warn("Google Maps autocomplete fallback:", reason);
  }
}

async function loadGoogleMapsAutocomplete() {
  const apiKey =
    window.TFS_CONFIG?.googleMapsApiKey ||
    document.querySelector('meta[name="google-maps-api-key"]')?.content?.trim();

  if (!apiKey) {
    handleGoogleMapsFailure("Missing API key.");
    return;
  }

  if (window.google?.maps?.places?.Autocomplete && initializeGoogleAutocomplete()) {
    return;
  }

  try {
    await new Promise((resolve, reject) => {
      window.__tfsGoogleMapsReady = () => resolve();
      const script = document.createElement("script");
      const params = new URLSearchParams({
        key: apiKey,
        libraries: "places",
        v: "weekly",
        callback: "__tfsGoogleMapsReady",
      });

      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error("Google Maps script failed to load."));
      document.head.append(script);

      window.setTimeout(() => reject(new Error("Google Maps load timed out.")), 8000);
    });

    if (!initializeGoogleAutocomplete()) {
      throw new Error("Google Places Autocomplete did not initialize.");
    }
  } catch (error) {
    handleGoogleMapsFailure(error instanceof Error ? error.message : "Unknown load error.");
  } finally {
    delete window.__tfsGoogleMapsReady;
  }
}

function createMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function isBookableDate(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 45);

  return date >= today && date <= maxDate && date.getDay() !== 0;
}

function renderCalendar() {
  calendarGrid.replaceChildren();

  const monthStart = createMonthStart(currentMonth);
  const monthLabel = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(monthStart);
  calendarMonthLabel.textContent = monthLabel;

  const startDay = monthStart.getDay();
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

  for (let i = 0; i < startDay; i += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    calendarGrid.append(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = String(day);

    const dateKey = formatDateKey(date);
    const bookable = isBookableDate(date);

    if (!bookable) {
      button.disabled = true;
      button.classList.add("is-disabled");
    }

    if (appointmentDateInput.value === dateKey) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      appointmentDateInput.value = dateKey;
      appointmentTimeInput.value = "";
      renderCalendar();
      renderTimeslots();
      updateSelectedAppointment();
    });

    calendarGrid.append(button);
  }
}

function renderTimeslots() {
  timeslotGrid.replaceChildren();

  if (!appointmentDateInput.value) {
    calendarFeedback.textContent = "Choose a date to see available appointment times.";
    return;
  }

  calendarFeedback.textContent = `Available times for ${formatDisplayDate(appointmentDateInput.value)}.`;

  TIMESLOTS.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "timeslot-button";
    button.textContent = slot;

    if (appointmentTimeInput.value === slot) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      appointmentTimeInput.value = slot;
      renderTimeslots();
      updateSelectedAppointment();
    });

    timeslotGrid.append(button);
  });
}

function updateSelectedAppointment() {
  if (!appointmentDateInput.value || !appointmentTimeInput.value) {
    selectedAppointmentText.textContent = "No appointment selected yet";
    return;
  }

  selectedAppointmentText.textContent = `${formatDisplayDate(appointmentDateInput.value)} at ${appointmentTimeInput.value}`;
}

function hydrateQuoteSummary() {
  if (!quote) {
    return;
  }

  bookingPackageLabel.textContent = `Selected package: ${quote.packageShown}`;
  summaryTargets.totalCameras.textContent = quote.totalCameras;
  summaryTargets.indoor.textContent = quote.indoorCount;
  summaryTargets.outdoor.textContent = quote.outdoorCount;
  summaryTargets.doorbell.textContent = quote.doorbellCount;
  summaryTargets.total.textContent = formatCurrency(quote.quotedTotal);
  summaryTargets.deposit.textContent = formatCurrency(quote.depositAmount);
  summaryTargets.balance.textContent = formatCurrency(quote.balanceDue);
  summaryTargets.package.textContent = `Selected package: ${quote.packageShown}`;
  summaryTargets.quote.textContent = `Quote reference: ${quote.quoteId}`;
  summaryTargets.campaign.textContent = `Deposit due today: ${formatCurrency(quote.depositAmount)}`;

  if (installSpeedInput && quote.installSpeed) {
    installSpeedInput.value = quote.installSpeed;
  }
}

async function submitBooking(event) {
  event.preventDefault();

  const addressValidation = getAddressValidation(addressInput.value);
  const phoneValidation = refreshPhoneFeedback();

  if (!addressValidation.valid) {
    updateAddressFeedback(addressValidation);
    addressInput.focus();
    return;
  }

  if (!String(fullNameInput.value || "").trim()) {
    window.alert("Enter your full name before booking.");
    fullNameInput.focus();
    return;
  }

  if (!phoneValidation.valid) {
    phoneInput.focus();
    return;
  }

  if (!isValidEmail(emailInput.value)) {
    window.alert("Enter a valid email address before booking.");
    emailInput.focus();
    return;
  }

  if (!appointmentDateInput.value || !appointmentTimeInput.value) {
    calendarFeedback.textContent = "Choose both a date and a time before booking.";
    calendarFeedback.style.color = "var(--primary-deep)";
    return;
  }

  const payload = {
    ...quote,
    fullName: fullNameInput.value.trim(),
    address: addressInput.value.trim(),
    unitNumber: unitNumberInput.value.trim(),
    city: cityInput.value.trim(),
    province: provinceInput.value.trim(),
    postalCode: postalCodeInput.value.trim(),
    country: countryInput.value.trim(),
    placeId: placeIdInput.value.trim(),
    streetNumber: streetNumberInput.value.trim(),
    route: routeInput.value.trim(),
    phone: formatPhoneNumber(phoneInput.value),
    email: emailInput.value.trim(),
    installSpeed: installSpeedInput ? installSpeedInput.value : quote.installSpeed || "standard",
    appointmentDate: appointmentDateInput.value,
    appointmentTime: appointmentTimeInput.value,
  };

  bookingButton.disabled = true;
  bookingButton.textContent = "Creating booking...";

  try {
    const response = await fetch("/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to create booking session.");
    }

    window.location.href = result.url;
  } catch (error) {
    window.alert(error.message);
    bookingButton.disabled = false;
    bookingButton.textContent = "Pay $50 Deposit And Book";
  }
}

prevMonthButton.addEventListener("click", () => {
  currentMonth = createMonthStart(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  currentMonth = createMonthStart(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  renderCalendar();
});

addressInput.addEventListener("focus", unlockAddressInput);
addressInput.addEventListener("pointerdown", unlockAddressInput);
addressInput.addEventListener("input", () => {
  clearStructuredAddress();
  refreshFallbackSuggestions();
  refreshAddressFeedback();
});
addressInput.addEventListener("change", () => {
  refreshFallbackSuggestions();
  refreshAddressFeedback();
});
phoneInput.addEventListener("input", () => {
  const formattedValue = formatPhoneNumber(phoneInput.value);

  phoneInput.value = formattedValue;
  refreshPhoneFeedback();
});
phoneInput.addEventListener("blur", () => {
  phoneInput.value = formatPhoneNumber(phoneInput.value);
  refreshPhoneFeedback();
});

bookingForm.addEventListener("submit", submitBooking);

hydrateQuoteSummary();
renderCalendar();
renderTimeslots();
updateSelectedAppointment();
refreshFallbackSuggestions();
refreshAddressFeedback();
refreshPhoneFeedback();
loadGoogleMapsAutocomplete();
document.documentElement.classList.remove("booking-preload");
