<?php
$content = file_get_contents('frontend/src/pages/Orders.jsx');
$lines = explode("\n", $content);

foreach ($lines as $num => $line) {
    if (strpos($line, 'removeSizeRowFromBlock') !== false) {
        echo "Line " . ($num + 1) . ": " . trim($line) . "\n";
    }
}
