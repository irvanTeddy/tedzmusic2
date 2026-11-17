<?php

use App\Http\Controllers\Api\MusicController;
use App\Http\Controllers\Api\PlaylistController;
use Illuminate\Support\Facades\Route;

Route::get('/music/trending', [MusicController::class, 'trending']);
Route::get('/music/search', [MusicController::class, 'search']);

Route::get('/playlists', [PlaylistController::class, 'index']);
Route::post('/playlists', [PlaylistController::class, 'store']);
Route::post('/playlists/{playlist}/tracks', [PlaylistController::class, 'addTrack']);
