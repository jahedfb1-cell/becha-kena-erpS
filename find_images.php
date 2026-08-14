<?php
$dirs = [
    'C:/Users/ASUS/.gemini/antigravity-ide/brain',
    'E:/ai project 1/becha-kena-erp'
];

foreach ($dirs as $dir) {
    if (!is_dir($dir)) continue;
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && strtolower($file->getExtension()) === 'md') {
            $content = file_get_contents($file->getPathname());
            if (strpos($content, '![') !== false) {
                echo "File: " . $file->getPathname() . "\n";
                $lines = explode("\n", $content);
                foreach ($lines as $line) {
                    if (strpos($line, '![') !== false) {
                        echo "  " . trim($line) . "\n";
                    }
                }
            }
        }
    }
}
