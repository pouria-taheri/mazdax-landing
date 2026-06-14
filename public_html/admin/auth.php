<?php
/**
 * auth.php — سیستم احراز هویت امن مزدکس
 * ─────────────────────────────────────────
 * این فایل رو در کنار admin.html و save.php آپلود کن
 * پسورد پیش‌فرض: Mazdex@1404  (بعد از اولین ورود عوضش کن!)
 */

session_start();
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

define('LOCK_FILE',    __DIR__ . '/data/.auth_locks.json');
define('USERS_FILE',   __DIR__ . '/data/.admin_users.json');
define('MAX_ATTEMPTS', 5);
define('LOCK_MINUTES', 15);

// ── ساخت فایل‌های لازم ──────────────────────────────────
if (!is_dir(__DIR__ . '/data')) mkdir(__DIR__ . '/data', 0755, true);

// ساخت یوزر پیش‌فرض اگر فایل وجود ندارد
if (!file_exists(USERS_FILE)) {
    $default = [
        'admin' => [
            'username'   => 'admin',
            'password'   => password_hash('Mazdex@1404', PASSWORD_BCRYPT, ['cost' => 12]),
            'created_at' => date('Y-m-d H:i:s'),
            'last_login' => null,
            'must_change_pass' => true,   // اجبار به تغییر پسورد اولین بار
        ]
    ];
    file_put_contents(USERS_FILE, json_encode($default, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// ── خواندن locks ─────────────────────────────────────────
function getLocks(): array {
    if (!file_exists(LOCK_FILE)) return [];
    return json_decode(file_get_contents(LOCK_FILE), true) ?? [];
}
function saveLocks(array $locks): void {
    file_put_contents(LOCK_FILE, json_encode($locks, JSON_PRETTY_PRINT));
}

// ── بررسی بلاک بودن IP ───────────────────────────────────
function getClientIp(): string {
    return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}
function isLocked(string $ip): array {
    $locks = getLocks();
    if (!isset($locks[$ip])) return ['locked' => false];
    $lock = $locks[$ip];
    $unlock = strtotime($lock['unlock_at']);
    if (time() < $unlock) {
        $remaining = ceil(($unlock - time()) / 60);
        return ['locked' => true, 'remaining' => $remaining, 'unlock_at' => $lock['unlock_at']];
    }
    // قفل منقضی شده — حذف
    unset($locks[$ip]);
    saveLocks($locks);
    return ['locked' => false];
}
function recordFailedAttempt(string $ip): void {
    $locks = getLocks();
    if (!isset($locks[$ip])) $locks[$ip] = ['attempts' => 0, 'unlock_at' => null];
    $locks[$ip]['attempts']++;
    $locks[$ip]['last_attempt'] = date('Y-m-d H:i:s');
    if ($locks[$ip]['attempts'] >= MAX_ATTEMPTS) {
        $locks[$ip]['unlock_at'] = date('Y-m-d H:i:s', time() + LOCK_MINUTES * 60);
    }
    saveLocks($locks);
}
function clearAttempts(string $ip): void {
    $locks = getLocks();
    unset($locks[$ip]);
    saveLocks($locks);
}

// ── خواندن/ذخیره یوزرها ──────────────────────────────────
function getUsers(): array {
    return json_decode(file_get_contents(USERS_FILE), true) ?? [];
}
function saveUsers(array $users): void {
    file_put_contents(USERS_FILE, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// ── اعتبارسنجی پسورد ─────────────────────────────────────
function validatePassword(string $pass): array {
    $errors = [];
    if (strlen($pass) < 8)        $errors[] = 'حداقل ۸ کاراکتر';
    if (!preg_match('/[A-Z]/', $pass)) $errors[] = 'حداقل یک حرف بزرگ انگلیسی';
    if (!preg_match('/[0-9]/', $pass)) $errors[] = 'حداقل یک عدد';
    if (!preg_match('/[^a-zA-Z0-9]/', $pass)) $errors[] = 'حداقل یک کاراکتر خاص (@#$%...)';
    return $errors;
}

// ── خواندن body ───────────────────────────────────────────
$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $body['action'] ?? $_GET['action'] ?? '';
$ip     = getClientIp();

// ── CSRF token ────────────────────────────────────────────
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// ─────────────────────────────────────────────────────────
// ACTION: get_csrf — گرفتن توکن
// ─────────────────────────────────────────────────────────
if ($action === 'get_csrf') {
    echo json_encode(['ok' => true, 'csrf' => $_SESSION['csrf_token']]);
    exit;
}

// ─────────────────────────────────────────────────────────
// ACTION: login
// ─────────────────────────────────────────────────────────
if ($action === 'login') {
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $csrf     = $body['csrf'] ?? '';

    // بررسی CSRF
    if (!hash_equals($_SESSION['csrf_token'], $csrf)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'msg' => 'درخواست نامعتبر']);
        exit;
    }

    // بررسی بلاک
    $lock = isLocked($ip);
    if ($lock['locked']) {
        echo json_encode(['ok' => false, 'locked' => true,
            'msg' => "دسترسی موقتاً مسدود شد. {$lock['remaining']} دقیقه دیگر تلاش کنید."]);
        exit;
    }

    // بررسی یوزر
    $users = getUsers();
    if (!isset($users[$username]) || !password_verify($password, $users[$username]['password'])) {
        recordFailedAttempt($ip);
        $locks = getLocks();
        $attempts = $locks[$ip]['attempts'] ?? 1;
        $remaining = MAX_ATTEMPTS - $attempts;
        echo json_encode(['ok' => false,
            'msg' => "نام کاربری یا رمز اشتباه است. ($remaining تلاش باقی‌مانده)"]);
        exit;
    }

    // ورود موفق
    clearAttempts($ip);
    session_regenerate_id(true);  // جلوگیری از session fixation
    $_SESSION['admin_logged_in'] = true;
    $_SESSION['admin_user']      = $username;
    $_SESSION['login_time']      = time();
    $_SESSION['login_ip']        = $ip;

    // آپدیت last_login
    $users[$username]['last_login'] = date('Y-m-d H:i:s');
    saveUsers($users);

    echo json_encode([
        'ok'               => true,
        'username'         => $username,
        'must_change_pass' => $users[$username]['must_change_pass'] ?? false,
        'msg'              => 'ورود موفق'
    ]);
    exit;
}

// ─────────────────────────────────────────────────────────
// ACTION: check — بررسی session
// ─────────────────────────────────────────────────────────
if ($action === 'check') {
    $loggedIn = !empty($_SESSION['admin_logged_in']);
    // بررسی timeout (۸ ساعت)
    if ($loggedIn && (time() - ($_SESSION['login_time'] ?? 0)) > 8 * 3600) {
        session_destroy();
        $loggedIn = false;
    }
    // بررسی IP تغییر نکرده
    if ($loggedIn && ($_SESSION['login_ip'] ?? '') !== $ip) {
        session_destroy();
        $loggedIn = false;
    }
    echo json_encode([
        'ok'       => $loggedIn,
        'username' => $_SESSION['admin_user'] ?? null,
        'must_change_pass' => $loggedIn ? (getUsers()[$_SESSION['admin_user']]['must_change_pass'] ?? false) : false,
    ]);
    exit;
}

// ─────────────────────────────────────────────────────────
// بقیه actionها نیاز به لاگین دارند
// ─────────────────────────────────────────────────────────
if (empty($_SESSION['admin_logged_in'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'msg' => 'لطفاً وارد شوید']);
    exit;
}
$currentUser = $_SESSION['admin_user'];

// ─────────────────────────────────────────────────────────
// ACTION: logout
// ─────────────────────────────────────────────────────────
if ($action === 'logout') {
    session_destroy();
    echo json_encode(['ok' => true, 'msg' => 'خروج موفق']);
    exit;
}

// ─────────────────────────────────────────────────────────
// ACTION: change_password
// ─────────────────────────────────────────────────────────
if ($action === 'change_password') {
    $current = $body['current_password'] ?? '';
    $newPass = $body['new_password'] ?? '';
    $confirm = $body['confirm_password'] ?? '';
    $users   = getUsers();

    if (!password_verify($current, $users[$currentUser]['password'])) {
        echo json_encode(['ok' => false, 'msg' => 'رمز فعلی اشتباه است']);
        exit;
    }
    if ($newPass !== $confirm) {
        echo json_encode(['ok' => false, 'msg' => 'رمز جدید و تکرار آن مطابقت ندارند']);
        exit;
    }
    $errors = validatePassword($newPass);
    if ($errors) {
        echo json_encode(['ok' => false, 'msg' => implode(' | ', $errors)]);
        exit;
    }
    if (password_verify($newPass, $users[$currentUser]['password'])) {
        echo json_encode(['ok' => false, 'msg' => 'رمز جدید نباید با رمز قبلی یکسان باشد']);
        exit;
    }

    $users[$currentUser]['password']         = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]);
    $users[$currentUser]['must_change_pass'] = false;
    $users[$currentUser]['pass_changed_at']  = date('Y-m-d H:i:s');
    saveUsers($users);
    echo json_encode(['ok' => true, 'msg' => 'رمز عبور با موفقیت تغییر کرد']);
    exit;
}

// ─────────────────────────────────────────────────────────
// ACTION: add_user — فقط ادمین اصلی
// ─────────────────────────────────────────────────────────
if ($action === 'add_user') {
    if ($currentUser !== 'admin') {
        echo json_encode(['ok' => false, 'msg' => 'فقط ادمین اصلی می‌تواند کاربر بسازد']);
        exit;
    }
    $newUsername = trim($body['username'] ?? '');
    $newPass     = $body['password'] ?? '';
    if (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $newUsername)) {
        echo json_encode(['ok' => false, 'msg' => 'نام کاربری باید ۳-۲۰ حرف انگلیسی یا عدد باشد']);
        exit;
    }
    $users = getUsers();
    if (isset($users[$newUsername])) {
        echo json_encode(['ok' => false, 'msg' => 'این نام کاربری قبلاً ثبت شده']);
        exit;
    }
    $errors = validatePassword($newPass);
    if ($errors) {
        echo json_encode(['ok' => false, 'msg' => implode(' | ', $errors)]);
        exit;
    }
    $users[$newUsername] = [
        'username'         => $newUsername,
        'password'         => password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 12]),
        'created_at'       => date('Y-m-d H:i:s'),
        'created_by'       => $currentUser,
        'last_login'       => null,
        'must_change_pass' => true,
    ];
    saveUsers($users);
    echo json_encode(['ok' => true, 'msg' => "کاربر $newUsername ساخته شد"]);
    exit;
}

// ─────────────────────────────────────────────────────────
// ACTION: list_users
// ─────────────────────────────────────────────────────────
if ($action === 'list_users') {
    if ($currentUser !== 'admin') {
        echo json_encode(['ok' => false, 'msg' => 'دسترسی ندارید']);
        exit;
    }
    $users  = getUsers();
    $result = array_map(fn($u) => [
        'username'   => $u['username'],
        'created_at' => $u['created_at'],
        'last_login' => $u['last_login'],
        'must_change_pass' => $u['must_change_pass'] ?? false,
    ], array_values($users));
    echo json_encode(['ok' => true, 'users' => $result]);
    exit;
}

// ─────────────────────────────────────────────────────────
// ACTION: delete_user
// ─────────────────────────────────────────────────────────
if ($action === 'delete_user') {
    if ($currentUser !== 'admin') {
        echo json_encode(['ok' => false, 'msg' => 'دسترسی ندارید']);
        exit;
    }
    $target = $body['username'] ?? '';
    if ($target === 'admin') {
        echo json_encode(['ok' => false, 'msg' => 'ادمین اصلی قابل حذف نیست']);
        exit;
    }
    $users = getUsers();
    if (!isset($users[$target])) {
        echo json_encode(['ok' => false, 'msg' => 'کاربر یافت نشد']);
        exit;
    }
    unset($users[$target]);
    saveUsers($users);
    echo json_encode(['ok' => true, 'msg' => "کاربر $target حذف شد"]);
    exit;
}

echo json_encode(['ok' => false, 'msg' => 'action نامعتبر']);
