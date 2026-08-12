<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DatabaseBackupController extends Controller
{
    use ApiResponse;

    protected string $backupDir;

    public function __construct()
    {
        $this->backupDir = storage_path('app/backups');
        if (!file_exists($this->backupDir)) {
            mkdir($this->backupDir, 0775, true);
        }
    }

    /**
     * Database backups contain every row in the system — customers, invoices,
     * password hashes, API tokens — so this entire controller is admin-only.
     * There is no dedicated permission key for it in the access matrix by design.
     */
    private function denyIfNotAdmin(Request $request): ?JsonResponse
    {
        if ($request->user()?->role !== 'admin') {
            return $this->errorResponse('Unauthorized action. Admin access required.', 403);
        }

        return null;
    }

    /**
     * List all database backups.
     */
    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->denyIfNotAdmin($request)) {
            return $deny;
        }

        $files = glob($this->backupDir . '/*.sql');
        $backups = [];

        foreach ($files as $file) {
            $filename = basename($file);
            $size = filesize($file);
            $ctime = filemtime($file);

            $backups[] = [
                'filename' => $filename,
                'size_bytes' => $size,
                'formatted_size' => $this->formatSizeUnits($size),
                'created_at' => date('Y-m-d H:i:s', $ctime),
                'timestamp' => $ctime,
            ];
        }

        // Sort latest backups first
        usort($backups, function ($a, $b) {
            return $b['timestamp'] <=> $a['timestamp'];
        });

        // Get basic database info
        $dbName = config('database.connections.mysql.database', 'becha_kena_erp');
        $tableCount = 0;
        try {
            $tables = DB::select('SHOW TABLES');
            $tableCount = count($tables);
        } catch (\Throwable $e) {
            // Fallback for sqlite if used
            $tableCount = count(DB::select("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"));
        }

        return $this->successResponse([
            'backups' => $backups,
            'db_name' => $dbName,
            'total_tables' => $tableCount,
            'storage_directory' => $this->backupDir,
        ], 'Database backups retrieved successfully.');
    }

    /**
     * Generate a new database backup (.sql file).
     */
    public function generate(Request $request): JsonResponse
    {
        if ($deny = $this->denyIfNotAdmin($request)) {
            return $deny;
        }

        $user = $request->user();
        $dbConnection = config('database.default');

        try {
            $filename = 'backup_' . date('Y-m-d_H-i-s') . '.sql';
            $filepath = $this->backupDir . '/' . $filename;

            $sqlContent = $this->dumpDatabase($dbConnection);
            file_put_contents($filepath, $sqlContent);

            $fileSize = filesize($filepath);

            // Record audit log
            AuditLog::record(
                $user->id,
                $user->name,
                'generate',
                'DatabaseBackup',
                null,
                null,
                ['filename' => $filename, 'size' => $fileSize],
                "Generated database backup file: {$filename}"
            );

            return $this->successResponse([
                'filename' => $filename,
                'formatted_size' => $this->formatSizeUnits($fileSize),
                'created_at' => date('Y-m-d H:i:s'),
            ], 'Database backup generated successfully!');
        } catch (\Throwable $e) {
            return $this->errorResponse('Failed to generate database backup: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Download a database backup file.
     */
    public function download(Request $request, string $filename): BinaryFileResponse|JsonResponse
    {
        if ($deny = $this->denyIfNotAdmin($request)) {
            return $deny;
        }

        $filepath = $this->backupDir . '/' . basename($filename);

        if (!file_exists($filepath)) {
            return $this->notFoundResponse('Backup file not found.');
        }

        return response()->download($filepath, basename($filename), [
            'Content-Type' => 'application/sql',
        ]);
    }

    /**
     * Restore database from a backup file.
     */
    public function restore(Request $request, string $filename): JsonResponse
    {
        if ($deny = $this->denyIfNotAdmin($request)) {
            return $deny;
        }

        $user = $request->user();
        $filepath = $this->backupDir . '/' . basename($filename);

        if (!file_exists($filepath)) {
            return $this->notFoundResponse('Backup file not found.');
        }

        try {
            $sql = file_get_contents($filepath);

            DB::beginTransaction();
            DB::statement('SET FOREIGN_KEY_CHECKS=0;');
            DB::unprepared($sql);
            DB::statement('SET FOREIGN_KEY_CHECKS=1;');
            DB::commit();

            AuditLog::record(
                $user->id,
                $user->name,
                'restore',
                'DatabaseBackup',
                null,
                null,
                ['filename' => $filename],
                "Restored database from backup file: {$filename}"
            );

            return $this->successResponse(null, "Database restored successfully from {$filename}.");
        } catch (\Throwable $e) {
            DB::rollBack();
            return $this->errorResponse('Failed to restore database: ' . $e->getMessage(), 500);
        }
    }

    /**
     * Delete a database backup file.
     */
    public function destroy(Request $request, string $filename): JsonResponse
    {
        if ($deny = $this->denyIfNotAdmin($request)) {
            return $deny;
        }

        $user = $request->user();
        $filepath = $this->backupDir . '/' . basename($filename);

        if (!file_exists($filepath)) {
            return $this->notFoundResponse('Backup file not found.');
        }

        unlink($filepath);

        AuditLog::record(
            $user->id,
            $user->name,
            'delete',
            'DatabaseBackup',
            null,
            null,
            ['filename' => $filename],
            "Deleted database backup file: {$filename}"
        );

        return $this->successResponse(null, 'Backup file deleted successfully.');
    }

    /**
     * Pure PHP PDO SQL Dumper - platform independent (MySQL & SQLite support)
     */
    protected function dumpDatabase(string $connection): string
    {
        $out = [];
        $out[] = "-- ========================================================";
        $out[] = "-- DHAKABLINDS-IMS DATABASE BACKUP DUMP";
        $out[] = "-- Generated on: " . date('Y-m-d H:i:s');
        $out[] = "-- Database: " . config('database.connections.' . $connection . '.database', 'becha_kena_erp');
        $out[] = "-- ========================================================\n";
        $out[] = "SET FOREIGN_KEY_CHECKS=0;\n";

        $pdo = DB::connection()->getPdo();
        $driver = config("database.connections.{$connection}.driver", 'mysql');

        if ($driver === 'sqlite') {
            $tablesQuery = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            $tables = $tablesQuery->fetchAll(\PDO::FETCH_COLUMN);

            foreach ($tables as $table) {
                $out[] = "-- --------------------------------------------------------";
                $out[] = "-- Table structure for table `{$table}`";
                $out[] = "-- --------------------------------------------------------";
                $out[] = "DROP TABLE IF EXISTS `{$table}`;";

                $createStmt = $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($table))->fetchColumn();
                $out[] = $createStmt . ";\n";

                $rowsQuery = $pdo->query("SELECT * FROM `{$table}`");
                $rows = $rowsQuery->fetchAll(\PDO::FETCH_ASSOC);

                if (!empty($rows)) {
                    $out[] = "-- Dumping data for table `{$table}`";
                    foreach ($rows as $row) {
                        $cols = array_keys($row);
                        $escapedCols = array_map(fn($c) => "`{$c}`", $cols);
                        $escapedVals = array_map(function ($val) use ($pdo) {
                            if ($val === null) return 'NULL';
                            return $pdo->quote($val);
                        }, array_values($row));

                        $out[] = "INSERT INTO `{$table}` (" . implode(', ', $escapedCols) . ") VALUES (" . implode(', ', $escapedVals) . ");";
                    }
                    $out[] = "";
                }
            }
        } else {
            // MySQL / MariaDB
            $tablesQuery = $pdo->query("SHOW TABLES");
            $tables = $tablesQuery->fetchAll(\PDO::FETCH_COLUMN);

            foreach ($tables as $table) {
                $out[] = "-- --------------------------------------------------------";
                $out[] = "-- Table structure for table `{$table}`";
                $out[] = "-- --------------------------------------------------------";
                $out[] = "DROP TABLE IF EXISTS `{$table}`;";

                $createRow = $pdo->query("SHOW CREATE TABLE `{$table}`")->fetch(\PDO::FETCH_ASSOC);
                $createTableSql = $createRow['Create Table'] ?? array_values($createRow)[1] ?? '';
                $out[] = $createTableSql . ";\n";

                $rowsQuery = $pdo->query("SELECT * FROM `{$table}`");
                $rows = $rowsQuery->fetchAll(\PDO::FETCH_ASSOC);

                if (!empty($rows)) {
                    $out[] = "-- Dumping data for table `{$table}` (" . count($rows) . " rows)";
                    foreach ($rows as $row) {
                        $cols = array_keys($row);
                        $escapedCols = array_map(fn($c) => "`{$c}`", $cols);
                        $escapedVals = array_map(function ($val) use ($pdo) {
                            if ($val === null) return 'NULL';
                            return $pdo->quote($val);
                        }, array_values($row));

                        $out[] = "INSERT INTO `{$table}` (" . implode(', ', $escapedCols) . ") VALUES (" . implode(', ', $escapedVals) . ");";
                    }
                    $out[] = "";
                }
            }
        }

        $out[] = "SET FOREIGN_KEY_CHECKS=1;";
        return implode("\n", $out);
    }

    /**
     * Helper to format bytes to human readable size
     */
    protected function formatSizeUnits(int $bytes): string
    {
        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2) . ' GB';
        } elseif ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2) . ' MB';
        } elseif ($bytes >= 1024) {
            return number_format($bytes / 1024, 2) . ' KB';
        } elseif ($bytes > 1) {
            return $bytes . ' bytes';
        } elseif ($bytes == 1) {
            return '1 byte';
        } else {
            return '0 bytes';
        }
    }
}
