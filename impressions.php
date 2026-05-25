<?php
// ============================================================================
// nyc-trip · impressions backend
// ============================================================================
// Drop this file next to nyc-trip.html on your server.
//
//   GET  ./impressions.php  → returns the current impressions JSON
//   POST ./impressions.php  → accepts { "id": count, ... } and overwrites the file
//
// REQUIREMENTS
//   - PHP 7.0+ (works on basically every shared host + most VPS setups)
//   - The folder containing this file must be writable by PHP.
//     Typical: chmod 755 on the folder, 644 on the files. If writes fail,
//     try 775 on the folder.
//
// The data file (impressions.json) is auto-created on the first POST.
// ============================================================================

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

// If you ever host the HTML on a different domain than this PHP file,
// uncomment the next line (and tighten the origin to your actual domain):
// header('Access-Control-Allow-Origin: *');

$file = __DIR__ . '/impressions.json';

// ---------- GET: return the current state ----------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($file)) {
        readfile($file);
    } else {
        echo '{}';
    }
    exit;
}

// ---------- POST: receive the latest state and overwrite ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit;
    }

    // Sanitize: only allow simple { string-id: small-int } pairs.
    $clean = [];
    foreach ($data as $key => $value) {
        if (!is_string($key)) continue;
        if (!is_int($value) || $value < 0 || $value > 9999) continue;
        $safeKey = preg_replace('/[^a-zA-Z0-9_\-]/', '', $key);
        if ($safeKey !== '' && strlen($safeKey) <= 80) {
            $clean[$safeKey] = $value;
        }
    }

    // Atomic write with exclusive lock to avoid race conditions.
    $fp = @fopen($file, 'c+');
    if ($fp === false) {
        http_response_code(500);
        echo json_encode([
            'error' => 'Could not open data file — check folder permissions'
        ]);
        exit;
    }

    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($clean, JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    echo json_encode(['ok' => true, 'saved' => count($clean)]);
    exit;
}

// ---------- Anything else ----------
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
