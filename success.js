const statusHeading = document.querySelector("#success-heading");
const statusCopy = document.querySelector("#success-copy");
const preloadRoot = document.documentElement;

async function confirmBookingFromSession() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  if (!sessionId) {
    statusHeading.textContent = "Booking received";
    statusCopy.textContent =
      "We received your appointment request. If your deposit confirmation takes a moment to sync, your booking details will update automatically after Stripe finishes processing.";
    preloadRoot.classList.remove("success-preload");
    return;
  }

  try {
    const response = await fetch(`/api/bookings/confirm?session_id=${encodeURIComponent(sessionId)}`);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to confirm your booking.");
    }

    const paymentStatus = result.booking?.paymentStatus || "awaiting_deposit";

    if (paymentStatus === "deposit_paid") {
      statusHeading.textContent = "Your deposit is confirmed.";
      statusCopy.textContent =
        "Your appointment request has been received and your deposit is confirmed. Keep your confirmation email for your records. The remaining balance is due after installation.";
      preloadRoot.classList.remove("success-preload");
      return;
    }

    if (paymentStatus === "deposit_processing") {
      statusHeading.textContent = "Your booking is being processed.";
      statusCopy.textContent =
        "Your appointment request was received, and your payment is still processing. This is normal for some bank payment methods. We’ll update your booking automatically as soon as Stripe confirms it.";
      preloadRoot.classList.remove("success-preload");
      return;
    }

    if (paymentStatus === "deposit_failed") {
      statusHeading.textContent = "Your booking was received.";
      statusCopy.textContent =
        "Your appointment request was submitted, but the deposit did not complete. Please try again or contact us if you need help finishing your booking.";
      preloadRoot.classList.remove("success-preload");
      return;
    }

    statusHeading.textContent = "Booking received";
    statusCopy.textContent =
      "Your appointment request was submitted. If your deposit confirmation takes a moment to sync, your booking details will update automatically after Stripe finishes processing.";
    preloadRoot.classList.remove("success-preload");
  } catch (error) {
    statusHeading.textContent = "Booking received";
    statusCopy.textContent =
      "Your appointment request was submitted, but the deposit confirmation is still syncing. You can refresh this page in a moment if needed.";
    preloadRoot.classList.remove("success-preload");
  }
}

confirmBookingFromSession();
