<?php
/**
 * File List API - Lista plików z prywatnego folderu
 * Zwraca JSON z listą folderów i plików (do skanowania galerii)
 */

// ============ KONFIGURACJA ============
define('PRIVATE_FILES_PATH', '/home/host372606/domains/conceptfab.com/content_browser/');
define('SECRET_KEY', 'fad2ebf6cfb0f9f625b15117f2849fd7ebad44f5c04cfd809787f861a6fa710b');
define('ALLOWED_EXTENSIONS', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm']);
// ======================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Pobierz parametry
$folder = isset($_GET['folder']) ? $_GET['folder'] : '';
$token = isset($_GET['token']) ? $_GET['token'] : '';
$expires = isset($_GET['expires']) ? intval($_GET['expires']) : 0;

// Walidacja tokenu
if (empty($token) || $expires === 0) {
    http_response_code(401);
    die(json_encode(['error' => 'Missing token']));
}

if (time() > $expires) {
    http_response_code(403);
    die(json_encode(['error' => 'Token expired']));
}

$expectedToken = hash_hmac('sha256', 'list|' . $folder . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'Invalid token']));
}

// Zabezpieczenie przed path traversal
$folder = str_replace(['..', "\0"], '', $folder);
$folder = trim($folder, '/');

$fullPath = PRIVATE_FILES_PATH . ($folder ? $folder . '/' : '');

if (!is_dir($fullPath)) {
    http_response_code(404);
    die(json_encode(['error' => 'Folder not found', 'path' => $folder]));
}

// Skanuj folder
$result = [
    'folders' => [],
    'files' => []
];

$items = scandir($fullPath);

foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    
    $itemPath = $fullPath . $item;
    
    if (is_dir($itemPath)) {
        $result['folders'][] = [
            'name' => $item,
            'path' => ($folder ? $folder . '/' : '') . $item
        ];
    } else {
        $extension = strtolower(pathinfo($item, PATHINFO_EXTENSION));
        if (in_array($extension, ALLOWED_EXTENSIONS)) {
            $stat = stat($itemPath);
            $result['files'][] = [
                'name' => $item,
                'path' => ($folder ? $folder . '/' : '') . $item,
                'size' => $stat['size'],
                'modified' => date('c', $stat['mtime'])
            ];
        }
    }
}

// Sortuj alfabetycznie
usort($result['folders'], fn($a, $b) => strcasecmp($a['name'], $b['name']));
usort($result['files'], fn($a, $b) => strcasecmp($a['name'], $b['name']));

echo json_encode($result);
