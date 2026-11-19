export function getBookingStatus(startDate, endDate, now = new Date()) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end <= today) {
    return "completed";
  }
  if (start <= today) {
    return "ongoing";
  }
  return "upcoming";
}
