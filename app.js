const byId = id => document.getElementById(id);
const field = (row, name) => row.querySelector(`[data-field="${name}"]`);
const format = (value, unit = "") => value === null ? "—" : value.toFixed(2) + unit;
const courses = byId("courses");
const assignments = byId("assignments");
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const departments = new Map();

for (const [index, course] of courseCatalog.entries()) {
  if (!departments.has(course.department)) departments.set(course.department, []);
  departments.get(course.department).push({ ...course, index });
}

function activateTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", selected);
    item.tabIndex = selected ? 0 : -1;
    byId(item.getAttribute("aria-controls")).hidden = !selected;
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", event => {
    const targets = {
      ArrowLeft: tabs[(index + tabs.length - 1) % tabs.length],
      ArrowRight: tabs[(index + 1) % tabs.length],
      Home: tabs[0],
      End: tabs.at(-1)
    };
    const target = targets[event.key];
    if (!target) return;
    event.preventDefault();
    activateTab(target);
    target.focus();
  });
});

function setError(row, message) {
  const error = row.querySelector("[data-error]");
  error.textContent = message;
  error.hidden = !message;
}

function updateGpa() {
  const grades = [];
  for (const row of courses.children) {
    const grade = field(row, "grade").value.trim();
    const points = gradePoints(grade);
    const type = field(row, "type").value;
    const invalidGrade = grade && points === null;
    setError(row, invalidGrade ? "Enter a letter grade or a percentage from 0 to 100." : "");
    if (points !== null) grades.push({ points, type });
  }
  const weighted = document.querySelector('[name="weighting"]:checked').value === "weighted";
  byId("gpa-result").textContent = format(calculateGpa(grades, weighted));
  byId("gpa-count").textContent = grades.length
    ? `${grades.length} ${grades.length === 1 ? "course" : "courses"} included`
    : "Enter a grade to see your GPA.";
}

function updateScores() {
  const scores = [];
  for (const row of assignments.children) {
    const earned = field(row, "earned").valueAsNumber;
    const possible = field(row, "possible").valueAsNumber;
    const kind = field(row, "kind").value;
    const valid = earned >= 0 && possible > 0;
    const started = !Number.isNaN(earned) || !Number.isNaN(possible);
    setError(row, started && !valid ? "Enter zero or more earned points and a positive possible score." : "");
    if (valid) scores.push({ earned, possible, kind });
  }
  const current = calculatePercentage(scores.filter(score => score.kind === "Graded"));
  byId("score-result").textContent = format(calculatePercentage(scores), "%");
  byId("score-count").textContent = scores.length
    ? `${scores.length} ${scores.length === 1 ? "score" : "scores"} included`
    : "Enter a score to see your predicted grade.";
  byId("current-score").textContent = current === null ? "" : `Current grade · ${format(current, "%")}`;
}

function configureCourse(row) {
  const select = field(row, "course");
  const department = field(row, "department");
  const sortedDepartments = [...departments.entries()].sort(([a], [b]) => a.localeCompare(b));
  department.add(new Option("All departments", ""));
  for (const [name] of sortedDepartments) department.add(new Option(name));

  function showCourses() {
    select.replaceChildren(new Option("Enter course manually", ""));
    for (const [name, entries] of sortedDepartments) {
      if (department.value && department.value !== name) continue;
      const group = document.createElement("optgroup");
      group.label = name;
      for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
        group.append(new Option(entry.name, entry.index));
      }
      select.append(group);
    }
  }

  showCourses();
  department.addEventListener("change", () => {
    showCourses();
    row.querySelector("[data-custom]").hidden = false;
    field(row, "type").value = "College Prep";
  });
  select.addEventListener("change", () => {
    const course = select.value === "" ? null : courseCatalog[Number(select.value)];
    row.querySelector("[data-custom]").hidden = Boolean(course);
    field(row, "type").value = course?.type ?? "College Prep";
  });
}

function labelRows(container, label) {
  Array.from(container.children).forEach((row, index) => {
    const name = `${label} ${index + 1}`;
    row.querySelector("legend").textContent = name;
    row.querySelector(".remove").setAttribute("aria-label", `Remove ${name.toLowerCase()}`);
  });
}

function addRow(container, label, update, { focus = false, predicted = false } = {}) {
  const row = byId(label === "Course" ? "course-template" : "assignment-template")
    .content.firstElementChild.cloneNode(true);
  if (label === "Course") configureCourse(row);
  if (predicted) field(row, "kind").value = "Predicted";
  row.addEventListener("input", update);
  row.addEventListener("change", update);
  row.querySelector(".remove").addEventListener("click", () => {
    const target = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    labelRows(container, label);
    update();
    container.dispatchEvent(new Event("change", { bubbles: true }));
    (target?.querySelector(".remove") || container.nextElementSibling).focus();
  });
  container.append(row);
  labelRows(container, label);
  if (focus) row.querySelector("input:not([type=number]), select").focus();
  return row;
}

byId("add-course").addEventListener("click", () => addRow(courses, "Course", updateGpa, { focus: true }));
byId("add-assignment").addEventListener("click", () => addRow(assignments, "Score", updateScores, { focus: true, predicted: true }));
document.querySelector(".toggle").addEventListener("change", updateGpa);
