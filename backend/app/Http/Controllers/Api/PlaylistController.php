<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Playlist;
use App\Models\Track;
use App\Models\User;
use Illuminate\Http\Request;

class PlaylistController extends Controller
{
    // Sementara memakai user pertama agar mudah dites di lokal tanpa login dulu
    private function currentUser(): User
    {
        return User::firstOrCreate(
            ['email' => 'demo@musicapp.local'],
            ['name' => 'Demo User', 'password' => bcrypt('password')]
        );
    }

    public function index()
    {
        $playlists = $this->currentUser()
            ->playlists()
            ->with('tracks')
            ->latest()
            ->get();

        return response()->json(['data' => $playlists]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
        ]);

        $playlist = $this->currentUser()->playlists()->create([
            'name' => $validated['name'],
        ]);

        return response()->json(['data' => $playlist], 201);
    }

    public function addTrack(Request $request, Playlist $playlist)
    {
        $validated = $request->validate([
            'video_id' => 'required|string',
            'title' => 'required|string',
            'artist' => 'required|string',
            'thumbnail_url' => 'nullable|string',
            'duration' => 'nullable|integer',
        ]);

        $track = Track::firstOrCreate(
            ['video_id' => $validated['video_id']],
            [
                'title' => $validated['title'],
                'artist' => $validated['artist'],
                'thumbnail_url' => $validated['thumbnail_url'] ?? null,
                'duration' => $validated['duration'] ?? 0,
            ]
        );

        $playlist->tracks()->syncWithoutDetaching([$track->id]);

        if (!$playlist->cover_url && $track->thumbnail_url) {
            $playlist->update(['cover_url' => $track->thumbnail_url]);
        }

        return response()->json([
            'message' => 'Lagu ditambahkan ke playlist',
            'data' => $playlist->load('tracks'),
        ]);
    }
}
