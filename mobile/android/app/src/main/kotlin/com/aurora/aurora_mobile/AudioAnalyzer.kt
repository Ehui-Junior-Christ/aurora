package com.aurora.aurora_mobile

import android.content.ContentUris
import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.provider.MediaStore
import java.io.File
import java.nio.ByteOrder
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Offline loudness analysis of a local track for audio-reactive visuals,
 * without the microphone permission the live Visualizer API would need.
 *
 * Decodes the file (MediaCodec), downmixes to mono and computes, at 50 frames
 * per second, the RMS of three bands: bass (< ~150 Hz), mids, highs (> ~4 kHz).
 * Each band is normalised to 0..255 against its own 98th percentile.
 * Output: [fps, n frames (u16 LE), then n x (bass, mid, high)] bytes, cached
 * in the app cache directory.
 */
object AudioAnalyzer {
    private const val FPS = 50

    fun analyze(ctx: Context, mediaId: Long): ByteArray? {
        // Low priority: playback and UI threads always win over the analysis.
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND)
        val cache = File(ctx.cacheDir, "analysis_v1_$mediaId.bin")
        if (cache.exists() && cache.length() > 4) return cache.readBytes()

        val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, mediaId)
        val extractor = MediaExtractor()
        extractor.setDataSource(ctx, uri, null)
        var track = -1
        var format: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val f = extractor.getTrackFormat(i)
            if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) { track = i; format = f; break }
        }
        if (track < 0 || format == null) { extractor.release(); return null }
        extractor.selectTrack(track)

        val mime = format.getString(MediaFormat.KEY_MIME)!!
        var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val codec = MediaCodec.createDecoderByType(mime)
        codec.configure(format, null, null, 0)
        codec.start()

        val bass = ArrayList<Float>(15000)
        val mid = ArrayList<Float>(15000)
        val high = ArrayList<Float>(15000)
        var hop = sampleRate / FPS
        var count = 0
        var sb = 0.0; var sm = 0.0; var sh = 0.0
        var lp1 = 0.0; var lp2 = 0.0
        var aLow = 1 - exp(-2 * Math.PI * 150.0 / sampleRate)
        var aHigh = 1 - exp(-2 * Math.PI * 4000.0 / sampleRate)

        val info = MediaCodec.BufferInfo()
        var inputDone = false
        var outputDone = false
        val started = System.currentTimeMillis()
        while (!outputDone) {
            if (System.currentTimeMillis() - started > 60_000) break // safety
            if (!inputDone) {
                val inIndex = codec.dequeueInputBuffer(10_000)
                if (inIndex >= 0) {
                    val buf = codec.getInputBuffer(inIndex)!!
                    val size = extractor.readSampleData(buf, 0)
                    if (size < 0) {
                        codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        inputDone = true
                    } else {
                        codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                        extractor.advance()
                    }
                }
            }
            val outIndex = codec.dequeueOutputBuffer(info, 10_000)
            if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val f = codec.outputFormat
                sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                hop = sampleRate / FPS
                aLow = 1 - exp(-2 * Math.PI * 150.0 / sampleRate)
                aHigh = 1 - exp(-2 * Math.PI * 4000.0 / sampleRate)
            } else if (outIndex >= 0) {
                val out = codec.getOutputBuffer(outIndex)!!
                out.position(info.offset)
                out.limit(info.offset + info.size)
                val pcm = out.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
                val frames = pcm.remaining() / channels
                for (f in 0 until frames) {
                    var x = 0.0
                    for (c in 0 until channels) x += pcm.get()
                    x /= (channels * 32768.0)
                    lp1 += aLow * (x - lp1)          // bass
                    lp2 += aHigh * (x - lp2)         // everything below 4 kHz
                    val h = x - lp2                  // highs
                    val m = lp2 - lp1                // mids
                    sb += lp1 * lp1; sm += m * m; sh += h * h
                    if (++count >= hop) {
                        bass.add(sqrt(sb / count).toFloat())
                        mid.add(sqrt(sm / count).toFloat())
                        high.add(sqrt(sh / count).toFloat())
                        count = 0; sb = 0.0; sm = 0.0; sh = 0.0
                    }
                }
                codec.releaseOutputBuffer(outIndex, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
            }
        }
        codec.stop(); codec.release(); extractor.release()
        val n = minOf(bass.size, 65535) // u16 header: ~21 min at 50 fps
        if (n == 0) return null

        fun norm(v: ArrayList<Float>): FloatArray {
            val sorted = v.toFloatArray().also { it.sort() }
            val ref = max(sorted[((n - 1) * 0.98).toInt()], 1e-6f)
            return FloatArray(n) { (v[it] / ref).coerceIn(0f, 1f) }
        }
        val b = norm(bass); val m = norm(mid); val h = norm(high)
        val outBytes = ByteArray(3 + n * 3)
        outBytes[0] = FPS.toByte()
        outBytes[1] = (n and 0xFF).toByte()
        outBytes[2] = ((n shr 8) and 0xFF).toByte()
        for (i in 0 until n) {
            outBytes[3 + i * 3] = (b[i] * 255).toInt().toByte()
            outBytes[4 + i * 3] = (m[i] * 255).toInt().toByte()
            outBytes[5 + i * 3] = (h[i] * 255).toInt().toByte()
        }
        cache.writeBytes(outBytes)
        return outBytes
    }
}
