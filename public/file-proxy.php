<?php
/**
 * File Proxy - Bezpieczne serwowanie plików z autoryzacją tokenem
 * 
 * INSTALACJA:
 * 1. Skopiuj ten plik do public_html/ na serwerze
 * 2. Przenieś pliki galerii do folderu POZA public_html (np. /home/user/private_gallery/)
 * 3. Ustaw PRIVATE_FILES_PATH poniżej
 * 4. Ustaw ten sam SECRET_KEY w Next.js (.env: FILE_PROXY_SECRET)
 */

// ============ KONFIGURACJA ============
// Ścieżka do prywatnych plików (POZA public_html!)
define('PRIVATE_FILES_PATH', '/home/host372606/domains/conceptfab.com/content_browser/');

// Sekret do weryfikacji tokenów (MUSI być taki sam jak w Next.js)
define('SECRET_KEY', 'fad2ebf6cfb0f9f625b15117f2849fd7ebad44f5c04cfd809787f861a6fa710b');

// Czas ważności tokenu w sekundach (2 godziny)
define('TOKEN_EXPIRY', 7200);

// Dozwolone rozszerzenia plików
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'pdf']);
// ======================================

// Nagłówki CORS (dostosuj do swojej domeny)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

// Pobierz parametry
$file = isset($_GET['file']) ? $_GET['file'] : '';
$token = isset($_GET['token']) ? $_GET['token'] : '';
$expires = isset($_GET['expires']) ? intval($_GET['expires']) : 0;

// Walidacja parametrów
if (empty($file) || empty($token) || $expires === 0) {
    http_response_code(400);
    die('Bad request: missing parameters');
}

// Sprawdź czy token nie wygasł
if (time() > $expires) {
    http_response_code(403);
    die('Token expired');
}

// Weryfikuj token
$expectedToken = hash_hmac('sha256', $file . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die('Invalid token');
}

// Zabezpieczenie przed path traversal
$file = str_replace(['..', "\0"], '', $file);
$file = ltrim($file, '/');

// Sprawdź rozszerzenie
$extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
if (!in_array($extension, ALLOWED_EXTENSIONS)) {
    http_response_code(403);
    die('File type not allowed');
}

// Pełna ścieżka do pliku
$filePath = PRIVATE_FILES_PATH . $file;

// Sprawdź czy plik istnieje
if (!file_exists($filePath) || !is_file($filePath)) {
    http_response_code(404);
    die('File not found');
}

// Określ Content-Type
$mimeTypes = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'svg' => 'image/svg+xml',
    'mp4' => 'video/mp4',
    'webm' => 'video/webm',
    'pdf' => 'application/pdf'
];

$contentType = isset($mimeTypes[$extension]) ? $mimeTypes[$extension] : 'application/octet-stream';

// Wyślij plik
header('Content-Type: ' . $contentType);
header('Content-Length: ' . filesize($filePath));
header('Cache-Control: private, max-age=3600');
header('Content-Disposition: inline; filename="' . basename($file) . '"');

readfile($filePath);
exit;
