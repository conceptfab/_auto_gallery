<?php
/**
 * File Delete API - Usuwanie plików i folderów
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

$path = isset($input['path']) ? $input['path'] : '';
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

$expectedToken = hash_hmac('sha256', 'delete|' . $path . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'Invalid token']));
}

// Walidacja ścieżki
if (empty($path)) {
    http_response_code(400);
    die(json_encode(['error' => 'Path is required']));
}

// Zabezpieczenie przed path traversal
$path = str_replace(['..', "\0"], '', $path);
$path = trim($path, '/');

// Nie pozwól usunąć głównego folderu
if (empty($path)) {
    http_response_code(400);
    die(json_encode(['error' => 'Cannot delete root folder']));
}

$fullPath = PRIVATE_FILES_PATH . $path;

if (!file_exists($fullPath)) {
    http_response_code(404);
    die(json_encode(['error' => 'File or folder not found']));
}

// Funkcja rekurencyjnego usuwania folderu
function deleteRecursive($path) {
    if (is_dir($path)) {
        $items = scandir($path);
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            deleteRecursive($path . '/' . $item);
        }
        return rmdir($path);
    } else {
        return unlink($path);
    }
}

if (deleteRecursive($fullPath)) {
    echo json_encode([
        'success' => true,
        'deleted' => $path
    ]);
} else {
    http_response_code(500);
    die(json_encode(['error' => 'Failed to delete']));
}
