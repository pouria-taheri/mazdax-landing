<?php
/**
 * register.php — ثبت‌نام کاربر از فرم لندینگ
 * مسیر روی سرور: public_html/register.php
 * (کنار index.html، خارج از پوشه admin)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'msg' => 'فقط POST مجاز است']);
    exit;
}

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$phone = preg_replace('/[^0-9]/', '', $body['phone'] ?? '');
$email = filter_var($body['email'] ?? '', FILTER_SANITIZE_EMAIL);
$source = preg_replace('/[^a-zA-Z0-9_\-]/', '', $body['source'] ?? 'landing');

// اعتبارسنجی
if (strlen($phone) < 10 || strlen($phone) > 11) {
    echo json_encode(['ok' => false, 'msg' => 'شماره موبایل معتبر نیست']);
    exit;
}

// Rate limit ساده (max 5 register از یک IP در ساعت)
$ip      = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rlFile  = __DIR__ . '/admin/data/rate_limit.json';
$rlData  = file_exists($rlFile) ? (json_decode(file_get_contents($rlFile), true) ?? []) : [];
$now     = time();
$rlData  = array_filter($rlData, fn($t) => $now - $t < 3600); // پاک کردن قدیمی‌ها
$ipCount = count(array_filter(array_keys($rlData), fn($k) => str_starts_with($k, $ip . '_')));
if ($ipCount >= 5) {
    echo json_encode(['ok' => false, 'msg' => 'تعداد درخواست‌ها از این IP زیاد است. بعداً امتحان کنید.']);
    exit;
}
$rlData[$ip . '_' . $now] = $now;
file_put_contents($rlFile, json_encode($rlData));

// ذخیره کاربر
$dataDir = __DIR__ . '/admin/data';
if (!is_dir($dataDir)) mkdir($dataDir, 0755, true);
$file  = $dataDir . '/users.json';
$users = file_exists($file) ? (json_decode(file_get_contents($file), true) ?? []) : [];

// بررسی تکراری نبودن
foreach ($users as $u) {
    if ($u['phone'] === $phone) {
        echo json_encode(['ok' => false, 'msg' => 'این شماره قبلاً ثبت‌نام کرده']);
        exit;
    }
}

$newUser = [
    'phone'   => $phone,
    'email'   => $email ?: '',
    'date'    => date('Y-m-d H:i:s'),
    'kyc'     => 'در انتظار',
    'points'  => 0,
    'trades'  => 0,
    'invites' => 0,
    'source'  => $source,
    'ip'      => $ip,
];
$users[] = $newUser;
file_put_contents($file, json_encode($users, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

// ارسال به CRM اگر تنظیم شده
$settingsFile = $dataDir . '/settings.json';
if (file_exists($settingsFile)) {
    $settings = json_decode(file_get_contents($settingsFile), true) ?? [];
    if (!empty($settings['crm_webhook'])) {
        $ch = curl_init($settings['crm_webhook']);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($newUser),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
        ]);
        curl_exec($ch);
        curl_close($ch);
    }
}

echo json_encode(['ok' => true, 'msg' => 'ثبت‌نام موفق']);
