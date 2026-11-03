
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

function courier_id($data = []) {
    $id = $_SESSION['user_id']
        ?? $_SESSION['user']['user_id']
        ?? $_SESSION['user']['id']
        ?? ($_SERVER['HTTP_X_COURIER_ID'] ?? ($data['courier_id'] ?? null));

    $id = filter_var($id, FILTER_VALIDATE_INT);

    return ($id && $id > 0) ? $id : null;
}

function require_courier(PDO $pdo, $id) {
    if (!$id) {
        respond([
            'success' => false,
            'message' => 'Courier login could not be identified. Connect the login session before using this action.'
        ], 401);
    }

    $stmt = $pdo->prepare("
        SELECT user_id, name
        FROM users
        WHERE user_id = ?
          AND role = 'courier'
          AND is_active = 1
          AND is_verified = 1
    ");

    $stmt->execute([$id]);
    $user = $stmt->fetch();

    if (!$user) {
        respond([
            'success' => false,
            'message' => 'Courier account is inactive, unverified, or invalid.'
        ], 403);
    }

    return $user;
}

$method = $_SERVER['REQUEST_METHOD'];
$data = request_data();
$action = $_GET['action'] ?? ($data['action'] ?? '');
$id = courier_id($data);

try {

    // GET: load data
    if ($method === 'GET') {

        // Load active locations for the filter
        if ($action === 'locations') {
            $stmt = $pdo->query("
                SELECT location_id AS id, name, building
                FROM locations
                WHERE is_active = 1
                ORDER BY name
            ");

            respond([
                'success' => true,
                'data' => $stmt->fetchAll()
            ]);
        }

        // Load deliveries waiting for a courier
        if ($action === 'queue') {
            $sql = "
                SELECT
                    d.delivery_id,
                    d.claim_id,
                    d.courier_id,
                    d.dropoff_location_id,
                    d.status AS delivery_status,
                    d.distance_km,
                    d.transport_mode,
                    d.assigned_at,

                    c.recipient_id,
                    c.status AS claim_status,

                    l.listing_id,
                    l.title,
                    l.portions,
                    l.estimated_kg,
                    l.expiry_time,
                    l.needs_courier,
                    l.status AS listing_status,
                    l.category_id,
                    l.location_id,

                    cat.name AS category,

                    pickup.name AS pickup_location,
                    pickup.building AS pickup_building,

                    dropoff.name AS dropoff_location,
                    dropoff.building AS dropoff_building,

                    recipient.name AS recipient_name

                FROM deliveries d

                INNER JOIN claims c
                    ON c.claim_id = d.claim_id

                INNER JOIN listings l
                    ON l.listing_id = c.listing_id

                LEFT JOIN categories cat
                    ON cat.category_id = l.category_id

                LEFT JOIN locations pickup
                    ON pickup.location_id = l.location_id

                LEFT JOIN locations dropoff
                    ON dropoff.location_id = d.dropoff_location_id

                LEFT JOIN users recipient
                    ON recipient.user_id = c.recipient_id

                WHERE d.status = 'awaiting_courier'
                  AND d.courier_id IS NULL
                  AND l.needs_courier = 1
                  AND c.status = 'pending'
                  AND l.expiry_time > NOW()

                ORDER BY l.expiry_time ASC
            ";

            $rows = $pdo->query($sql)->fetchAll();

            respond([
                'success' => true,
                'data' => $rows
            ]);
        }

        // Load the current courier's deliveries
        if ($action === 'mine' || $action === 'stats') {
            $courier = require_courier($pdo, $id);

            $sql = "
                SELECT
                    d.delivery_id,
                    d.claim_id,
                    d.courier_id,
                    d.dropoff_location_id,
                    d.status AS delivery_status,
                    d.distance_km,
                    d.transport_mode,
                    d.assigned_at,
                    d.picked_up_at,
                    d.delivered_at,
                    d.updated_at,

                    c.claim_code,
                    c.recipient_id,
                    c.status AS claim_status,

                    l.listing_id,
                    l.title,
                    l.portions,
                    l.estimated_kg,
                    l.expiry_time,

                    cat.name AS category,

                    pickup.name AS pickup_location,
                    pickup.building AS pickup_building,

                    dropoff.name AS dropoff_location,
                    dropoff.building AS dropoff_building,

                    recipient.name AS recipient_name

                FROM deliveries d

                INNER JOIN claims c
                    ON c.claim_id = d.claim_id

                INNER JOIN listings l
                    ON l.listing_id = c.listing_id

                LEFT JOIN categories cat
                    ON cat.category_id = l.category_id

                LEFT JOIN locations pickup
                    ON pickup.location_id = l.location_id

                LEFT JOIN locations dropoff
                    ON dropoff.location_id = d.dropoff_location_id

                LEFT JOIN users recipient
                    ON recipient.user_id = c.recipient_id

                WHERE d.courier_id = ?

                ORDER BY
                    (d.status = 'delivered') ASC,
                    COALESCE(d.updated_at, d.assigned_at) DESC
            ";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);

            $rows = $stmt->fetchAll();

            if ($action === 'stats') {
                $completed = 0;
                $progress = 0;
                $km = 0.0;

                foreach ($rows as $row) {
                    if ($row['delivery_status'] === 'delivered') {
                        $completed++;
                        $km += (float) ($row['distance_km'] ?? 0);
                    } else {
                        $progress++;
                    }
                }

                respond([
                    'success' => true,
                    'data' => [
                        'completed' => $completed,
                        'in_progress' => $progress,
                        'km' => round($km, 1)
                    ]
                ]);
            }

            respond([
                'success' => true,
                'data' => $rows,
                'courier' => $courier
            ]);
        }

        respond([
            'success' => false,
            'message' => 'Unknown action.'
        ], 400);
    }

    if ($method !== 'POST') {
        respond([
            'success' => false,
            'message' => 'GET or POST required.'
        ], 405);
    }

    $courier = require_courier($pdo, $id);

    $deliveryId = filter_var(
        $data['delivery_id'] ?? null,
        FILTER_VALIDATE_INT
    );

    if (!$deliveryId || $deliveryId < 1) {
        respond([
            'success' => false,
            'message' => 'Invalid delivery ID.'
        ], 400);
    }

    // Accept delivery
    if ($action === 'accept') {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            UPDATE deliveries
            SET courier_id = ?,
                status = 'assigned',
                assigned_at = NOW()
            WHERE delivery_id = ?
              AND status = 'awaiting_courier'
              AND courier_id IS NULL
        ");

        $stmt->execute([$id, $deliveryId]);

        if ($stmt->rowCount() !== 1) {
            $pdo->rollBack();

            respond([
                'success' => false,
                'message' => 'This delivery is no longer available. Refresh the queue.'
            ], 409);
        }

        $pdo->commit();

        respond([
            'success' => true,
            'message' => 'Delivery accepted.'
        ]);
    }

    // Update delivery status
    if ($action === 'status') {
        $newStatus = $data['status'] ?? '';

        if ($newStatus === 'assigned') {
            $stmt = $pdo->prepare("
                UPDATE deliveries
                SET status = 'picked_up',
                    picked_up_at = NOW()
                WHERE delivery_id = ?
                  AND courier_id = ?
                  AND status = 'assigned'
            ");
        } elseif ($newStatus === 'picked_up') {
            $stmt = $pdo->prepare("
                UPDATE deliveries
                SET status = 'en_route'
                WHERE delivery_id = ?
                  AND courier_id = ?
                  AND status = 'picked_up'
            ");
        } else {
            respond([
                'success' => false,
                'message' => 'Invalid status transition.'
            ], 400);
        }

        $stmt->execute([$deliveryId, $id]);

        if ($stmt->rowCount() !== 1) {
            respond([
                'success' => false,
                'message' => 'Delivery status was changed already or this delivery is not yours.'
            ], 409);
        }

        respond([
            'success' => true,
            'message' => 'Delivery status updated.'
        ]);
    }

    // Complete delivery
    if ($action === 'complete') {
        $code = strtoupper(trim((string) ($data['claim_code'] ?? '')));
        $distance = filter_var(
            $data['distance_km'] ?? null,
            FILTER_VALIDATE_FLOAT
        );
        $mode = $data['transport_mode'] ?? '';

        if (
            $code === '' ||
            $distance === false ||
            $distance <= 0 ||
            !in_array($mode, [
                'walking',
                'cycling',
                'public_transport',
                'other'
            ], true)
        ) {
            respond([
                'success' => false,
                'message' => 'Enter a valid claim code, distance greater than zero, and transport mode.'
            ], 400);
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            SELECT
                d.delivery_id,
                d.claim_id,
                c.claim_code,
                c.status AS claim_status
            FROM deliveries d
            INNER JOIN claims c
                ON c.claim_id = d.claim_id
            WHERE d.delivery_id = ?
              AND d.courier_id = ?
              AND d.status = 'en_route'
            FOR UPDATE
        ");

        $stmt->execute([$deliveryId, $id]);
        $row = $stmt->fetch();

        if (!$row) {
            $pdo->rollBack();

            respond([
                'success' => false,
                'message' => 'This delivery is not yours or is not marked en route.'
            ], 409);
        }

        if (
            strtoupper($row['claim_code']) !== $code ||
            $row['claim_status'] !== 'pending'
        ) {
            $pdo->rollBack();

            respond([
                'success' => false,
                'message' => 'Incorrect claim code or claim is no longer pending.'
            ], 400);
        }

        $updateDelivery = $pdo->prepare("
            UPDATE deliveries
            SET status = 'delivered',
                distance_km = ?,
                transport_mode = ?,
                delivered_at = NOW()
            WHERE delivery_id = ?
              AND courier_id = ?
              AND status = 'en_route'
        ");

        $updateDelivery->execute([
            $distance,
            $mode,
            $deliveryId,
            $id
        ]);

        $updateClaim = $pdo->prepare("
            UPDATE claims
            SET status = 'confirmed'
            WHERE claim_id = ?
              AND status = 'pending'
        ");

        $updateClaim->execute([$row['claim_id']]);

        if (
            $updateDelivery->rowCount() !== 1 ||
            $updateClaim->rowCount() !== 1
        ) {
            $pdo->rollBack();

            respond([
                'success' => false,
                'message' => 'Could not complete delivery. Refresh and try again.'
            ], 409);
        }

        $pdo->commit();

        respond([
            'success' => true,
            'message' => 'Delivery completed successfully.'
        ]);
    }

    respond([
        'success' => false,
        'message' => 'Unknown action.'
    ], 400);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log($e->getMessage());

    respond([
        'success' => false,
        'message' => 'Server error. Check the PHP error log.'
    ], 500);
}
