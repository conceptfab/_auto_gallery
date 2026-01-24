import * as nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendAdminNotification(email: string, ip: string): Promise<void> {
  const adminEmail = 'michal@conceptfab.com';
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: adminEmail,
    subject: 'Nowy wniosek o dostęp - AutoGallery',
    html: `
      <h2>Nowy wniosek o dostęp do AutoGallery</h2>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>IP:</strong> ${ip}</p>
      <p><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</p>
      
      <p>Aby zatwierdzić lub odrzucić wniosek, przejdź do panelu administracyjnego:</p>
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/admin" 
         style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
        Panel Administracyjny
      </a>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Kod dostępu do AutoGallery',
    html: `
      <h2>Twój kod dostępu do AutoGallery</h2>
      <p>Witaj!</p>
      <p>Twój wniosek o dostęp został zatwierdzony. Oto Twój kod dostępu:</p>
      
      <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
        <h1 style="color: #333; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h1>
      </div>
      
      <p><strong>Ważne:</strong> Ten kod jest ważny przez <strong>15 minut</strong> od momentu otrzymania tej wiadomości.</p>
      
      <p>Aby się zalogować, wejdź na stronę i wprowadź swój email oraz powyższy kod.</p>
      
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/login" 
         style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
        Zaloguj się
      </a>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        Jeśli nie prosiłeś o dostęp, zignoruj tę wiadomość.
      </p>
    `,
  };

  await transporter.sendMail(mailOptions);
}