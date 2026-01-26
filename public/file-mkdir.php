<?php
/**
 * File Mkdir API - Tworzenie nowych folderów
 */

// ============ KONFIGURACJA ============
define('PRIVATE_FILES_PATH', '/home/host372606/domains/conceptfab.com/content_browser/');
define('SECRET_KEY', 'fad2ebf6cfb0f9f625b15117f2849fd7ebad44f5c04cfd809787f861a6fa710b');
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

// Pobierz dane JSON
$input = json_decode(file_get_contents('php://input'), true);

$parentFolder = isset($input['parentFolder']) ? $input['parentFolder'] : '';
$folderName = isset($input['folderName']) ? $input['folderName'] : '';
$token = isset($input['token']) ? $input['token'] : '';
$expires = isset($input['expires']) ? intval($input['expires']) : 0;

// Walidacja tokenu
if (empty($token) || $expires === 0) {
    http_response_code(401);
    die(json_encode(['error' => 'Missing token']));
}

if (time() > $expires) {
    http_response_code(403);
    die(json_encode(['error' => 'Token expired']));
}

$expectedToken = hash_hmac('sha256', 'mkdir|' . $parentFolder . '|' . $folderName . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'Invalid token']));
}

// Walidacja
if (empty($folderName)) {
    http_response_code(400);
    die(json_encode(['error' => 'folderName is required']));
}

// Zabezpieczenie przed path traversal
$parentFolder = str_replace(['..', "\0"], '', $parentFolder);
$parentFolder = trim($parentFolder, '/');
$folderName = str_replace(['..', "\0", '/'], '', $folderName);

// Bezpieczna nazwa
$folderName = preg_replace('/[^a-zA-Z0-9_\-\. ]/', '_', $folderName);
$folderName = preg_replace('/_+/', '_', $folderName);
$folderName = trim($folderName);

if (empty($folderName)) {
    http_response_code(400);
    die(json_encode(['error' => 'Invalid folder name']));
}

$parentPath = PRIVATE_FILES_PATH . ($parentFolder ? $parentFolder . '/' : '');
$newFolderPath = $parentPath . $folderName;

// Sprawdź czy folder nadrzędny istnieje
if (!is_dir($parentPath)) {
    http_response_code(404);
    die(json_encode(['error' => 'Parent folder not found']));
}

// Sprawdź czy folder już istnieje
if (file_exists($newFolderPath)) {
    http_response_code(400);
    die(json_encode(['error' => 'Folder already exists']));
}

if (mkdir($newFolderPath, 0755)) {
    $relativePath = ($parentFolder ? $parentFolder . '/' : '') . $folderName;
    echo json_encode([
        'success' => true,
        'path' => $relativePath,
        'name' => $folderName
    ]);
} else {
    http_response_code(500);
    die(json_encode(['error' => 'Failed to create folder']));
}
