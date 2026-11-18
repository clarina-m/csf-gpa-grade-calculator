function gradePoints(value) {
  const grade = value.trim().toUpperCase();
  if (/^[ABCDF][+-]?$/.test(grade)) return 4 - "ABCDF".indexOf(grade[0]);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)\s*%?$/.test(grade)) return null;
  const percent = Number.parseFloat(grade);
  if (percent > 100) return null;
  return [90, 80, 70, 60].filter(cutoff => percent >= cutoff).length;
}

function calculateGpa(courses, weighted) {
  if (!courses.length) return null;
  const total = courses.reduce((sum, { points, type }) => {
    const advanced = type === "Honors" || type === "AP";
    return sum + points + (weighted && advanced && points > 0 ? 1 : 0);
  }, 0);
  return total / courses.length;
}

function calculatePercentage(scores) {
  const totals = scores.reduce((sum, { earned, possible }) => {
    sum.earned += earned;
    sum.possible += possible;
    return sum;
  }, { earned: 0, possible: 0 });
  return totals.possible ? totals.earned / totals.possible * 100 : null;
}
