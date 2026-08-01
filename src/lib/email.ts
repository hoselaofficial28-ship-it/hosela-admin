import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

export async function sendReminderEmail(to: string, taskTitle: string, deadline: string, description?: string) {
  if (!process.env.SMTP_USER) {
    console.log(`[Email Reminder] SMTP belum dikonfigurasi. Reminder untuk "${taskTitle}" ke ${to} dilewati.`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"Hosela Notion" <${process.env.SMTP_USER}>`,
      to,
      subject: `Pengingat: ${taskTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
          <div style="background: #4285f4; color: white; padding: 16px 20px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">Pengingat Tugas</h2>
          </div>
          <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <h3 style="margin: 0 0 8px; color: #1e293b;">${taskTitle}</h3>
            ${description ? `<p style="color: #64748b; margin: 0 0 12px;">${description}</p>` : ""}
            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 12px;">
              <strong style="color: #ef4444;">Deadline: ${deadline}</strong>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">Hosela Notion</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[Email Reminder] Gagal kirim:", err);
    return false;
  }
}
