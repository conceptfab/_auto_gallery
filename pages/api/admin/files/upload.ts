import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailFromCookie } from '../../../../src/utils/auth';
import { ADMIN_EMAIL } from '../../../../src/config/constants';
import { generateUploadToken } from '../../../../src/utils/fileToken';

export const config = {
  api: {
    bodyParser: false, // Wyłącz domyślny parser dla multipart
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Sprawdź czy to admin
  const email = getEmailFromCookie(req);
  if (email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { folder = '' } = req.query;
  const folderPath = typeof folder === 'string' ? folder : '';

  try {
    // Generuj token
    const { token, expires, url } = generateUploadToken(folderPath);

    // Pobierz dane z requesta i przekaż do PHP
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Pobierz content-type z oryginalnego requesta
    const contentType = req.headers['content-type'] || '';

    // Stwórz nowy FormData z tokenem
    // Musimy przeparsować multipart i dodać token
    const boundary = contentType.split('boundary=')[1];
    
    if (!boundary) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    // Dodaj token do form data
    const tokenPart = `--${boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n${token}\r\n`;
    const expiresPart = `--${boundary}\r\nContent-Disposition: form-data; name="expires"\r\n\r\n${expires}\r\n`;
    const folderPart = `--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n${folderPath}\r\n`;
    
    // Usuń końcowy boundary i dodaj nowe pola
    const bodyStr = body.toString('binary');
    const lastBoundary = `--${boundary}--`;
    const bodyWithoutEnd = bodyStr.replace(lastBoundary, '');
    
    const newBody = tokenPart + expiresPart + folderPart + bodyWithoutEnd + lastBoundary;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body: Buffer.from(newBody, 'binary'),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}
