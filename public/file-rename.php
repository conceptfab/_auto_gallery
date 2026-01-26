<?php
/**
 * File Rename API - Zmiana nazwy plików i folderów
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

$oldPath = isset($input['oldPath']) ? $input['oldPath'] : '';
$newName = isset($input['newName']) ? $input['newName'] : '';
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

$expectedToken = hash_hmac('sha256', 'rename|' . $oldPath . '|' . $newName . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'Invalid token']));
}

// Walidacja
if (empty($oldPath) || empty($newName)) {
    http_response_code(400);
    die(json_encode(['error' => 'oldPath and newName are required']));
}

// Zabezpieczenie przed path traversal
$oldPath = str_replace(['..', "\0"], '', $oldPath);
$oldPath = trim($oldPath, '/');
$newName = str_replace(['..', "\0", '/'], '', $newName);

if (empty($oldPath) || empty($newName)) {
    http_response_code(400);
    die(json_encode(['error' => 'Invalid path or name']));
}

$fullOldPath = PRIVATE_FILES_PATH . $oldPath;

if (!file_exists($fullOldPath)) {
    http_response_code(404);
    die(json_encode(['error' => 'File or folder not found']));
}

// Bezpieczna nazwa
$newName = preg_replace('/[^a-zA-Z0-9_\-\. ]/', '_', $newName);
$newName = preg_replace('/_+/', '_', $newName);
$newName = trim($newName);

if (empty($newName)) {
    http_response_code(400);
    die(json_encode(['error' => 'Invalid new name']));
}

// Buduj nową ścieżkę (ten sam folder, nowa nazwa)
$parentDir = dirname($fullOldPath);
$fullNewPath = $parentDir . '/' . $newName;

// Nowa ścieżka względna
$parentRelative = dirname($oldPath);
$newPath = ($parentRelative === '.' ? '' : $parentRelative . '/') . $newName;

// Sprawdź czy cel już istnieje
if (file_exists($fullNewPath) && $fullOldPath !== $fullNewPath) {
    http_response_code(400);
    die(json_encode(['error' => 'Target already exists']));
}

if (rename($fullOldPath, $fullNewPath)) {
    echo json_encode([
        'success' => true,
        'oldPath' => $oldPath,
        'newPath' => $newPath,
        'newName' => $newName
    ]);
} else {
    http_response_code(500);
    die(json_encode(['error' => 'Failed to rename']));
}
