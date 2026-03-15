/**
 * Admin Users tab — list, select, delete users.
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
  selectedItems,
  eventNameCache,
  usersTable,
  setUsersTable,
  usersDataCache,
  setUsersDataCache,
  updateSelectionCount,
} from "./state.js";
import { fetchEventNames } from "./events.js";

export async function loadUsers(forceRefresh = false) {
  const container = document.getElementById("usersTable");

  if (!forceRefresh && usersDataCache && usersTable) {
    return;
  }

  try {
    const q = query(
      collection(db, "users"),
      orderBy("best_score", "desc"),
      limit(500)
    );
    const snapshot = await getDocs(q);

    const userEventIds = [
      ...new Set(snapshot.docs.map((d) => d.data().event_id).filter(Boolean)),
    ];
    await fetchEventNames(userEventIds);

    const data = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        name: d.name || "N/A",
        event_id: d.event_id || "",
        event_name: d.event_id
          ? eventNameCache.get(d.event_id) || d.event_id
          : "N/A",
        total_uploads: d.total_uploads || 0,
        best_score: d.best_score ?? null,
        created_at: d.created_at?.seconds
          ? new Date(d.created_at.seconds * 1000)
          : null,
        deleted_at: d.deleted_at?.seconds
          ? new Date(d.deleted_at.seconds * 1000)
          : null,
      };
    });

    setUsersDataCache(data);

    if (usersTable) {
      usersTable.setData(data);
    } else {
      const table = new Tabulator("#usersTable", {
        data: data,
        layout: "fitDataFill",
        pagination: true,
        paginationSize: 30,
        paginationSizeSelector: [10, 30, 50, 100],
        selectable: true,
        columns: [
          {
            formatter: "rowSelection",
            titleFormatter: "rowSelection",
            hozAlign: "center",
            headerSort: false,
            width: 40,
          },
          { title: "Name", field: "name", sorter: "string", widthGrow: 2 },
          { title: "Event", field: "event_name", sorter: "string", width: 180 },
          {
            title: "Uploads",
            field: "total_uploads",
            sorter: "number",
            width: 100,
          },
          {
            title: "Best Score",
            field: "best_score",
            sorter: "number",
            width: 120,
            formatter: (cell) =>
              cell.getValue() != null ? Math.round(cell.getValue()) : "N/A",
          },
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
          {
            title: "Deleted",
            field: "deleted_at",
            width: 100,
            hozAlign: "center",
            formatter: (cell) => {
              const val = cell.getValue();
              if (val) {
                return '<span class="status-badge status-archived">Deleted</span>';
              }
              return "";
            },
          },
        ],
      });

      table.on("rowSelectionChanged", function (data) {
        selectedItems.users = new Set(data.map((d) => d.id));
        updateSelectionCount("users");
      });

      setUsersTable(table);
    }
  } catch (error) {
    console.error("Error loading users:", error);
    container.innerHTML = '<p class="loading">Error loading users</p>';
  }
}
