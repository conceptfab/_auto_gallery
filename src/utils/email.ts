import * as nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for 587
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 30000, // 30 sekund (skrócone)
  greetingTimeout: 15000, // 15 sekund (skrócone)
  socketTimeout: 30000 // 30 sekund (skrócone)
});

// Test połączenia SMTP przy starcie z timeout
const testConnection = async () => {
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP verification timeout after 30 seconds')), 30000)
    );
    
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        transporter.verify((error, success) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
      timeoutPromise
    ]);
    
    console.log('✅ Serwer SMTP jest gotowy do wysyłania emaili');
  } catch (error) {
    console.error('❌ Błąd konfiguracji SMTP:', error);
    console.log('💡 Sprawdź konfigurację SMTP w zmiennych środowiskowych');
    console.log('💡 Sprawdź czy port 587 nie jest blokowany przez firewall');
  }
};

// Uruchom test asynchronicznie
testConnection();

export async function sendAdminNotification(email: string, ip: string): Promise<void> {
  const adminEmail = 'michal@conceptfab.com';
  
  console.log('📧 Próba wysłania emaila do admina:', adminEmail);
  console.log('📧 Konfiguracja SMTP:', {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    hasPassword: !!process.env.SMTP_PASS
  });
  
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

  try {
    // Dodaj timeout dla całej operacji
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send operation timed out after 45 seconds')), 45000)
    );
    
    const result = await Promise.race([
      transporter.sendMail(mailOptions),
      timeoutPromise
    ]);
    
    console.log('✅ Email wysłany pomyślnie:', (result as any).messageId);
  } catch (error) {
    console.error('❌ Błąd wysyłania emaila do admina:', error);
    
    // Loguj dodatkowe informacje o błędzie
    if (error && typeof error === 'object') {
      console.error('Error details:', {
        code: (error as any).code,
        command: (error as any).command,
        message: (error as any).message
      });
    }
    
    throw error;
  }
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  console.log('📧 Próba wysłania kodu do użytkownika:', email);
  
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

  try {
    // Dodaj timeout dla całej operacji
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send operation timed out after 45 seconds')), 45000)
    );
    
    const result = await Promise.race([
      transporter.sendMail(mailOptions),
      timeoutPromise
    ]);
    
    console.log('✅ Kod wysłany pomyślnie do:', email, 'MessageID:', (result as any).messageId);
  } catch (error) {
    console.error('❌ Błąd wysyłania kodu do:', email, error);
    
    // Loguj dodatkowe informacje o błędzie
    if (error && typeof error === 'object') {
      console.error('Error details:', {
        code: (error as any).code,
        command: (error as any).command,
        message: (error as any).message
      });
    }
    
    throw error;
  }
}