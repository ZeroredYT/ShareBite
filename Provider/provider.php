<?php
/**
 * provider.php
 * Backend API controller for food providers.
 */

session_start();
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/database.php';

// Helper function to send JSON responses and exit
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

// Helper function to return error messages
function fail($message, $code = 400) {
    respond(['error' => $message], $code);
}

// 1. Authenticate user session
if (!isset($_SESSION['user_id'])) {
    fail('Please log in first.', 401);
}

$userId = (int) $_SESSION['user_id'];

// 2. Verify provider role and active status
$stmt = $pdo->prepare('SELECT user_id, name, role, is_verified, is_active FROM users WHERE user_id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();

if (!$user || $user['role'] !== 'provider' || !(int) $user['is_active']) {
    fail('Provider access denied.', 403);
}

$action = $_GET['action'] ?? '';

// 3. Validate CSRF token for all POST requests
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['provider_csrf'] ?? '', $token)) {
        fail('Invalid security token.', 403);
    }
}

try {
    // --- GET ACTIONS ---
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ($action === 'init') {
            // Generate CSRF token if not already set
            $_SESSION['provider_csrf'] ??= bin2hex(random_bytes(32));
            
            $cats = $pdo->query('SELECT category_id, name FROM categories WHERE is_active = 1 ORDER BY name')->fetchAll();
            $locations = $pdo->query('SELECT location_id, name, building FROM locations WHERE is_active = 1 ORDER BY name')->fetchAll();
            
            respond([
                'user' => [
                    'name' => $user['name'],
                    'verified' => (bool) $user['is_verified']
                ],
                'csrf' => $_SESSION['provider_csrf'],
                'categories' => $cats,
                'locations' => $locations
            ]);
        }

        if ($action === 'list') {
            // Automatically expire old available listings
            $pdo->prepare("UPDATE listings SET status = 'expired' WHERE provider_id = ? AND status = 'available' AND expiry_time < NOW()")
                ->execute([$userId]);

            // Fetch listings with category and location details
            $stmt = $pdo->prepare('SELECT l.*, c.name AS category_name, loc.name AS location_name, loc.building 
                                   FROM listings l 
                                   JOIN categories c ON c.category_id = l.category_id 
                                   JOIN locations loc ON loc.location_id = l.location_id 
                                   WHERE l.provider_id = ? 
                                   ORDER BY l.created_at DESC, l.listing_id DESC');
            $stmt->execute([$userId]);
            $list = $stmt->fetchAll();

            // Calculate impact stats
            $stats = ['active' => 0, 'collected_portions' => 0, 'saved_kg' => 0, 'expired' => 0];
            foreach ($list as $l) {
                if ($l['status'] === 'available') {
                    $stats['active']++;
                }
                if ($l['status'] === 'collected') {
                    $stats['collected_portions'] += (int) $l['portions'];
                    $stats['saved_kg'] += (float) $l['estimated_kg'];
                }
                if ($l['status'] === 'expired') {
                    $stats['expired']++;
                }
            }

            respond(['listings' => $list, 'stats' => $stats]);
        }

        fail('Unknown action.', 404);
    }

    // --- POST ACTIONS ---
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        
        // Handle Logout Action
        if ($action === 'logout') {
            $_SESSION = [];
            if (ini_get("session.use_cookies")) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000,
                    $params["path"], $params["domain"],
                    $params["secure"], $params["httponly"]
                );
            }
            session_destroy();
            respond(['success' => true]);
        }

        $input = json_decode(file_get_contents('php://input'), true);
        if (!is_array($input)) {
            fail('Invalid JSON.');
        }

        // Handle Create or Update Listing
        if ($action === 'create' || $action === 'update') {
            if (!(int) $user['is_verified']) {
                fail('Your account must be approved by admin before posting.', 403);
            }

            $title = trim((string) ($input['title'] ?? ''));
            $portions = filter_var($input['portions'] ?? null, FILTER_VALIDATE_INT);
            $kg = filter_var($input['estimated_kg'] ?? null, FILTER_VALIDATE_FLOAT);
            $category = filter_var($input['category_id'] ?? null, FILTER_VALIDATE_INT);
            $location = filter_var($input['location_id'] ?? null, FILTER_VALIDATE_INT);
            $needs = (!empty($input['needs_courier'])) ? 1 : 0;
            $expiry = (string) ($input['expiry_time'] ?? '');

            $dt = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $expiry);
            $validDate = $dt && $dt->format('Y-m-d\TH:i') === $expiry && $dt->getTimestamp() > time();

            if ($title === '' || strlen($title) > 150 || $portions === false || $portions < 1 || $kg === false || $kg <= 0 || $kg > 9999.99 || !$validDate) {
                fail('Check title, portions, weight and future expiry date.');
            }

            // Verify category exists and is active
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE category_id = ? AND is_active = 1');
            $stmt->execute([$category]);
            if (!$stmt->fetchColumn()) {
                fail('Invalid category.');
            }

            // Verify location exists and is active
            $stmt = $pdo->prepare('SELECT COUNT(*) FROM locations WHERE location_id = ? AND is_active = 1');
            $stmt->execute([$location]);
            if (!$stmt->fetchColumn()) {
                fail('Invalid pickup location.');
            }

            if ($action === 'create') {
                $stmt = $pdo->prepare("INSERT INTO listings (provider_id, category_id, location_id, title, portions, estimated_kg, needs_courier, status, is_verified, expiry_time) 
                                       VALUES (?, ?, ?, ?, ?, ?, ?, 'available', 0, ?)");
                $stmt->execute([$userId, $category, $location, $title, $portions, $kg, $needs, $dt->format('Y-m-d H:i:s')]);
            } else {
                $id = filter_var($input['listing_id'] ?? null, FILTER_VALIDATE_INT);
                $stmt = $pdo->prepare("UPDATE listings SET category_id = ?, location_id = ?, title = ?, portions = ?, estimated_kg = ?, needs_courier = ?, expiry_time = ?, is_verified = 0 
                                       WHERE listing_id = ? AND provider_id = ? AND status = 'available' AND expiry_time > NOW() 
                                       AND NOT EXISTS (SELECT 1 FROM claims WHERE claims.listing_id = listings.listing_id AND claims.status = 'pending')");
                $stmt->execute([$category, $location, $title, $portions, $kg, $needs, $dt->format('Y-m-d H:i:s'), $id, $userId]);
                
                if (!$stmt->rowCount()) {
                    fail('Listing cannot be edited. It may be claimed or expired.', 409);
                }
            }

            respond(['success' => true]);
        }

        // Handle Cancel Listing
        if ($action === 'cancel') {
            $id = filter_var($input['listing_id'] ?? null, FILTER_VALIDATE_INT);
            $stmt = $pdo->prepare("UPDATE listings SET status = 'cancelled' 
                                   WHERE listing_id = ? AND provider_id = ? AND status = 'available' 
                                   AND NOT EXISTS (SELECT 1 FROM claims WHERE claims.listing_id = listings.listing_id AND claims.status = 'pending')");
            $stmt->execute([$id, $userId]);
            
            if (!$stmt->rowCount()) {
                fail('Only unclaimed available listings can be cancelled.', 409);
            }

            respond(['success' => true]);
        }

        // Handle Verify Pickup
        if ($action === 'verify') {
            $id = filter_var($input['listing_id'] ?? null, FILTER_VALIDATE_INT);
            $code = trim((string) ($input['claim_code'] ?? ''));
            
            if (!$id || $code === '') {
                fail('Listing and claim code are required.');
            }

            $pdo->beginTransaction();

            $stmt = $pdo->prepare('SELECT listing_id, needs_courier, status FROM listings WHERE listing_id = ? AND provider_id = ? FOR UPDATE');
            $stmt->execute([$id, $userId]);
            $listing = $stmt->fetch();

            if (!$listing || $listing['status'] !== 'claimed' || (int) $listing['needs_courier']) {
                $pdo->rollBack();
                fail('Only claimed self-pickup listings can be verified.', 409);
            }

            $stmt = $pdo->prepare("SELECT claim_id, claim_code FROM claims WHERE listing_id = ? AND status = 'pending' FOR UPDATE");
            $stmt->execute([$id]);
            $claim = $stmt->fetch();

            if (!$claim || !hash_equals((string) $claim['claim_code'], $code)) {
                $pdo->rollBack();
                fail('Incorrect claim code.', 400);
            }

            $pdo->prepare("UPDATE claims SET status = 'confirmed' WHERE claim_id = ?")->execute([$claim['claim_id']]);
            $pdo->prepare("UPDATE listings SET status = 'collected' WHERE listing_id = ?")->execute([$id]);

            $pdo->commit();
            respond(['success' => true]);
        }

        fail('Unknown action.', 404);
    }

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log($e->getMessage());
    fail('Request could not be completed.', 500);
}