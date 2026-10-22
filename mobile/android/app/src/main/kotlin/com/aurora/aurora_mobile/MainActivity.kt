package com.aurora.aurora_mobile

import android.content.ComponentName
import android.content.ContentUris
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import com.ryanheise.audioservice.AudioServiceActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.util.Calendar
import java.util.concurrent.Executors

/**
 * AudioServiceActivity keeps the media session (lock screen / notification)
 * attached. The "aurora/media" channel reads the device music library from
 * MediaStore: no file paths are exposed, playback uses content:// URIs.
 */
class MainActivity : AudioServiceActivity() {
    private val io = Executors.newSingleThreadExecutor()
    private val analysisPool = Executors.newSingleThreadExecutor()

    /**
     * Day / night launcher icon. Applied when the app goes to the background
     * (switching the enabled alias while visible can restart the task).
     */
    override fun onStop() {
        super.onStop()
        applyIconForTime()
    }

    private fun applyIconForTime() {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val day = hour in 7..18
        setAlias("DayIcon", day)
        setAlias("NightIcon", !day)
    }

    private fun setAlias(name: String, enabled: Boolean) {
        val component = ComponentName(this, "$packageName.$name")
        val wanted = if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        if (packageManager.getComponentEnabledSetting(component) == wanted) return
        try {
            packageManager.setComponentEnabledSetting(component, wanted, PackageManager.DONT_KILL_APP)
        } catch (_: Exception) { }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "aurora/media")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "scan" -> io.execute {
                        try {
                            val tracks = scan()
                            runOnUiThread { result.success(tracks) }
                        } catch (e: Exception) {
                            runOnUiThread { result.error("SCAN_FAILED", e.message, null) }
                        }
                    }
                    "artwork" -> {
                        val id = (call.argument<Number>("id") ?: 0).toLong()
                        val size = (call.argument<Number>("size") ?: 512).toInt()
                        io.execute {
                            val bytes = try { artwork(id, size) } catch (e: Exception) { null }
                            runOnUiThread { result.success(bytes) }
                        }
                    }
                    "analyze" -> {
                        val id = (call.argument<Number>("id") ?: 0).toLong()
                        analysisPool.execute {
                            val bytes = try { AudioAnalyzer.analyze(this, id) } catch (e: Exception) { null }
                            runOnUiThread { result.success(bytes) }
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun scan(): List<Map<String, Any?>> {
        val out = ArrayList<Map<String, Any?>>()
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.SIZE,
        )
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= 20000"
        contentResolver.query(collection, projection, selection, null, "${MediaStore.Audio.Media.TITLE} COLLATE NOCASE ASC")?.use { c ->
            val id = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val title = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artist = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val album = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val albumId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
            val duration = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val added = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
            val size = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
            while (c.moveToNext()) {
                val mediaId = c.getLong(id)
                out.add(
                    mapOf(
                        "id" to mediaId,
                        "uri" to ContentUris.withAppendedId(collection, mediaId).toString(),
                        "title" to (c.getString(title) ?: ""),
                        "artist" to (c.getString(artist) ?: ""),
                        "album" to (c.getString(album) ?: ""),
                        "albumId" to c.getLong(albumId),
                        "durationMs" to c.getLong(duration),
                        "addedAt" to c.getLong(added) * 1000,
                        "size" to c.getLong(size),
                    )
                )
            }
        }
        return out
    }

    /** Embedded cover (Android 10+ thumbnail API), PNG/JPEG bytes or null. */
    private fun artwork(id: Long, size: Int): ByteArray? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
        val bmp = contentResolver.loadThumbnail(uri, Size(size, size), null)
        val stream = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 88, stream)
        bmp.recycle()
        return stream.toByteArray()
    }
}
