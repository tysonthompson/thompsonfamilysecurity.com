const PRICE_CONFIG = {
  basePackage: 199,
  extraCamera: 100,
  outdoorUpgrade: 50,
  sameWeekInstall: 79,
  extendedSupport: 59,
  difficultMounting: 89,
  depositAmount: 50,
};

const DEFAULT_PACKAGE = "Builder Direct";
const QUOTE_STORAGE_KEY = "tfs_quote";
const DISPLAY_CURRENCY = "CAD";

const form = document.querySelector("#quote-form");
const quoteButton = document.querySelector("#quote-button");
const packageLabel = document.querySelector("#selected-package-label");
const presetButtons = document.querySelectorAll(".preset-button");

const indoorInput = document.querySelector("#indoor-count");
const outdoorInput = document.querySelector("#outdoor-count");
const doorbellInput = document.querySelector("#doorbell-count");
const extendedSupportInput = document.querySelector("#extended-support");
const difficultMountingInput = document.querySelector("#difficult-mounting");

const summaryTargets = {
  totalCameras: document.querySelector("#summary-total-cameras"),
  indoor: document.querySelector("#summary-indoor"),
  outdoor: document.querySelector("#summary-outdoor"),
  doorbell: document.querySelector("#summary-doorbell"),
  base: document.querySelector("#summary-base"),
  extra: document.querySelector("#summary-extra"),
  outdoorUpgrade: document.querySelector("#summary-outdoor-upgrade"),
  builderOptions: document.querySelector("#summary-builder-options"),
  total: document.querySelector("#summary-total"),
  deposit: document.querySelector("#summary-deposit"),
  balance: document.querySelector("#summary-balance"),
};

const leadParams = new URLSearchParams(window.location.search);

const leadContext = {
  leadSource: leadParams.get("lead_source") || leadParams.get("utm_source") || "direct",
  campaign: leadParams.get("campaign") || leadParams.get("utm_campaign") || "none",
  packageShown: DEFAULT_PACKAGE,
  quoteId: createQuoteId(),
};

function createQuoteId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TFS-${Date.now()}-${randomPart}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: DISPLAY_CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

function sanitizeCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getQuoteState() {
  let indoorCount = sanitizeCount(indoorInput.value);
  const outdoorCount = sanitizeCount(outdoorInput.value);
  const doorbellCount = sanitizeCount(doorbellInput.value);
  const totalCameras = indoorCount + outdoorCount + doorbellCount;

  if (totalCameras === 0) {
    indoorCount = 1;
    indoorInput.value = "1";
  }

  const normalizedTotal = Math.max(indoorCount + outdoorCount + doorbellCount, 1);
  const extraCameraCount = Math.max(normalizedTotal - 1, 0);
  const builderOptionsTotal =
    (extendedSupportInput.checked ? PRICE_CONFIG.extendedSupport : 0) +
    (difficultMountingInput.checked ? PRICE_CONFIG.difficultMounting : 0);
  const total =
    PRICE_CONFIG.basePackage +
    extraCameraCount * PRICE_CONFIG.extraCamera +
    outdoorCount * PRICE_CONFIG.outdoorUpgrade +
    builderOptionsTotal;
  const deposit = Math.min(PRICE_CONFIG.depositAmount, total);
  const balanceDue = Math.max(total - deposit, 0);

  return {
    indoorCount,
    outdoorCount,
    doorbellCount,
    totalCameras: normalizedTotal,
    extraCameraCount,
    baseAmount: PRICE_CONFIG.basePackage,
    extraAmount: extraCameraCount * PRICE_CONFIG.extraCamera,
    outdoorUpgradeAmount: outdoorCount * PRICE_CONFIG.outdoorUpgrade,
    builderOptionsTotal,
    total,
    deposit,
    balanceDue,
  };
}

function refreshSummary() {
  const quote = getQuoteState();

  summaryTargets.totalCameras.textContent = quote.totalCameras;
  summaryTargets.indoor.textContent = quote.indoorCount;
  summaryTargets.outdoor.textContent = quote.outdoorCount;
  summaryTargets.doorbell.textContent = quote.doorbellCount;
  summaryTargets.base.textContent = formatCurrency(quote.baseAmount);
  summaryTargets.extra.textContent = formatCurrency(quote.extraAmount);
  summaryTargets.outdoorUpgrade.textContent = formatCurrency(quote.outdoorUpgradeAmount);
  summaryTargets.builderOptions.textContent = formatCurrency(quote.builderOptionsTotal);
  summaryTargets.total.textContent = formatCurrency(quote.total);
  summaryTargets.deposit.textContent = formatCurrency(quote.deposit);
  summaryTargets.balance.textContent = formatCurrency(quote.balanceDue);
  packageLabel.textContent = `Selected package: ${leadContext.packageShown}`;
}

function applyPreset(button) {
  indoorInput.value = button.dataset.indoor || "1";
  outdoorInput.value = button.dataset.outdoor || "0";
  doorbellInput.value = button.dataset.doorbell || "0";
  leadContext.packageShown = button.dataset.package || DEFAULT_PACKAGE;
  leadContext.quoteId = createQuoteId();
  refreshSummary();
}

function persistQuote() {
  const quote = getQuoteState();
  const payload = {
    quoteId: leadContext.quoteId,
    leadSource: leadContext.leadSource,
    campaign: leadContext.campaign,
    packageShown: leadContext.packageShown,
    indoorCount: quote.indoorCount,
    outdoorCount: quote.outdoorCount,
    doorbellCount: quote.doorbellCount,
    totalCameras: quote.totalCameras,
    quotedTotal: quote.total,
    depositAmount: quote.deposit,
    balanceDue: quote.balanceDue,
    extendedSupport: extendedSupportInput.checked,
    difficultMounting: difficultMountingInput.checked,
  };

  window.sessionStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(payload));
}

function continueToBooking(event) {
  event.preventDefault();
  persistQuote();
  quoteButton.disabled = true;
  quoteButton.textContent = "Opening booking...";
  window.location.href = "/booking.html";
}

presetButtons.forEach((button) => {
  button.addEventListener("click", () => applyPreset(button));
});

[indoorInput, outdoorInput, doorbellInput, extendedSupportInput, difficultMountingInput].forEach((element) => {
  element.addEventListener("input", refreshSummary);
  element.addEventListener("change", refreshSummary);
});

form.addEventListener("submit", continueToBooking);

refreshSummary();
