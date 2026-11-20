import nodemailer from "nodemailer";

export function isSmtpConfigured(environment = process.env) {
  const port = Number(environment.SMTP_PORT || 587);
  return Boolean(
    environment.SMTP_HOST?.trim() &&
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535 &&
      environment.SMTP_USER?.trim() &&
      environment.SMTP_PASSWORD &&
      environment.SMTP_FROM?.trim(),
  );
}

export function createBookingCompletionMailer(
  environment = process.env,
  createTransport = nodemailer.createTransport,
) {
  if (!isSmtpConfigured(environment)) {
    return {
      isConfigured: false,
      async sendMail() {
        throw new Error(
          "Completion email delivery requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.",
        );
      },
    };
  }

  const port = Number(environment.SMTP_PORT || 587);
  const transporter = createTransport({
    host: environment.SMTP_HOST.trim(),
    port,
    secure: environment.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: environment.SMTP_USER.trim(),
      pass: environment.SMTP_PASSWORD,
    },
  });

  return {
    isConfigured: true,
    async sendMail({ to, subject, text }) {
      await transporter.sendMail({
        from: environment.SMTP_FROM.trim(),
        to,
        subject,
        text,
      });
    },
  };
}

export function createBookingCompletionEmail({
  recipientName,
  equipmentName,
  startDate,
  endDate,
  recipientRole,
}) {
  const roleLabel = recipientRole === "owner" ? "Owner" : "Renter";
  return {
    subject: "Your GearRent rental is complete",
    text: [
      `Hello ${recipientName || roleLabel},`,
      "",
      `The rental of ${equipmentName} has been completed.`,
      `Rental period: ${new Date(startDate).toISOString().slice(0, 10)} to ${new Date(endDate).toISOString().slice(0, 10)}.`,
      "",
      "Thank you for using GearRent.",
    ].join("\n"),
  };
}
