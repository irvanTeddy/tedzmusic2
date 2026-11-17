<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class MusicController extends Controller
{
    public function search(Request $request)
    {
        $query = trim($request->query('q', ''));

        if ($query === '') {
            return response()->json(['data' => []]);
        }

        $cacheKey = 'music_search_' . md5(strtolower($query));

        $results = Cache::remember($cacheKey, now()->addHour(), function () use ($query) {
            $baseUrl = rtrim(env('INNERTUBE_SERVICE_URL', 'http://localhost:3001'), '/');
            $response = Http::timeout(10)->get("{$baseUrl}/search", [
                'q' => $query,
            ]);

            if ($response->failed()) {
                return [];
            }

            return $response->json('data', []);
        });

        return response()->json(['data' => $results]);
    }

    public function trending()
    {
        $results = Cache::remember('music_trending_id', now()->addHours(3), function () {
            $baseUrl = rtrim(env('INNERTUBE_SERVICE_URL', 'http://localhost:3001'), '/');
            $response = Http::timeout(10)->get("{$baseUrl}/search", [
                'q' => 'top hits indonesia',
            ]);

            if ($response->failed()) {
                return [];
            }

            return $response->json('data', []);
        });

        return response()->json(['data' => $results]);
    }
}
