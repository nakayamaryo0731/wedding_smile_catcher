/**
 * Shared mutable state and cross-cutting UI helpers for admin modules.
 */

import { escapeHtml } from "../utils.js";

// Selection state for bulk operations
export const selectedItems = {
  images: new Set(),
  users: new Set(),
  events: new Set(),
};

export let currentTab = "images";
export function setCurrentTab(tab) {
  currentTab = tab;
}

// Confirm modal state
let pendingDeleteAction = null;

// Caches
export const userNameCache = new Map();
export const eventNameCache = new Map();

// Current event filter for images tab
export let currentEventFilter = "";
export function setCurrentEventFilter(value) {
  currentEventFilter = value;
}

// Admin flag and current user
export let isAdminUser = false;
export function setIsAdminUser(value) {
  isAdminUser = value;
}

export let currentUser = null;
export function setCurrentUser(value) {
  currentUser = value;
}

// Table instances
export let imagesTable = null;
export function setImagesTable(value) {
  imagesTable = value;
}

export let usersTable = null;
export function setUsersTable(value) {
  usersTable = value;
}

export let accountsTable = null;
export function setAccountsTable(value) {
  accountsTable = value;
}

export let applicationsTable = null;
export function setApplicationsTable(value) {
  applicationsTable = value;
}

// Data caches
export let imagesDataCache = null;
export function setImagesDataCache(value) {
  imagesDataCache = value;
}

export let usersDataCache = null;
export function setUsersDataCache(value) {
  usersDataCache = value;
}

export let accountsDataCache = null;
export function setAccountsDataCache(value) {
  accountsDataCache = value;
}

export let applicationsDataCache = null;
export function setApplicationsDataCache(value) {
  applicationsDataCache = value;
}

// Application detail modal
export let currentApplicationId = null;
export function setCurrentApplicationId(value) {
  currentApplicationId = value;
}

// Statistics chart instance
export let cumulativeChartInstance = null;
export function setCumulativeChartInstance(value) {
  cumulativeChartInstance = value;
}

/**
 * Update selection count badges and enable/disable action buttons.
 * @param {"images"|"users"|"events"} type
 */
export function updateSelectionCount(type) {
  const count = selectedItems[type].size;
  document.getElementById(
    `selected${type.charAt(0).toUpperCase() + type.slice(1)}Count`
  ).textContent = count;
  document.getElementById(
    `deleteSelected${type.charAt(0).toUpperCase() + type.slice(1)}`
  ).disabled = count === 0;

  if (type === "images") {
    document.getElementById("downloadImagesCount").textContent = count;
    document.getElementById("downloadSelectedImages").disabled = count === 0;
  }
}

/**
 * Show the confirm modal and return a promise that resolves to true/false.
 * @param {"status-change"|"test-data"|string} type
 * @param {string|number} countOrMessage
 * @returns {Promise<boolean>}
 */
export function showConfirmModal(type, countOrMessage) {
  const modal = document.getElementById("confirmModal");
  const message = document.getElementById("confirmMessage");
  const title = document.getElementById("confirmTitle");
  const confirmBtn = document.getElementById("confirmDelete");

  if (type === "status-change") {
    title.textContent = "Confirm Status Change";
    confirmBtn.textContent = "Confirm";
    confirmBtn.className = "btn-primary";
    message.innerHTML = escapeHtml(countOrMessage).replace(/\n/g, "<br>");
  } else if (type === "test-data") {
    title.textContent = "Confirm Deletion";
    confirmBtn.textContent = "Delete";
    confirmBtn.className = "btn-danger";
    message.innerHTML = escapeHtml(countOrMessage).replace(/\n/g, "<br>");
  } else {
    title.textContent = "Confirm Deletion";
    confirmBtn.textContent = "Delete";
    confirmBtn.className = "btn-danger";
    message.innerHTML = `Are you sure you want to delete <strong>${escapeHtml(countOrMessage)}</strong> ${escapeHtml(type)}?<br><br>This action cannot be undone.`;
  }

  modal.classList.add("show");

  return new Promise((resolve) => {
    pendingDeleteAction = resolve;
  });
}

export function hideConfirmModal() {
  const modal = document.getElementById("confirmModal");
  modal.classList.remove("show");
  pendingDeleteAction = null;
}

export function resolvePendingAction(value) {
  if (pendingDeleteAction) {
    pendingDeleteAction(value);
    hideConfirmModal();
  }
}
