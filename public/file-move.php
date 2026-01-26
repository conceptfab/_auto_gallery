<?php
/**
 * File Move API - Przenoszenie plików i folderów
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

$sourcePath = isset($input['sourcePath']) ? $input['sourcePath'] : '';
$targetFolder = isset($input['targetFolder']) ? $input['targetFolder'] : '';
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

$expectedToken = hash_hmac('sha256', 'move|' . $sourcePath . '|' . $targetFolder . '|' . $expires, SECRET_KEY);
if (!hash_equals($expectedToken, $token)) {
    http_response_code(403);
    die(json_encode(['error' => 'Invalid token']));
}

// Walidacja
if (empty($sourcePath)) {
    http_response_code(400);
    die(json_encode(['error' => 'sourcePath is required']));
}

// Zabezpieczenie przed path traversal
$sourcePath = str_replace(['..', "\0"], '', $sourcePath);
$sourcePath = trim($sourcePath, '/');
$targetFolder = str_replace(['..', "\0"], '', $targetFolder);
$targetFolder = trim($targetFolder, '/');

if (empty($sourcePath)) {
    http_response_code(400);
    die(json_encode(['error' => 'Invalid source path']));
}

$fullSourcePath = PRIVATE_FILES_PATH . $sourcePath;
$fileName = basename($sourcePath);
$fullTargetFolder = PRIVATE_FILES_PATH . ($targetFolder ? $targetFolder . '/' : '');
$fullTargetPath = $fullTargetFolder . $fileName;

// Sprawdź czy źródło istnieje
if (!file_exists($fullSourcePath)) {
    http_response_code(404);
    die(json_encode(['error' => 'Source not found']));
}

// Sprawdź czy folder docelowy istnieje
if (!is_dir($fullTargetFolder)) {
    http_response_code(404);
    die(json_encode(['error' => 'Target folder not found']));
}

// Sprawdź czy cel już istnieje
if (file_exists($fullTargetPath)) {
    http_response_code(400);
    die(json_encode(['error' => 'Target already exists']));
}

// Nie pozwól przenosić do siebie samego
if (dirname($fullSourcePath) === rtrim($fullTargetFolder, '/')) {
    http_response_code(400);
    die(json_encode(['error' => 'Source and target are the same']));
}

if (rename($fullSourcePath, $fullTargetPath)) {
    $newPath = ($targetFolder ? $targetFolder . '/' : '') . $fileName;
    echo json_encode([
        'success' => true,
        'oldPath' => $sourcePath,
        'newPath' => $newPath
    ]);
} else {
    http_response_code(500);
    die(json_encode(['error' => 'Failed to move']));
}
