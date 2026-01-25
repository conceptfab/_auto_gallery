import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Test konfiguracji Resend przy starcie
const testConnection = async () => {
  try {
    console.log('🔍 Sprawdzanie konfiguracji Resend...');
    console.log('RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
    console.log('RESEND_API_KEY length:', process.env.RESEND_API_KEY?.length || 0);
    console.log('RESEND_API_KEY starts with re_:', process.env.RESEND_API_KEY?.startsWith('re_'));
    
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ Brak klucza API Resend w zmiennych środowiskowych');
      console.log('💡 Dodaj RESEND_API_KEY do zmiennych środowiskowych');
      return;
    }
    
    if (!process.env.RESEND_API_KEY.startsWith('re_')) {
      console.error('❌ Nieprawidłowy format klucza API Resend (powinien zaczynać się od "re_")');
      return;
    }
    
    console.log('✅ Resend API jest skonfigurowany');
  } catch (error) {
    console.error('❌ Błąd konfiguracji Resend:', error);
  }
};

// Uruchom test asynchronicznie
testConnection();

export async function sendAdminNotification(email: string, ip: string): Promise<void> {
  const adminEmail = 'michal@conceptfab.com';
  
  console.log('📧 Próba wysłania emaila do admina:', adminEmail);
  console.log('📧 Używanie Resend API');
  
  try {
    const result = await resend.emails.send({
      from: 'Content Browser <no-reply@conceptfab.com>',
      to: adminEmail,
      subject: 'Nowy wniosek o dostęp - Content Browser',
      html: `
        <h2>Nowy wniosek o dostęp do Content Browser</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</p>
        
        <p>Aby zatwierdzić lub odrzucić wniosek, przejdź do panelu administracyjnego:</p>
        <a href="https://app.conceptfab.com/admin" 
           style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          Panel Administracyjny
        </a>
      `,
    });
    
    console.log('✅ Email wysłany pomyślnie:', result.data?.id);
  } catch (error) {
    console.error('❌ Błąd wysyłania emaila do admina:', error);
    throw error;
  }
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  console.log('📧 Próba wysłania kodu do użytkownika:', email);
  console.log('📧 Używanie Resend API');
  
  try {
    const result = await resend.emails.send({
      from: 'Content Browser <no-reply@conceptfab.com>',
      to: email,
      subject: 'Kod dostępu do Content Browser',
      html: `
        <h2>Twój kod dostępu do Content Browser</h2>
        <p>Witaj!</p>
        <p>Twój wniosek o dostęp został zatwierdzony. Oto Twój kod dostępu:</p>
        
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
          <h1 style="color: #333; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h1>
        </div>
        
        <p><strong>Ważne:</strong> Ten kod jest ważny przez <strong>15 minut</strong> od momentu otrzymania tej wiadomości.</p>
        
        <p>Aby się zalogować, wejdź na stronę i wprowadź swój email oraz powyższy kod.</p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Jeśli nie prosiłeś o dostęp, zignoruj tę wiadomość.
        </p>
      `,
    });
    
    console.log('✅ Kod wysłany pomyślnie do:', email, 'ID:', result.data?.id);
  } catch (error) {
    console.error('❌ Błąd wysyłania kodu do:', email, error);
    throw error;
  }
}