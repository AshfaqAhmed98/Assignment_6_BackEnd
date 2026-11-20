export function getUtcMonthWindow(now = new Date(), monthCount = 12) {
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - monthCount + index + 1,
        1,
      ),
    );
    return date.toISOString().slice(0, 7);
  });

  return {
    startDate: new Date(`${months[0]}-01T00:00:00.000Z`),
    months,
  };
}

export function fillMonthlyAnalytics(rows, valueField, now = new Date()) {
  const { months } = getUtcMonthWindow(now);
  const valuesByMonth = new Map(
    rows.map((row) => [row._id, row[valueField]]),
  );

  return months.map((month) => ({
    month,
    [valueField]: valuesByMonth.get(month) ?? 0,
  }));
}
