const guestStorageKey = "nd-csf-guest-dashboard-v1";
const emptyDashboard = { courses: [{}], assignments: [{}, { kind: "Predicted" }], weighting: "unweighted" };
let guestDashboard = readGuestDashboard();

function validDashboard(data) {
  const validRows = rows => Array.isArray(rows) && rows.every(row =>
    row && typeof row === "object" && !Array.isArray(row) &&
    Object.values(row).every(value => typeof value === "string")
  );
  return validRows(data?.courses) && validRows(data?.assignments);
}

function readGuestDashboard() {
  try {
    const saved = JSON.parse(localStorage.getItem(guestStorageKey));
    if (validDashboard(saved)) return saved;
    const previous = JSON.parse(localStorage.getItem("nd-csf-workspaces-v1"));
    const active = previous?.workspaces?.find(item => item.id === previous.activeId);
    if (validDashboard(active)) return active;
  } catch {
    // Guests can still calculate when browser storage is unavailable.
  }
  return emptyDashboard;
}

function snapshotRows(container) {
  return Array.from(container.children, row => {
    const values = Object.fromEntries(
      Array.from(row.querySelectorAll("[data-field]"), input => [input.dataset.field, input.value])
    );
    if (values.course) {
      const course = courseCatalog[Number(values.course)];
      values.course = course ? `${course.department}|${course.name}` : "";
    }
    return values;
  });
}

function restoreRows(container, records, label, update) {
  container.replaceChildren();
  for (const values of records) {
    const row = addRow(container, label, update);
    if (label === "Course") {
      field(row, "department").value = values.department || "";
      field(row, "department").dispatchEvent(new Event("change"));
      const index = courseCatalog.findIndex(course => `${course.department}|${course.name}` === values.course);
      field(row, "course").value = index >= 0 ? String(index) : "";
      if (!field(row, "course").value) field(row, "course").value = "";
      field(row, "course").dispatchEvent(new Event("change"));
    }
    for (const input of row.querySelectorAll("[data-field]")) {
      const key = input.dataset.field;
      if (key !== "course" && key !== "department" && typeof values[key] === "string") {
        input.value = key === "type" && values[key] === "Regular" ? "College Prep" : values[key];
      }
    }
    if (label === "Course" && values.course && !field(row, "course").value && !values.name) {
      field(row, "name").value = values.course.split("|").slice(1).join("|");
    }
  }
  update();
}

function captureDashboard() {
  return {
    courses: snapshotRows(courses),
    assignments: snapshotRows(assignments),
    weighting: document.querySelector('[name="weighting"]:checked').value
  };
}

function showDashboard(dashboard) {
  restoreRows(courses, dashboard.courses, "Course", updateGpa);
  restoreRows(assignments, dashboard.assignments, "Score", updateScores);
  const weighting = dashboard.weighting === "weighted" ? "weighted" : "unweighted";
  document.querySelector(`[name="weighting"][value="${weighting}"]`).checked = true;
  updateGpa();
}

function saveGuestDashboard() {
  guestDashboard = captureDashboard();
  try {
    localStorage.setItem(guestStorageKey, JSON.stringify(guestDashboard));
    return true;
  } catch {
    return false;
  }
}

for (const panel of document.querySelectorAll('[role="tabpanel"]')) {
  const changed = () => document.dispatchEvent(new Event("dashboard-change"));
  panel.addEventListener("input", changed);
  panel.addEventListener("change", changed);
  panel.addEventListener("click", event => {
    if (event.target.matches(".add")) changed();
  });
}
showDashboard(guestDashboard);
