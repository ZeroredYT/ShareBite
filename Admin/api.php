<?php
header('Content-Type: application/json');
require 'database.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    // 1. Fetch all dashboard data
    case 'get_data':
        try {
            $mealsStmt = $pdo->query("SELECT SUM(portions) AS meals, SUM(estimated_kg) AS kg FROM listings WHERE status='collected'");
            $impact = $mealsStmt->fetch();

            $listings = $pdo->query("
                SELECT l.*, c.name AS category_name, loc.name AS location_name, loc.building, u.name AS provider_name,
                IF(l.is_verified = 1, 'approved', 'unreviewed') AS review
                FROM listings l 
                JOIN categories c ON l.category_id = c.category_id 
                JOIN locations loc ON l.location_id = loc.location_id 
                JOIN users u ON l.provider_id = u.user_id
            ")->fetchAll();

            $users = $pdo->query("
                SELECT user_id AS id, name, email, role, 
                IF(is_verified = 1, 'verified', 'unverified') AS approval, 
                IF(is_active = 1, 'active', 'deactivated') AS account 
                FROM users
            ")->fetchAll();

            $categories = $pdo->query("
                SELECT category_id AS id, name, 
                IF(is_active = 1, 'active', 'hidden') AS status 
                FROM categories
            ")->fetchAll();

            $locations = $pdo->query("
                SELECT location_id AS id, name, building, 
                IF(is_active = 1, 'active', 'hidden') AS status 
                FROM locations
            ")->fetchAll();

            echo json_encode([
                "success" => true,
                "stats" => [
                    "meals" => $impact['meals'] ?? 0,
                    "food_kg" => $impact['kg'] ?? 0
                ],
                "listings" => $listings,
                "users" => $users,
                "categories" => $categories,
                "locations" => $locations
            ]);
        } catch (Exception $e) {
            echo json_encode(["success" => false, "message" => $e->getMessage()]);
        }
        break;

    // 2. Add Category
    case 'add_category':
        $data = json_decode(file_get_contents("php://input"), true);
        $name = trim($data['name'] ?? '');
        if ($name) {
            $stmt = $pdo->prepare("INSERT INTO categories (name, is_active) VALUES (?, 1)");
            $stmt->execute([$name]);
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "message" => "Category name cannot be empty"]);
        }
        break;

    // 3. Add Location
    case 'add_location':
        $data = json_decode(file_get_contents("php://input"), true);
        $name = trim($data['name'] ?? '');
        $building = trim($data['building'] ?? '');
        if ($name && $building) {
            $stmt = $pdo->prepare("INSERT INTO locations (name, building, is_active) VALUES (?, ?, 1)");
            $stmt->execute([$name, $building]);
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "message" => "Location name and building required"]);
        }
        break;

    // 4. Toggle Category Status (Active <-> Hidden)
    case 'toggle_category':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            $stmt = $pdo->prepare("UPDATE categories SET is_active = NOT is_active WHERE category_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            echo json_encode(["success" => false, "message" => $e->getMessage()]);
        }
        break;

    // 5. Delete or Hide Category (Handles foreign key restriction safely)
    case 'delete_category':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            // Try to delete directly
            $stmt = $pdo->prepare("DELETE FROM categories WHERE category_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (PDOException $e) {
            // If listings use it, foreign key restriction prevents deletion. Hide it instead!
            $stmt = $pdo->prepare("UPDATE categories SET is_active = 0 WHERE category_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true, "message" => "Category is in use by listings, so it was hidden instead of deleted."]);
        }
        break;

    // 6. Toggle Location Status (Active <-> Hidden)
    case 'toggle_location':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            $stmt = $pdo->prepare("UPDATE locations SET is_active = NOT is_active WHERE location_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            echo json_encode(["success" => false, "message" => $e->getMessage()]);
        }
        break;

    default:
        echo json_encode(["success" => false, "message" => "Invalid action requested"]);
        break;

    // 7. Delete or Hide Location (Handles foreign key restriction safely)
    case 'delete_location':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            // Try to delete directly
            $stmt = $pdo->prepare("DELETE FROM locations WHERE location_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (PDOException $e) {
            // If listings/deliveries use it, foreign key restriction prevents deletion. Hide it instead!
            $stmt = $pdo->prepare("UPDATE locations SET is_active = 0 WHERE location_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true, "message" => "Location is in use by existing records, so it was hidden instead of deleted."]);
        }
        break;

    // 8. Approve or Verify User
    case 'approve_user':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            $stmt = $pdo->prepare("UPDATE users SET is_verified = 1 WHERE user_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            echo json_encode(["success" => false, "message" => $e->getMessage()]);
        }
        break;

    // 9. Toggle User Account Status (Active <-> Deactivated)
    case 'toggle_user_account':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            $stmt = $pdo->prepare("UPDATE users SET is_active = NOT is_active WHERE user_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (Exception $e) {
            echo json_encode(["success" => false, "message" => $e->getMessage()]);
        }
        break;

    // 10. Delete User (Safely handles foreign key restrictions if listings/claims exist)
    case 'delete_user':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $data['id'] ?? 0;
        try {
            $stmt = $pdo->prepare("DELETE FROM users WHERE user_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true]);
        } catch (PDOException $e) {
            // If user has related records (listings/deliveries), deactivate them instead of hard deleting
            $stmt = $pdo->prepare("UPDATE users SET is_active = 0 WHERE user_id = ?");
            $stmt->execute([$id]);
            echo json_encode(["success" => true, "message" => "User has existing system records, so the account was deactivated instead of deleted."]);
        }
        break;
}
?>