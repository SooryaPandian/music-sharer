import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'dart:async';

/// Service for system audio capture via native Android MediaProjection
class AudioCaptureService extends ChangeNotifier {
  static const MethodChannel _methodChannel =
      MethodChannel('com.musicsharer/audio_capture');
  static const EventChannel _eventChannel =
      EventChannel('com.musicsharer/audio_stream');

  StreamSubscription? _audioStreamSubscription;
  Stream<Uint8List>? _audioStream;
  bool _isCapturing = false;
  bool _isPaused = false;

  bool get isCapturing => _isCapturing;
  bool get isPaused => _isPaused;
  Stream<Uint8List>? get audioStream => _audioStream;

  /// Request MediaProjection permission and start capturing system audio
  Future<bool> startCapture() async {
    try {
      debugPrint('[AudioCaptureService] Starting system audio capture...');
      
      final bool result = await _methodChannel.invokeMethod('startCapture');
      
      if (result) {
        _isCapturing = true;
        _isPaused = false;
        
        // Set up audio stream from native
        _audioStream = _eventChannel.receiveBroadcastStream().map((event) {
          return event as Uint8List;
        });
        
        debugPrint('[AudioCaptureService] System audio capture started successfully');
        notifyListeners();
        return true;
      } else {
        debugPrint('[AudioCaptureService] Failed to start audio capture');
        return false;
      }
    } on PlatformException catch (e) {
      debugPrint('[AudioCaptureService] Error starting capture: ${e.message}');
      return false;
    }
  }

  /// Pause audio capture (keeps MediaProjection active)
  Future<void> pauseCapture() async {
    if (!_isCapturing || _isPaused) return;

    try {
      await _methodChannel.invokeMethod('pauseCapture');
      _isPaused = true;
      debugPrint('[AudioCaptureService] Audio capture paused');
      notifyListeners();
    } on PlatformException catch (e) {
      debugPrint('[AudioCaptureService] Error pausing capture: ${e.message}');
    }
  }

  /// Resume audio capture
  Future<void> resumeCapture() async {
    if (!_isCapturing || !_isPaused) return;

    try {
      await _methodChannel.invokeMethod('resumeCapture');
      _isPaused = false;
      debugPrint('[AudioCaptureService] Audio capture resumed');
      notifyListeners();
    } on PlatformException catch (e) {
      debugPrint('[AudioCaptureService] Error resuming capture: ${e.message}');
    }
  }

  /// Stop audio capture and release MediaProjection
  Future<void> stopCapture() async {
    if (!_isCapturing) return;

    try {
      await _methodChannel.invokeMethod('stopCapture');
      _isCapturing = false;
      _isPaused = false;
      _audioStream = null;
      await _audioStreamSubscription?.cancel();
      _audioStreamSubscription = null;
      
      debugPrint('[AudioCaptureService] Audio capture stopped');
      notifyListeners();
    } on PlatformException catch (e) {
      debugPrint('[AudioCaptureService] Error stopping capture: ${e.message}');
    }
  }

  /// Check if device supports system audio capture (Android 10+)
  Future<bool> isSupported() async {
    try {
      final bool supported = await _methodChannel.invokeMethod('isSupported');
      return supported;
    } on PlatformException catch (e) {
      debugPrint('[AudioCaptureService] Error checking support: ${e.message}');
      return false;
    }
  }

  @override
  void dispose() {
    stopCapture();
    super.dispose();
  }
}
