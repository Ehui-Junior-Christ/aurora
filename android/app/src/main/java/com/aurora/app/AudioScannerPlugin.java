package com.aurora.app;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "AudioScanner",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {
                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                "android.permission.READ_MEDIA_AUDIO" // Using string literal for Android 13+ compatibility on older SDKs
            }
        )
    }
)
public class AudioScannerPlugin extends Plugin {

    @PluginMethod
    public void scanAudio(PluginCall call) {
        if (!hasPermission("storage")) {
            requestPermissionForAlias("storage", call, "permissionCallback");
            return;
        }

        performScan(call);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (!hasPermission("storage")) {
            call.reject("Permission denied");
            return;
        }
        performScan(call);
    }

    private void performScan(PluginCall call) {
        JSArray tracks = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        String[] projection = new String[] {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA
        };

        // Only music files
        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " ASC";

        try (Cursor cursor = resolver.query(
                collection,
                projection,
                selection,
                null,
                sortOrder
        )) {
            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);

                while (cursor.moveToNext()) {
                    JSObject track = new JSObject();
                    track.put("id", String.valueOf(cursor.getLong(idCol)));
                    track.put("title", cursor.getString(titleCol));
                    
                    String artist = cursor.getString(artistCol);
                    if (artist == null || artist.equals("<unknown>")) {
                        artist = "Unknown Artist";
                    }
                    track.put("artist", artist);
                    track.put("album", cursor.getString(albumCol));
                    track.put("duration", cursor.getLong(durationCol) / 1000.0);
                    track.put("path", cursor.getString(dataCol));
                    
                    tracks.put(track);
                }
            }
        } catch (Exception e) {
            Log.e("AudioScanner", "Error scanning audio", e);
            call.reject("Error scanning audio", e);
            return;
        }

        JSObject result = new JSObject();
        result.put("tracks", tracks);
        call.resolve(result);
    }
}
