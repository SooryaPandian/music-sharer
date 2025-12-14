package com.musicsharer.music_sharer_flutter

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import io.flutter.Log
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry

/**
 * Platform channel plugin for system audio capture
 * Bridges Flutter with native Android MediaProjection
 */
class AudioCapturePlugin : FlutterPlugin, ActivityAware, PluginRegistry.ActivityResultListener {
    companion object {
        private const val TAG = "AudioCapturePlugin"
        private const val METHOD_CHANNEL = "com.musicsharer/audio_capture"
        private const val EVENT_CHANNEL = "com.musicsharer/audio_stream"
        private const val REQUEST_MEDIA_PROJECTION = 1001
    }

    private lateinit var methodChannel: MethodChannel
    private lateinit var eventChannel: EventChannel
    private var activity: Activity? = null
    private var context: Context? = null
    private var activityBinding: ActivityPluginBinding? = null
    
    // Pending start - waiting for MediaProjection permission
    private var pendingStart = false

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        
        // Method channel for commands
        methodChannel = MethodChannel(binding.binaryMessenger, METHOD_CHANNEL)
        methodChannel.setMethodCallHandler { call, result ->
            when (call.method) {
                "startCapture" -> {
                    startCapture(result)
                }
                "stopCapture" -> {
                    stopCapture(result)
                }
                "pauseCapture" -> {
                    pauseCapture(result)
                }
                "resumeCapture" -> {
                    resumeCapture(result)
                }
                "isSupported" -> {
                    result.success(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                }
                else -> result.notImplemented()
            }
        }
        
        // Event channel for audio stream
        eventChannel = EventChannel(binding.binaryMessenger, EVENT_CHANNEL)
        eventChannel.setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                AudioCaptureService.eventSink = events
                Log.d(TAG, "Audio stream listener attached")
            }

            override fun onCancel(arguments: Any?) {
                AudioCaptureService.eventSink = null
                Log.d(TAG, "Audio stream listener cancelled")
            }
        })
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        methodChannel.setMethodCallHandler(null)
        eventChannel.setStreamHandler(null)
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
        activityBinding = binding
        binding.addActivityResultListener(this)
    }

    override fun onDetachedFromActivityForConfigChanges() {
        onDetachedFromActivity()
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        onAttachedToActivity(binding)
    }

    override fun onDetachedFromActivity() {
        activityBinding?.removeActivityResultListener(this)
        activityBinding = null
        activity = null
    }

    private fun startCapture(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            result.error("UNSUPPORTED", "MediaProjection requires Android 10+", null)
            return
        }
        
        val currentActivity = activity
        if (currentActivity == null) {
            result.error("NO_ACTIVITY", "Activity not available", null)
            return
        }
        
        try {
            // Request MediaProjection permission
            val projectionManager = context?.getSystemService(Context.MEDIA_PROJECTION_SERVICE) 
                as? MediaProjectionManager
            
            if (projectionManager == null) {
                result.error("NO_SERVICE", "MediaProjectionManager not available", null)
                return
            }
            
            val captureIntent = projectionManager.createScreenCaptureIntent()
            pendingStart = true
            
            // Store result callback for later
            pendingResult = result
            
            currentActivity.startActivityForResult(captureIntent, REQUEST_MEDIA_PROJECTION)
            Log.d(TAG, "MediaProjection permission requested")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting MediaProjection: ${e.message}")
            result.error("ERROR", e.message, null)
        }
    }

    private var pendingResult: MethodChannel.Result? = null

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode == REQUEST_MEDIA_PROJECTION) {
            if (pendingStart && pendingResult != null) {
                pendingStart = false
                
                if (resultCode == Activity.RESULT_OK && data != null) {
                    // Start the audio capture service
                    val serviceIntent = Intent(context, AudioCaptureService::class.java).apply {
                        action = "START_CAPTURE"
                        putExtra("result_code", resultCode)
                        putExtra("data", data)
                    }
                    
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context?.startForegroundService(serviceIntent)
                    } else {
                        context?.startService(serviceIntent)
                    }
                    
                    pendingResult?.success(true)
                    Log.d(TAG, "Audio capture service started")
                } else {
                    pendingResult?.success(false)
                    Log.d(TAG, "MediaProjection permission denied")
                }
                
                pendingResult = null
            }
            return true
        }
        return false
    }

    private fun stopCapture(result: MethodChannel.Result) {
        try {
            val serviceIntent = Intent(context, AudioCaptureService::class.java).apply {
                action = "STOP_CAPTURE"
            }
            context?.startService(serviceIntent)
            result.success(null)
            Log.d(TAG, "Stop capture requested")
        } catch (e: Exception) {
            result.error("ERROR", e.message, null)
        }
    }

    private fun pauseCapture(result: MethodChannel.Result) {
        try {
            val serviceIntent = Intent(context, AudioCaptureService::class.java).apply {
                action = "PAUSE_CAPTURE"
            }
            context?.startService(serviceIntent)
            result.success(null)
            Log.d(TAG, "Pause capture requested")
        } catch (e: Exception) {
            result.error("ERROR", e.message, null)
        }
    }

    private fun resumeCapture(result: MethodChannel.Result) {
        try {
            val serviceIntent = Intent(context, AudioCaptureService::class.java).apply {
                action = "RESUME_CAPTURE"
            }
            context?.startService(serviceIntent)
            result.success(null)
            Log.d(TAG, "Resume capture requested")
        } catch (e: Exception) {
            result.error("ERROR", e.message, null)
        }
    }
}
