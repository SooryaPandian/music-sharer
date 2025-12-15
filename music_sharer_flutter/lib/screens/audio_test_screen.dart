import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:system_audio_recorder/system_audio_recorder.dart';

/// Audio test screen for debugging system audio capture
/// Records audio to WAV file and plays it back to verify capture works
class AudioTestScreen extends StatefulWidget {
  const AudioTestScreen({super.key});

  @override
  State<AudioTestScreen> createState() => _AudioTestScreenState();
}

class _AudioTestScreenState extends State<AudioTestScreen> {
  bool _isRecording = false;
  bool _hasRecording = false;
  String? _recordingPath;
  Duration _recordingDuration = Duration.zero;
  Timer? _durationTimer;
  int _recordedBytes = 0;
  
  // Audio player
  final AudioPlayer _audioPlayer = AudioPlayer();
  bool _isPlaying = false;
  Duration _playbackPosition = Duration.zero;
  Duration _playbackDuration = Duration.zero;
  StreamSubscription? _playerPositionSubscription;
  StreamSubscription? _playerDurationSubscription;
  StreamSubscription? _playerStateSubscription;
  
  // Audio level monitoring
  double _currentAudioLevel = 0.0;
  Timer? _audioLevelTimer;
  StreamSubscription? _audioStreamSubscription;

  @override
  void initState() {
    super.initState();
    
    // Listen to player position
    _playerPositionSubscription = _audioPlayer.onPositionChanged.listen((position) {
      if (mounted) {
        setState(() {
          _playbackPosition = position;
        });
      }
    });
    
    // Listen to player duration
    _playerDurationSubscription = _audioPlayer.onDurationChanged.listen((duration) {
      if (mounted) {
        setState(() {
          _playbackDuration = duration;
        });
      }
    });
    
    // Listen to player state
    _playerStateSubscription = _audioPlayer.onPlayerStateChanged.listen((state) {
      if (mounted) {
        setState(() {
          _isPlaying = state == PlayerState.playing;
          if (state == PlayerState.completed) {
            _playbackPosition = Duration.zero;
          }
        });
      }
    });
  }
  
  @override
  void dispose() {
    _audioPlayer.dispose();
    _playerPositionSubscription?.cancel();
    _playerDurationSubscription?.cancel();
    _playerStateSubscription?.cancel();
    _audioLevelTimer?.cancel();
    _audioStreamSubscription?.cancel();
    super.dispose();
  }

  Future<void> _startRecording() async {
    try {
      debugPrint('[AudioTest] ========== Starting Recording ==========');
      
      // Clear previous recording
      _recordedBytes = 0;
      _recordingDuration = Duration.zero;
      
      // Get output path for WAV file
      final directory = await getApplicationDocumentsDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final wavPath = '${directory.path}/recording_$timestamp.wav';
      
      debugPrint('[AudioTest] Output path: $wavPath');
      
      // Ensure output file doesn't exist
      final outputFile = File(wavPath);
      if (await outputFile.exists()) {
        await outputFile.delete();
      }
      
      // Request permission and start recording
      debugPrint('[AudioTest] Requesting MediaProjection permission...');
      final isConfirmed = await SystemAudioRecorder.requestRecord(
        titleNotification: 'Audio Test Recording',
        messageNotification: 'Recording system audio for testing',
      );
      
      debugPrint('[AudioTest] Permission result: $isConfirmed');
      
      if (!isConfirmed) {
        _showError('Please grant screen capture permission to record audio');
        return;
      }
      
      // Start recording to file
      debugPrint('[AudioTest] Starting recording to file...');
      final isStarted = await SystemAudioRecorder.startRecord(
        toStream: false,
        toFile: true,
        filePath: wavPath,
      );
      
      debugPrint('[AudioTest] Recording started: $isStarted');
      
      if (!isStarted) {
        _showError('Failed to start recording');
        return;
      }
      
      // Store the recording path
      _recordingPath = wavPath;
      
      setState(() {
        _isRecording = true;
        _hasRecording = false;
      });
      
      // Start duration timer
      _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (mounted) {
          setState(() {
            _recordingDuration = Duration(seconds: timer.tick);
          });
          
          // Update file size if file exists
          _updateFileSize();
        }
      });
      
      debugPrint('[AudioTest] ✅ Recording started successfully');
      _showSuccess('Recording started! Play some audio on your device.');
      
      // Start monitoring audio levels in real-time
      _startAudioLevelMonitoring();
    } catch (e, stackTrace) {
      debugPrint('[AudioTest] ❌ Failed to start recording: $e');
      debugPrint('[AudioTest] Stack trace: $stackTrace');
      _showError('Failed to start recording: $e');
      setState(() => _isRecording = false);
    }
  }
  
  Future<void> _updateFileSize() async {
    if (_recordingPath != null) {
      try {
        final file = File(_recordingPath!);
        if (await file.exists()) {
          final size = await file.length();
          if (mounted) {
            setState(() {
              _recordedBytes = size;
            });
          }
        }
      } catch (e) {
        // Ignore errors during size check
      }
    }
  }

  Future<void> _stopRecording() async {
    debugPrint('[AudioTest] ========== Stopping Recording ==========');
    
    // Stop duration timer
    _durationTimer?.cancel();
    _durationTimer = null;
    
    // Stop the system audio recorder
    try {
      debugPrint('[AudioTest] Stopping system audio recorder...');
      await SystemAudioRecorder.stopRecord();
      debugPrint('[AudioTest] ✅ Recorder stopped');
    } catch (e) {
      debugPrint('[AudioTest] ⚠️ Error stopping recorder: $e');
    }
    
    setState(() => _isRecording = false);
    
    // Check if we have a recording file
    if (_recordingPath == null) {
      debugPrint('[AudioTest] ❌ No recording path available');
      _showError('No recording path available');
      return;
    }
    
    final wavFile = File(_recordingPath!);
    if (!await wavFile.exists()) {
      debugPrint('[AudioTest] ❌ WAV file does not exist');
      _showError('Recording file not found');
      return;
    }
    
    final fileSize = await wavFile.length();
    debugPrint('[AudioTest] WAV file size: $fileSize bytes');
    
    if (fileSize == 0) {
      debugPrint('[AudioTest] ❌ WAV file is empty');
      _showError('No audio data recorded. Make sure audio is playing on your device.');
      return;
    }
    
    // Recording is ready
    setState(() {
      _hasRecording = true;
      _recordedBytes = fileSize;
    });
    
    debugPrint('[AudioTest] ✅ Recording saved: $_recordingPath');
    _showSuccess('Recording saved! ${_formatBytes(_recordedBytes)} recorded');
    
    // Stop audio level monitoring
    _stopAudioLevelMonitoring();
  }
  
  void _startAudioLevelMonitoring() {
    // Subscribe to audio stream to calculate levels
    final audioStream = SystemAudioRecorder.audioStream.receiveBroadcastStream({});
    
    _audioStreamSubscription = audioStream.listen(
      (dynamic data) {
        if (data is Uint8List || data is List<int>) {
          final Uint8List audioData = data is Uint8List ? data : Uint8List.fromList(data as List<int>);
          _calculateAudioLevel(audioData);
        }
      },
      onError: (error) {
        debugPrint('[AudioTest] Audio stream error: $error');
      },
      cancelOnError: false,
    );
  }
  
  void _stopAudioLevelMonitoring() {
    _audioStreamSubscription?.cancel();
    _audioStreamSubscription = null;
    if (mounted) {
      setState(() {
        _currentAudioLevel = 0.0;
      });
    }
  }
  
  void _calculateAudioLevel(Uint8List audioData) {
    // Calculate RMS level from PCM data
    const int bytesPerSample = 2; // 16-bit = 2 bytes
    double sum = 0.0;
    int sampleCount = 0;
    
    for (int i = 0; i < audioData.length - 1; i += bytesPerSample) {
      // Read 16-bit signed PCM sample
      int sample = (audioData[i + 1] << 8) | audioData[i];
      // Convert to signed
      if (sample > 32767) sample -= 65536;
      // Normalize to 0-1 range
      double normalized = sample.abs() / 32768.0;
      sum += normalized * normalized;
      sampleCount++;
    }
    
    // Calculate RMS
    double rms = sampleCount > 0 ? sqrt(sum / sampleCount) : 0.0;
    // Apply some gain to make visualization more visible
    rms = (rms * 2.0).clamp(0.0, 1.0);
    
    if (mounted) {
      setState(() {
        _currentAudioLevel = rms;
      });
    }
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    return '${twoDigits(duration.inMinutes)}:${twoDigits(duration.inSeconds.remainder(60))}';
  }

  void _showError(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  void _showSuccess(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  Future<void> _deleteRecording() async {
    if (_recordingPath != null) {
      try {
        // Stop playback first if playing
        await _audioPlayer.stop();
        
        final file = File(_recordingPath!);
        if (await file.exists()) {
          await file.delete();
        }
        setState(() {
          _hasRecording = false;
          _recordingPath = null;
          _recordedBytes = 0;
          _recordingDuration = Duration.zero;
          _playbackPosition = Duration.zero;
          _playbackDuration = Duration.zero;
        });
        _showSuccess('Recording deleted');
      } catch (e) {
        _showError('Failed to delete: $e');
      }
    }
  }
  
  Future<void> _playRecording() async {
    if (_recordingPath == null) return;
    
    try {
      debugPrint('[AudioTest] Playing: $_recordingPath');
      await _audioPlayer.play(DeviceFileSource(_recordingPath!));
    } catch (e) {
      debugPrint('[AudioTest] Playback error: $e');
      _showError('Playback error: $e');
    }
  }
  
  Future<void> _pauseRecording() async {
    await _audioPlayer.pause();
  }
  
  Future<void> _stopPlayback() async {
    await _audioPlayer.stop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Audio Capture Test'),
        backgroundColor: const Color(0xFF6366F1),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Instructions
              Card(
                color: Colors.blue.shade900.withOpacity(0.3),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.blue.shade300),
                          const SizedBox(width: 8),
                          Text(
                            'How to Test',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: Colors.blue.shade300,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        '1. Play music/video on your device\n'
                        '2. Tap "Start Recording"\n'
                        '3. Let it record for 5-10 seconds\n'
                        '4. Tap "Stop Recording"\n'
                        '5. Open the saved file in a file manager\n'
                        '6. Play it to verify audio was captured',
                        style: TextStyle(fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              
              // Recording status
              if (_isRecording) ...[
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.red.shade900.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.red, width: 2),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.fiber_manual_record, color: Colors.red, size: 48),
                      const SizedBox(height: 12),
                      const Text(
                        'RECORDING',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.red,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _formatDuration(_recordingDuration),
                        style: const TextStyle(fontSize: 32, fontFamily: 'monospace'),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Level: ${(_currentAudioLevel * 100).toStringAsFixed(0)}%',
                        style: TextStyle(
                          color: _currentAudioLevel < 0.01 ? Colors.orange : Colors.green.shade300,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_formatBytes(_recordedBytes)} captured',
                        style: TextStyle(color: Colors.grey.shade400),
                      ),
                    ],
                  ),
                ),
              ] else if (_hasRecording) ...[
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.green.shade900.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.green, width: 2),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.check_circle, color: Colors.green, size: 48),
                      const SizedBox(height: 12),
                      const Text(
                        'Recording Saved!',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.green,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Duration: ${_formatDuration(_recordingDuration)}',
                        style: const TextStyle(fontSize: 16),
                      ),
                      Text(
                        'Size: ${_formatBytes(_recordedBytes)}',
                        style: TextStyle(color: Colors.grey.shade400),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _recordingPath ?? '',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade500,
                          fontFamily: 'monospace',
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade900.withOpacity(0.3),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      Icon(Icons.mic_none, color: Colors.grey.shade400, size: 48),
                      const SizedBox(height: 12),
                      Text(
                        'Ready to Record',
                        style: TextStyle(
                          fontSize: 20,
                          color: Colors.grey.shade400,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              
              const SizedBox(height: 32),
              
              // Control buttons
              if (_isRecording) ...[
                ElevatedButton.icon(
                  onPressed: _stopRecording,
                  icon: const Icon(Icons.stop),
                  label: const Text('Stop Recording'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red.shade700,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    textStyle: const TextStyle(fontSize: 18),
                  ),
                ),
              ] else ...[
                ElevatedButton.icon(
                  onPressed: _startRecording,
                  icon: const Icon(Icons.fiber_manual_record),
                  label: const Text('Start Recording'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    textStyle: const TextStyle(fontSize: 18),
                  ),
                ),
                if (_hasRecording) ...[
                  const SizedBox(height: 16),
                  // Playback controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Play/Pause button
                      ElevatedButton.icon(
                        onPressed: _isPlaying ? _pauseRecording : _playRecording,
                        icon: Icon(_isPlaying ? Icons.pause : Icons.play_arrow),
                        label: Text(_isPlaying ? 'Pause' : 'Play'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green.shade700,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                        ),
                      ),
                      if (_isPlaying) ...[
                        const SizedBox(width: 12),
                        // Stop button
                        ElevatedButton.icon(
                          onPressed: _stopPlayback,
                          icon: const Icon(Icons.stop),
                          label: const Text('Stop'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.grey.shade700,
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          ),
                        ),
                      ],
                    ],
                  ),
                  // Playback progress
                  if (_playbackDuration > Duration.zero) ...[
                    const SizedBox(height: 12),
                    Text(
                      '${_formatDuration(_playbackPosition)} / ${_formatDuration(_playbackDuration)}',
                      style: const TextStyle(fontSize: 14, fontFamily: 'monospace'),
                    ),
                  ],
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _deleteRecording,
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('Delete Recording'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red.shade400,
                      side: BorderSide(color: Colors.red.shade400),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ],
              ],
              
              const Spacer(),
              
              // Info card (simplified)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade900.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline, color: Colors.grey.shade400, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'WAV format, 48kHz Stereo. Some apps may block audio capture.',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade400,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
