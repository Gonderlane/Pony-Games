<?php
/**
 * GitHub Webhook handler
 */

function loadEnv($path) {
    if (!file_exists($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        // Пропускаем комментарии (начинаются с #)
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        // Ищем первое '='
        $pos = strpos($line, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($line, 0, $pos));
        $value = trim(substr($line, $pos + 1));
        // Устанавливаем переменную окружения
        putenv("$key=$value");
        // Также добавляем в $_ENV и $_SERVER для совместимости
        $_ENV[$key] = $value;
        $_SERVER[$key] = $value;
    }
}

loadEnv(__DIR__ . '/.env');

$secret = getenv('GITHUB_WEBHOOK_SECRET');
if ($secret === false) {
    http_response_code(500);
    die('Secret not configured. Set GITHUB_WEBHOOK_SECRET environment variable.');
}

// path_to_repo
$repoPath = getenv('REPO_PATH') ?: '/var/www/project'; // измените под себя
// branch
$branch = getenv('BRANCH') ?: 'main';
// log_file
$logFile = getenv('LOG_FILE') ?: '/var/log/webhook.log';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die('Method not allowed');
}

$signature = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
if (empty($signature)) {
    http_response_code(401);
    die('Missing signature');
}

$payload = file_get_contents('php://input');
$computed = 'sha256=' . hash_hmac('sha256', $payload, $secret);

if (!hash_equals($computed, $signature)) {
    http_response_code(401);
    die('Invalid signature');
}

$data = json_decode($payload, true);
if ($data && isset($data['ref'])) {
    $refParts = explode('/', $data['ref']);
    $branchFromPayload = end($refParts);
    if ($branchFromPayload !== $branch) {
        file_put_contents($logFile, date('Y-m-d H:i:s') . " - Ignored branch: $branchFromPayload\n", FILE_APPEND);
        http_response_code(200);
        die("Not target branch ($branch), ignored");
    }
}

if (!is_dir($repoPath)) {
    $error = "Repository path does not exist: $repoPath";
    file_put_contents($logFile, date('Y-m-d H:i:s') . " - ERROR: $error\n", FILE_APPEND);
    http_response_code(500);
    die($error);
}

$git = 'git';
$command = "cd " . escapeshellarg($repoPath) . " && $git -c safe.directory=" . escapeshellarg($repoPath) . " pull origin " . escapeshellarg($branch) . " 2>&1";

exec($command, $output, $returnCode);
$outputStr = implode("\n", $output);

$logEntry = date('Y-m-d H:i:s') . " - Return code: $returnCode\n";
$logEntry .= "Output:\n$outputStr\n";
$logEntry .= "---\n";
file_put_contents($logFile, $logEntry, FILE_APPEND);

if ($returnCode === 0) {
    http_response_code(200);
    echo "Pull successful\n$outputStr";
} else {
    http_response_code(500);
    echo "Pull failed with code $returnCode\n$outputStr";
}
