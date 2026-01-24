import { NextApiRequest, NextApiResponse } from 'next';
import { sendLoginCode } from '../../../../src/utils/email';

const ADMIN_EMAIL = 'michal@conceptfab.com';

function getAdminEmailFromCookie(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  
  const emailMatch = cookies.match(/admin_email=([^;]*)/);
  const loggedMatch = cookies.match(/admin_logged=([^;]*)/);
  
  if (emailMatch && loggedMatch && loggedMatch[1] === 'true' && emailMatch[1] === ADMIN_EMAIL) {
    return emailMatch[1];
  }
  
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Sprawdź autoryzację administratora
    const adminEmail = getAdminEmailFromCookie(req);
    if (!adminEmail) {
      return res.status(403).json({ error: 'Admin authorization required' });
    }

    const { testEmail } = req.body;
    const emailToTest = testEmail || adminEmail;

    console.log('🧪 Test emaila na adres:', emailToTest);

    // Wyślij testowy email
    const testCode = 'TEST123';
    await sendLoginCode(emailToTest, testCode);

    console.log('✅ Email testowy wysłany pomyślnie');

    res.status(200).json({ 
      message: 'Test email sent successfully',
      sentTo: emailToTest,
      testCode: testCode
    });

  } catch (error) {
    console.error('❌ Błąd wysyłania testu emaila:', error);
    res.status(500).json({ 
      error: 'Failed to send test email',
      details: error.message
    });
  }
}