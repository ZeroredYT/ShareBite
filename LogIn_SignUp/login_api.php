<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db.php';

function respond($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function request_data() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $_POST;
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$data = request_data();

if ($method === 'GET' && $action === 'check_session') {
    if (isset($_SESSION['user'])) {
        respond([
            'success' => true,
            'loggedIn' => true,
            'user' => $_SESSION['user']
        ]);
    } else {
        respond([
            'success' => true,
            'loggedIn' => false
        ]);
    }
}

if ($method === 'GET' && $action === 'logout') {
    session_unset();
    session_destroy();
    respond([
        'success' => true,
        'message' => 'Logged out successfully.'
    ]);
}

if ($method !== 'POST') {
    respond(['success' => false, 'message' => 'Invalid request method.'], 405);
}

// login action
if ($action === 'login') {
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';

    if (empty($email) || empty($password)) {
        respond(['success' => false, 'message' => 'Please fill in all required fields.'], 400);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        respond(['success' => false, 'message' => 'Invalid email or password.'], 401);
    }

    // plain text and hashed passwords
    $passwordMatch = password_verify($password, $user['password']) || ($user['password'] === $password);

    if (!$passwordMatch) {
        respond(['success' => false, 'message' => 'Invalid email or password.'], 401);
    }

    // Account verification & status checks
    if (isset($user['is_active']) && (int)$user['is_active'] === 0) {
        respond(['success' => false, 'message' => 'Your account has been deactivated. Please contact support.'], 403);
    }

    if (isset($user['is_verified']) && (int)$user['is_verified'] === 0) {
        respond(['success' => false, 'message' => 'Your account is pending admin approval/verification.'], 403);
    }

    // Clean user object for session and storage
    $userData = [
        'user_id' => (int)$user['user_id'],
        'id'      => (int)$user['user_id'],
        'name'    => $user['name'],
        'email'   => $user['email'],
        'role'    => strtolower($user['role'])
    ];

    $_SESSION['user_id'] = $userData['user_id'];
    $_SESSION['user'] = $userData;

    // Determine redirect path based on user role
    $redirect = '../Recipient/index.html'; // Default role folder
    if ($userData['role'] === 'admin' || $userData['role'] === 'system admin') {
        $redirect = '../Admin/index.html';
    } elseif ($userData['role'] === 'courier') {
        $redirect = '../Courier/courier.html';
    } elseif ($userData['role'] === 'provider') {
        $redirect = '../Provider/index.html';
    }

    respond([
        'success' => true,
        'message' => 'Login successful!',
        'user' => $userData,
        'redirect' => $redirect
    ]);
}

// signup
if ($action === 'signup') {
    $name = trim($data['name'] ?? '');
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';
    $role = strtolower(trim($data['role'] ?? 'recipient'));

    $allowedRoles = ['admin', 'courier', 'provider', 'recipient'];
    if (!in_array($role, $allowedRoles, true)) {
        $role = 'recipient';
    }

    if (empty($name) || empty($email) || empty($password)) {
        respond(['success' => false, 'message' => 'Please fill in all required fields.'], 400);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'message' => 'Please provide a valid email address.'], 400);
    }

    // check if email already exists
    $stmt = $pdo->prepare("SELECT user_id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        respond(['success' => false, 'message' => 'An account with this email address already exists.'], 409);
    }

    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);
    
    // admins auto-verify
    $isVerified = in_array($role, ['admin'], true) ? 1 : 0;
    $isActive = 1;

    try {
        $stmt = $pdo->prepare("
            INSERT INTO users (name, email, password, role, is_verified, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([$name, $email, $hashedPassword, $role, $isVerified, $isActive]);

        $newUserId = (int)$pdo->lastInsertId();

        $message = ($isVerified === 0)
            ? 'Account created successfully! Your account is awaiting admin approval before you can log in.'
            : 'Account created successfully! You can now log in.';

        respond([
            'success' => true,
            'message' => $message,
            'user_id' => $newUserId,
            'requires_approval' => ($isVerified === 0)
        ]);
    } catch (PDOException $e) {
        error_log($e->getMessage());
        respond(['success' => false, 'message' => 'Database error occurred during registration.'], 500);
    }
}

respond(['success' => false, 'message' => 'Invalid action.'], 400);
?>