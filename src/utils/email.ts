import { Resend } from 'resend';
import { ADMIN_EMAIL, EMAIL_FROM, ADMIN_PANEL_URL } from '@/src/config/constants';
import { logger } from '@/src/utils/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

// Test konfiguracji Resend przy starcie
const testConnection = async () => {
  try {
    logger.debug('Sprawdzanie konfiguracji Resend', {
      hasKey: !!process.env.RESEND_API_KEY,
      keyLength: process.env.RESEND_API_KEY?.length || 0,
      startsWithRe: process.env.RESEND_API_KEY?.startsWith('re_')
    });
    
    if (!process.env.RESEND_API_KEY) {
      logger.error('Brak klucza API Resend w zmiennych środowiskowych');
      logger.info('Dodaj RESEND_API_KEY do zmiennych środowiskowych');
      return;
    }
    
    if (!process.env.RESEND_API_KEY.startsWith('re_')) {
      logger.error('Nieprawidłowy format klucza API Resend (powinien zaczynać się od "re_")');
      return;
    }
    
    logger.info('Resend API jest skonfigurowany');
  } catch (error) {
    logger.error('Błąd konfiguracji Resend', error);
  }
};

// Uruchom test asynchronicznie
testConnection();

export async function sendAdminNotification(email: string, ip: string): Promise<void> {
  logger.emailEvent('sending admin notification', ADMIN_EMAIL);
  
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: ADMIN_EMAIL,
      subject: '[ADMIN] Nowy wniosek o dostęp - Content Browser',
      html: `
        <h2>Nowy wniosek o dostęp do Content Browser</h2>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleString('pl-PL')}</p>
        
        <p>Aby zatwierdzić lub odrzucić wniosek, przejdź do panelu administracyjnego:</p>
        <a href="${ADMIN_PANEL_URL}" 
           style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
          Panel Administracyjny
        </a>
      `,
    });
    
    logger.emailEvent('admin notification sent successfully', ADMIN_EMAIL, result.data?.id);
  } catch (error) {
    logger.error('Failed to send admin notification', error);
    throw error;
  }
}

export async function sendLoginCode(email: string, code: string): Promise<void> {
  logger.emailEvent('sending login code', email);
  
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
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
    
    logger.emailEvent('login code sent successfully', email, result.data?.id);
  } catch (error) {
    logger.error('Failed to send login code to', email, error);
    throw error;
  }
}

export async function sendAdminLoginCode(email: string, code: string): Promise<void> {
  logger.emailEvent('sending admin login code', email);
  
  try {
    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: '[ADMIN] Kod dostępu do Content Browser',
      html: `
        <h2>Twój kod dostępu administratora do Content Browser</h2>
        <p>Witaj Administratorze!</p>
        <p>Oto Twój kod dostępu:</p>
        
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
          <h1 style="color: #333; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h1>
        </div>
        
        <p><strong>Ważne:</strong> Ten kod jest ważny przez <strong>15 minut</strong> od momentu otrzymania tej wiadomości.</p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          Jeśli nie prosiłeś o dostęp, zignoruj tę wiadomość.
        </p>
      `,
    });
    
    logger.emailEvent('admin login code sent successfully', email, result.data?.id);
  } catch (error) {
    logger.error('Failed to send admin login code to', email, error);
    throw error;
  }
}