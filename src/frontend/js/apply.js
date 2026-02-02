// Initialize Firebase
firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();

// DOM Elements
const form = document.getElementById("applicationForm");
const submitBtn = document.getElementById("submitBtn");
const formScreen = document.querySelector(".form-screen");
const successScreen = document.querySelector(".success-screen");
const startTimeSelect = document.getElementById("startTime");
const endTimeSelect = document.getElementById("endTime");
const eventDateInput = document.getElementById("eventDate");
const timeError = document.getElementById("timeError");

// Generate time options (30-minute intervals)
function generateTimeOptions() {
  const times = [];
  for (let hour = 9; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const h = hour.toString().padStart(2, "0");
      const m = minute.toString().padStart(2, "0");
      times.push(`${h}:${m}`);
    }
  }
  return times;
}

// Populate time select elements
function populateTimeSelects() {
  const times = generateTimeOptions();

  times.forEach((time) => {
    const startOption = document.createElement("option");
    startOption.value = time;
    startOption.textContent = time;
    startTimeSelect.appendChild(startOption);

    const endOption = document.createElement("option");
    endOption.value = time;
    endOption.textContent = time;
    endTimeSelect.appendChild(endOption);
  });

  // Set default values (14:00 - 17:00)
  startTimeSelect.value = "14:00";
  endTimeSelect.value = "17:00";
}

// Set minimum date to today
function setMinDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  eventDateInput.min = `${yyyy}-${mm}-${dd}`;
}

// Validate time range
function validateTimeRange() {
  const startTime = startTimeSelect.value;
  const endTime = endTimeSelect.value;

  if (startTime && endTime) {
    const isValid = startTime < endTime;
    timeError.classList.toggle("hidden", isValid);
    return isValid;
  }
  return true;
}

// Form validation
function validateForm() {
  const isFormValid = form.checkValidity();
  const isTimeValid = validateTimeRange();
  return isFormValid && isTimeValid;
}

// Get form data
function getFormData() {
  return {
    groom_name: document.getElementById("groomName").value.trim(),
    bride_name: document.getElementById("brideName").value.trim(),
    email: document.getElementById("email").value.trim(),
    event_date: document.getElementById("eventDate").value,
    start_time: startTimeSelect.value,
    end_time: endTimeSelect.value,
    guest_count: document.getElementById("guestCount").value,
    venue_name: document.getElementById("venueName").value.trim(),
    referral_source: document.getElementById("referralSource").value,
    questions: document.getElementById("questions").value.trim(),
    status: "pending",
    event_id: null,
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
  };
}

// Submit application
async function submitApplication(data) {
  try {
    const docRef = await db.collection("applications").add(data);
    console.log("Application submitted with ID:", docRef.id);

    // Send notification to admin (fire and forget - don't block on failure)
    sendAdminNotification(data).catch((err) => {
      console.warn("Failed to send admin notification:", err);
    });

    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("Error submitting application:", error);
    return { success: false, error: error.message };
  }
}

// Send LINE notification to admin
async function sendAdminNotification(data) {
  if (!window.APPLICATION_NOTIFY_URL) {
    console.log("APPLICATION_NOTIFY_URL not configured, skipping notification");
    return;
  }

  const response = await fetch(window.APPLICATION_NOTIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      groom_name: data.groom_name,
      bride_name: data.bride_name,
      event_date: data.event_date,
      start_time: data.start_time,
      end_time: data.end_time,
      guest_count: data.guest_count,
    }),
  });

  if (!response.ok) {
    throw new Error(`Notification failed: ${response.status}`);
  }

  console.log("Admin notification sent successfully");
}

// Show success screen
function showSuccessScreen() {
  formScreen.classList.add("hide");
  successScreen.classList.add("show");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Handle form submit
async function handleSubmit(e) {
  e.preventDefault();

  if (!validateForm()) {
    // Show validation errors
    form.reportValidity();
    return;
  }

  // Disable submit button and show loading state
  submitBtn.disabled = true;
  submitBtn.classList.add("btn-loading");

  const formData = getFormData();
  const result = await submitApplication(formData);

  if (result.success) {
    showSuccessScreen();
  } else {
    alert("送信に失敗しました。もう一度お試しください。");
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-loading");
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  populateTimeSelects();
  setMinDate();

  // Event listeners
  form.addEventListener("submit", handleSubmit);
  startTimeSelect.addEventListener("change", validateTimeRange);
  endTimeSelect.addEventListener("change", validateTimeRange);

  // Real-time validation for time inputs
  [startTimeSelect, endTimeSelect].forEach((select) => {
    select.addEventListener("change", () => {
      if (startTimeSelect.value && endTimeSelect.value) {
        validateTimeRange();
      }
    });
  });
});
