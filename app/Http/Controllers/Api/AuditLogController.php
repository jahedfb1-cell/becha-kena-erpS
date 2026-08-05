<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of system audit logs.
     */
    public function index(Request $request): JsonResponse
    {
        if (!$request->user()->can('audit_logs:view') && $request->user()->role !== 'admin') {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $query = AuditLog::with('user:id,name,email');

        if ($request->filled('user_name')) {
            $query->where('user_name', 'LIKE', '%' . $request->user_name . '%');
        }
        if ($request->filled('action_type')) {
            $query->where('action_type', $request->action_type);
        }
        if ($request->filled('module')) {
            $query->where('module', $request->module);
        }
        if ($request->filled('from_date')) {
            $query->whereDate('created_at', '>=', $request->from_date);
        }
        if ($request->filled('to_date')) {
            $query->whereDate('created_at', '<=', $request->to_date);
        }

        $perPage = (int) $request->get('per_page', 25);
        $logs = $query->orderBy('id', 'desc')->paginate($perPage);

        return $this->paginatedResponse($logs, 'Audit logs retrieved successfully.');
    }
}
