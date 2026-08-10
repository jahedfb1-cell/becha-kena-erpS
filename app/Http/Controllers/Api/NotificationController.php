<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Get paginated notifications & unread count for current authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $notifications = Notification::where('user_id', $userId)
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->get('type')))
            ->when($request->filled('is_read'), fn ($q) => $q->where('is_read', $request->boolean('is_read')))
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        $unreadCount = Notification::where('user_id', $userId)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'status' => 'success',
            'data' => $notifications->items(),
            'unread_count' => $unreadCount,
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
            ],
        ]);
    }

    /**
     * Mark a single notification as read.
     */
    public function markAsRead(Request $request, $id): JsonResponse
    {
        $notification = Notification::where('user_id', $request->user()->id)
            ->where('id', $id)
            ->firstOrFail();

        $notification->update([
            'is_read' => true,
            'read_at' => now(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Notification marked as read.',
            'data' => $notification,
        ]);
    }

    /**
     * Mark all unread notifications as read for current user.
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        Notification::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'status' => 'success',
            'message' => 'All notifications marked as read.',
        ]);
    }

    /**
     * Get Email & SMS notification settings for current user.
     */
    public function getSettings(Request $request): JsonResponse
    {
        $settings = NotificationSetting::firstOrCreate(
            ['user_id' => $request->user()->id],
            [
                'email_enabled' => true,
                'sms_enabled'   => false,
                'events'        => [],
            ]
        );

        return response()->json([
            'status' => 'success',
            'data' => $settings,
        ]);
    }

    /**
     * Update Email & SMS notification settings for current user.
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email_enabled' => 'required|boolean',
            'sms_enabled'   => 'required|boolean',
            'events'        => 'nullable|array',
        ]);

        $settings = NotificationSetting::updateOrCreate(
            ['user_id' => $request->user()->id],
            [
                'email_enabled' => $validated['email_enabled'],
                'sms_enabled'   => $validated['sms_enabled'],
                'events'        => $validated['events'] ?? [],
            ]
        );

        return response()->json([
            'status' => 'success',
            'message' => 'Notification preferences updated successfully.',
            'data' => $settings,
        ]);
    }
}
