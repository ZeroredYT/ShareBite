<?php
// Turn off error display so PHP notices don't break JSON formatting
error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json');
require_once 'db.php';

$recipient_id = 3;

// 1. Available Food Listings
$listings_query = "SELECT l.listing_id, l.title, l.portions, l.estimated_kg, l.needs_courier, l.expiry_time, c.name AS category_name, loc.name AS location_name, loc.building, u.name AS provider_name FROM listings l JOIN categories c ON l.category_id = c.category_id JOIN locations loc ON l.location_id = loc.location_id JOIN users u ON l.provider_id = u.user_id WHERE l.status = 'available' ORDER BY l.created_at DESC";
$listings_result = mysqli_query($conn, $listings_query);

$listings = [];
if ($listings_result) {
    while ($row = mysqli_fetch_assoc($listings_result)) {
        $now = new DateTime();
        $expiry = new DateTime($row['expiry_time']);
        $interval = $now->diff($expiry);
        $remaining_minutes = $interval->invert ? 0 : ($interval->h * 60) + $interval->i;

        $time_text = "";
        if ($interval->h > 0) {
            $time_text .= $interval->h . "h ";
        }
        $time_text .= $interval->i . "m left";

        $cat_parts = explode(' ', $row['category_name']);
        
        $row['remaining_minutes'] = $remaining_minutes;
        $row['time_text'] = $time_text;
        $row['category_short'] = $cat_parts[0];
        $row['formatted_expiry'] = date('M d, h:i A', strtotime($row['expiry_time']));
        $listings[] = $row;
    }
}

// 2. Active Claims
$claims_query = "SELECT cl.claim_id, cl.claim_code, cl.status AS claim_status, cl.rating, cl.feedback, l.title AS item_title, l.portions, u_prov.name AS provider_name, d.status AS delivery_status, loc.name AS dropoff_name, loc.building AS dropoff_building, u_cour.name AS courier_name FROM claims cl JOIN listings l ON cl.listing_id = l.listing_id JOIN users u_prov ON l.provider_id = u_prov.user_id LEFT JOIN deliveries d ON cl.claim_id = d.claim_id LEFT JOIN locations loc ON d.dropoff_location_id = loc.location_id LEFT JOIN users u_cour ON d.courier_id = u_cour.user_id WHERE cl.recipient_id = $recipient_id ORDER BY cl.claimed_at DESC";
$claims_result = mysqli_query($conn, $claims_query);

$claims = [];
if ($claims_result) {
    while ($claim = mysqli_fetch_assoc($claims_result)) {
        $claims[] = $claim;
    }
}

// 3. Recipient Impact Statistics
$impact_query = "SELECT COUNT(cl.claim_id) AS total_pickups, COALESCE(SUM(l.portions), 0) AS total_meals, COALESCE(SUM(l.estimated_kg), 0) AS total_kg FROM claims cl JOIN listings l ON cl.listing_id = l.listing_id WHERE cl.recipient_id = $recipient_id AND cl.status = 'confirmed'";
$impact_result = mysqli_query($conn, $impact_query);
$impact = $impact_result ? mysqli_fetch_assoc($impact_result) : ['total_pickups' => 0, 'total_meals' => 0, 'total_kg' => 0];

echo json_encode([
    'listings' => $listings,
    'claims' => $claims,
    'impact' => $impact
]);
?>