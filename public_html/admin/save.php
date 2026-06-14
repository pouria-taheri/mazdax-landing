<?php
/**
 * save.php — مزدکس
 * مسیر روی سرور: public_html/admin/save.php
 * احراز هویت از طریق session (auth.php) انجام می‌شه
 */

session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

// ── مسیرها (relative به محل save.php) ──────────────────
// save.php داخل /admin/ هست، لندینگ یه سطح بالاتره
define('LANDING_FILE',   __DIR__ . '/../index.html');
define('DATA_DIR',       __DIR__ . '/data');
define('BACKUP_DIR',     __DIR__ . '/data/backups');

// ── احراز هویت از طریق session ──────────────────────────
function isLoggedIn(): bool {
    if (empty($_SESSION['admin_logged_in'])) return false;
    // timeout 8 ساعت
    if ((time() - ($_SESSION['login_time'] ?? 0)) > 8 * 3600) {
        session_destroy();
        return false;
    }
    return true;
}

// اگر لاگین نبود برگردون 401
if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'msg' => 'لطفاً وارد شوید']);
    exit;
}

// ── ساخت پوشه‌های لازم ──────────────────────────────────
if (!is_dir(DATA_DIR))   mkdir(DATA_DIR,   0755, true);
if (!is_dir(BACKUP_DIR)) mkdir(BACKUP_DIR, 0755, true);

// ── خواندن action ────────────────────────────────────────
$action = $_GET['action'] ?? '';
$body   = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true) ?? [];
}

// ════════════════════════════════════════════════════════
// READ — خواندن HTML لندینگ
// ════════════════════════════════════════════════════════
if ($action === 'read') {
    $path = realpath(LANDING_FILE);
    if (!$path || !file_exists($path)) {
        echo json_encode([
            'ok'  => false,
            'msg' => 'فایل index.html پیدا نشد. مسیر بررسی‌شده: ' . LANDING_FILE
        ]);
        exit;
    }
    echo json_encode(['ok' => true, 'html' => file_get_contents($path)]);
    exit;
}

// ════════════════════════════════════════════════════════
// SAVE — ذخیره HTML لندینگ
// ════════════════════════════════════════════════════════
if ($action === 'save') {
    $html = $body['html'] ?? '';

    // بررسی خالی نبودن
    if (trim($html) === '') {
        echo json_encode(['ok' => false, 'msg' => 'محتوا خالی است']);
        exit;
    }

    // بررسی معتبر بودن HTML (باید شامل <html یا <!DOCTYPE باشه)
    if (stripos($html, '<html') === false && stripos($html, '<!DOCTYPE') === false) {
        echo json_encode(['ok' => false, 'msg' => 'محتوای HTML معتبر نیست']);
        exit;
    }

    $targetPath = LANDING_FILE;

    // پشتیبان‌گیری از فایل قبلی
    if (file_exists($targetPath)) {
        $backupName = BACKUP_DIR . '/' . date('Y-m-d_H-i-s') . '_index.html';
        copy($targetPath, $backupName);

        // نگه داشتن فقط ۱۰ بکاپ آخر
        $backups = glob(BACKUP_DIR . '/*.html');
        if (count($backups) > 10) {
            usort($backups, fn($a,$b) => filemtime($a) - filemtime($b));
            array_splice($backups, -10);
            foreach ($backups as $old) unlink($old);
        }
    }

    // ذخیره فایل
    $result = file_put_contents($targetPath, $html);
    if ($result === false) {
        echo json_encode([
            'ok'  => false,
            'msg' => 'خطا در نوشتن فایل — Permission را بررسی کن (باید 644 باشد)'
        ]);
        exit;
    }

    echo json_encode(['ok' => true, 'msg' => 'ذخیره شد ✓', 'bytes' => $result]);
    exit;
}

// ════════════════════════════════════════════════════════
// REGISTER — ثبت‌نام کاربر از لندینگ (بدون نیاز به لاگین ادمین)
// ════════════════════════════════════════════════════════
// این اکشن رو از session check بیرون می‌بریم چون لندینگ کال می‌کنه
// (این بخش باید جداگانه handle بشه — اینجا فقط برای ادمین)

// ════════════════════════════════════════════════════════
// GET_USERS — لیست کاربران
// ════════════════════════════════════════════════════════
if ($action === 'get_users') {
    $file  = DATA_DIR . '/users.json';
    $users = file_exists($file) ? (json_decode(file_get_contents($file), true) ?? []) : [];
    echo json_encode(['ok' => true, 'users' => $users]);
    exit;
}

// ════════════════════════════════════════════════════════
// UPDATE_KYC — تغییر وضعیت احراز هویت
// ════════════════════════════════════════════════════════
if ($action === 'update_kyc') {
    $phone = preg_replace('/[^0-9]/', '', $body['phone'] ?? '');
    $kyc   = in_array($body['kyc'] ?? '', ['تأیید شده', 'در انتظار']) ? $body['kyc'] : 'در انتظار';
    $file  = DATA_DIR . '/users.json';
    $users = file_exists($file) ? (json_decode(file_get_contents($file), true) ?? []) : [];

    $found = false;
    foreach ($users as &$u) {
        if ($u['phone'] === $phone) {
            $u['kyc'] = $kyc;
            if ($kyc === 'تأیید شده' && ($u['points'] ?? 0) < 5) $u['points'] = 5;
            $found = true;
        }
    }

    if (!$found) { echo json_encode(['ok' => false, 'msg' => 'کاربر یافت نشد']); exit; }

    file_put_contents($file, json_encode($users, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    echo json_encode(['ok' => true]);
    exit;
}

// ════════════════════════════════════════════════════════
// GET_SETTINGS / SAVE_SETTINGS
// ════════════════════════════════════════════════════════
if ($action === 'get_settings') {
    $file     = DATA_DIR . '/settings.json';
    $settings = file_exists($file) ? (json_decode(file_get_contents($file), true) ?? []) : [];
    echo json_encode(['ok' => true, 'settings' => $settings]);
    exit;
}

if ($action === 'save_settings') {
    $allowed = ['crm_webhook','crm_kyc','api_key','sms_provider','sms_number','sms_key'];
    $data    = array_intersect_key($body, array_flip($allowed));
    file_put_contents(DATA_DIR . '/settings.json', json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    echo json_encode(['ok' => true, 'msg' => 'تنظیمات ذخیره شد']);
    exit;
}

// ════════════════════════════════════════════════════════
// DEBUG — فقط برای تست اولیه (بعد از راه‌اندازی حذف کن)
// ════════════════════════════════════════════════════════
if ($action === 'debug') {
    echo json_encode([
        'ok'            => true,
        'php_version'   => PHP_VERSION,
        'landing_path'  => LANDING_FILE,
        'landing_real'  => realpath(LANDING_FILE) ?: 'NOT FOUND',
        'landing_exists'=> file_exists(LANDING_FILE),
        'data_dir'      => DATA_DIR,
        'data_writable' => is_writable(DATA_DIR),
        'current_dir'   => __DIR__,
        'session_user'  => $_SESSION['admin_user'] ?? 'none',
    ]);
    exit;
}

echo json_encode(['ok' => false, 'msg' => 'action نامعتبر: ' . htmlspecialchars($action)]);
