import { NextApiRequest, NextApiResponse } from 'next';
import { sendLoginCode } from '../../../../src/utils/email';
import { getAdminEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';

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
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}