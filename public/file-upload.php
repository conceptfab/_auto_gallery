<?php
/**
 * File Upload API - Upload plików do prywatnego folderu
 */

// ============ KONFIGURACJA ============
define('PRIVATE_FILES_PATH', '/home/host372606/domains/conceptfab.com/content_browser/');
define('SECRET_KEY', 'fad2ebf6cfb0f9f625b15117f2849fd7ebad44f5c04cfd809787f861a6fa710b');
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm']);
define('MAX_FILE_SIZE', 100 * 1024 * 1024); // 100MB
// ======================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die(json_encode(['error' => 'Method not allowed']));
}

// Pobierz parametry
$folder = isset($_POST['folder']) ? $_POST['folder'] : '';
$token = isset($_POST['token']) ? $_POST['token'] : '';
$expires = isset($_POST['expires']) ? intval($_POST['expires']) : 0;

// Walidacja tokenu
if (empty($token) || $expires === 0) {
    http_response_code(401);
    die(json_encode(['error' => 'Missing token']));
}

if (time() > $expires) {
    http_response_code(403);
    die(json_encode(['error' => 'Token expired']));
}

$expectedToken = hash_hmac('sha256', 'upload|' . $folder . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'Invalid token']));
}

// Sprawdź czy jest plik
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE => 'File too large (server limit)',
        UPLOAD_ERR_FORM_SIZE => 'File too large (form limit)',
        UPLOAD_ERR_PARTIAL => 'File partially uploaded',
        UPLOAD_ERR_NO_FILE => 'No file uploaded',
        UPLOAD_ERR_NO_TMP_DIR => 'Missing temp folder',
        UPLOAD_ERR_CANT_WRITE => 'Failed to write file',
        UPLOAD_ERR_EXTENSION => 'Upload blocked by extension'
    ];
    $errorCode = isset($_FILES['file']) ? $_FILES['file']['error'] : UPLOAD_ERR_NO_FILE;
    http_response_code(400);
    die(json_encode(['error' => $errorMessages[$errorCode] ?? 'Upload error']));
}

$file = $_FILES['file'];

// Sprawdź rozmiar
if ($file['size'] > MAX_FILE_SIZE) {
    http_response_code(400);
    die(json_encode(['error' => 'File too large (max 100MB)']));
}

// Sprawdź rozszerzenie
$extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
if (!in_array($extension, ALLOWED_EXTENSIONS)) {
    http_response_code(400);
    die(json_encode(['error' => 'File type not allowed: ' . $extension]));
}

// Zabezpieczenie przed path traversal
$folder = str_replace(['..', "\0"], '', $folder);
$folder = trim($folder, '/');

// Bezpieczna nazwa pliku
$filename = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $file['name']);
$filename = preg_replace('/_+/', '_', $filename);

$targetDir = PRIVATE_FILES_PATH . ($folder ? $folder . '/' : '');
$targetPath = $targetDir . $filename;

// Sprawdź czy folder docelowy istnieje
if (!is_dir($targetDir)) {
    http_response_code(404);
    die(json_encode(['error' => 'Target folder not found']));
}

// Jeśli plik już istnieje, dodaj numer
$counter = 1;
$baseName = pathinfo($filename, PATHINFO_FILENAME);
while (file_exists($targetPath)) {
    $filename = $baseName . '_' . $counter . '.' . $extension;
    $targetPath = $targetDir . $filename;
    $counter++;
}

// Przenieś plik
if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
    http_response_code(500);
    die(json_encode(['error' => 'Failed to save file']));
}

// Ustaw uprawnienia
chmod($targetPath, 0644);

echo json_encode([
    'success' => true,
    'filename' => $filename,
    'path' => ($folder ? $folder . '/' : '') . $filename,
    'size' => $file['size']
]);
