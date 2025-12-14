package com.musicsharer.music_sharer_flutter

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import io.flutter.Log
import io.flutter.plugin.common.EventChannel
import kotlinx.coroutines.*

/**
 * Foreground service for capturing system audio using MediaProjection API
 * Requires Android 10 (API 29) or higher
 */
class AudioCaptureService : Service() {
    companion object {
        private const val TAG = "AudioCaptureService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "audio_capture_channel"
        private const val SAMPLE_RATE = 48000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_STEREO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        
        var eventSink: EventChannel.EventSink? = null
        var isCapturing = false
        var isPaused = false
    }

    private var mediaProjection: MediaProjection? = null
    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START_CAPTURE" -> {
                val resultCode = intent.getIntExtra("result_code", Activity.RESULT_CANCELED)
                val data = intent.getParcelableExtra<Intent>("data")
                
                if (resultCode == Activity.RESULT_OK && data != null) {
                    startCapture(resultCode, data)
                } else {
                    Log.e(TAG, "Invalid MediaProjection data")
                    stopSelf()
                }
            }
            "STOP_CAPTURE" -> stopCapture()
            "PAUSE_CAPTURE" -> pauseCapture()
            "RESUME_CAPTURE" -> resumeCapture()
        }
        
        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Audio Capture",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "System audio capture notification"
                setShowBadge(false)
            }
            
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForeground() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Music Sharer")
            .setContentText("Capturing system audio...")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, 
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startCapture(resultCode: Int, data: Intent) {
        try {
            // Start foreground service first (required for Android 10+)
            startForeground()
            
            // Get MediaProjection
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) 
                as MediaProjectionManager
            mediaProjection = projectionManager.getMediaProjection(resultCode, data)
            
            if (mediaProjection == null) {
                Log.e(TAG, "Failed to obtain MediaProjection")
                stopSelf()
                return
            }
            
            // Configure audio capture
            val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection!!)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()
            
            val audioFormat = AudioFormat.Builder()
                .setEncoding(AUDIO_FORMAT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(CHANNEL_CONFIG)
                .build()
            
            val minBufferSize = AudioRecord.getMinBufferSize(
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT
            )
            
            audioRecord = AudioRecord.Builder()
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(minBufferSize * 2)
                .setAudioPlaybackCaptureConfig(config)
                .build()
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed")
                stopSelf()
                return
            }
            
            // Start recording
            audioRecord?.startRecording()
            isCapturing = true
            isPaused = false
            
            // Start capture loop
            startCaptureLoop(minBufferSize)
            
            Log.d(TAG, "Audio capture started successfully")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting audio capture: ${e.message}")
            e.printStackTrace()
            stopSelf()
        }
    }

    private fun startCaptureLoop(bufferSize: Int) {
        captureJob = scope.launch {
            val buffer = ByteArray(bufferSize)
            
            while (isActive && isCapturing) {
                if (isPaused) {
                    delay(100)
                    continue
                }
                
                try {
                    val readResult = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                    
                    if (readResult > 0) {
                        // Send audio data to Flutter via EventChannel
                        withContext(Dispatchers.Main) {
                            eventSink?.success(buffer.copyOf(readResult))
                        }
                    } else if (readResult < 0) {
                        Log.e(TAG, "AudioRecord read error: $readResult")
                        break
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error reading audio: ${e.message}")
                    break
                }
            }
        }
    }

    private fun pauseCapture() {
        isPaused = true
        Log.d(TAG, "Audio capture paused")
    }

    private fun resumeCapture() {
        isPaused = false
        Log.d(TAG, "Audio capture resumed")
    }

    private fun stopCapture() {
        Log.d(TAG, "Stopping audio capture")
        
        isCapturing = false
        isPaused = false
        
        captureJob?.cancel()
        captureJob = null
        
        audioRecord?.apply {
            if (state == AudioRecord.STATE_INITIALIZED) {
                stop()
            }
            release()
        }
        audioRecord = null
        
        mediaProjection?.stop()
        mediaProjection = null
        
        stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        stopCapture()
        scope.cancel()
        super.onDestroy()
    }
}
