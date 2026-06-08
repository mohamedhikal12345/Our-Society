const nodemailer = require("nodemailer");

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, //true for 465 // false for others
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendSMTPEmail = async (to, subject, text) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_USER, // sender address
      to, // list of recipients
      subject, // subject line
      text, // plain text body
    });

    console.log("Email send successfully! Message ID", info.messageId);
    // Preview URL is only available when using an Ethereal test account
  } catch (err) {
    console.error("Error while sending mail:", err);
  }
};
module.exports = sendSMTPEmail;
