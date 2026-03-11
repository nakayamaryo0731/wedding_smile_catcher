/**
 * Admin Accounts tab — list admin/customer accounts.
 */

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../firebase-init.js";
import {
  accountsTable,
  setAccountsTable,
  accountsDataCache,
  setAccountsDataCache,
} from "./state.js";

export async function loadAccounts(forceRefresh = false) {
  const container = document.getElementById("accountsTable");
  if (!container) return;

  if (!forceRefresh && accountsDataCache && accountsTable) {
    return;
  }

  try {
    const q = query(
      collection(db, "accounts"),
      orderBy("created_at", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        email: d.email || "N/A",
        display_name: d.display_name || "N/A",
        is_admin: d.is_admin === true,
        status: d.status || "active",
        created_at: d.created_at?.seconds
          ? new Date(d.created_at.seconds * 1000)
          : null,
      };
    });

    setAccountsDataCache(data);

    if (accountsTable) {
      accountsTable.setData(data);
    } else {
      const table = new Tabulator("#accountsTable", {
        data: data,
        layout: "fitDataFill",
        pagination: true,
        paginationSize: 30,
        paginationSizeSelector: [10, 30, 50, 100],
        columns: [
          { title: "Email", field: "email", sorter: "string", widthGrow: 2 },
          {
            title: "Role",
            field: "is_admin",
            width: 100,
            hozAlign: "center",
            formatter: (cell) => {
              const isAdmin = cell.getValue();
              return isAdmin
                ? '<span class="status-badge status-active">Admin</span>'
                : '<span class="status-badge status-draft">Customer</span>';
            },
          },
          { title: "Status", field: "status", width: 100 },
          {
            title: "Created",
            field: "created_at",
            width: 160,
            sorter: (a, b) => {
              if (!a) return 1;
              if (!b) return -1;
              return a.getTime() - b.getTime();
            },
            formatter: (cell) => {
              const val = cell.getValue();
              return val ? val.toLocaleString("ja-JP") : "N/A";
            },
          },
        ],
      });

      setAccountsTable(table);
    }
  } catch (error) {
    console.error("Error loading accounts:", error);
    container.innerHTML = '<p class="loading">Error loading accounts</p>';
  }
}
