import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import 'package:system_audio_recorder/system_audio_recorder.dart';
import '../state/app_state.dart';
import '../services/signaling_service.dart';
import '../services/webrtc_service.dart';
import '../widgets/chat_widget.dart';
import '../widgets/users_list_widget.dart';

/// Broadcaster screen for sharing system audio
class BroadcasterScreen extends StatefulWidget {
  const BroadcasterScreen({super.key});

  @override
  State<BroadcasterScreen> createState() => _BroadcasterScreenState();
}

class _BroadcasterScreenState extends State<BroadcasterScreen>
    with TickerProviderStateMixin {
  late AnimationController _visualizerController;
  bool _showChat = false;
  bool _showUsers = false;
  bool _isRecording = false;
  
  // Real-time audio levels for visualizer
  List<double> _audioLevels = List.filled(20, 0.0);
  StreamSubscription? _audioStreamSubscription;
  
  // Audio level monitoring
  double _currentAudioLevel = 0.0;
  bool _lowAudioDetected = false;
  int _zeroAudioCounter = 0;

  @override
  void initState() {
    super.initState();
    _visualizerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    )..repeat();
    
    // Start WebRTC broadcasting
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _startBroadcasting();
    });
  }
  
  Future<void> _startBroadcasting() async {
    final webrtcService = context.read<WebRTCService>();
    final signalingService = context.read<SignalingService>();
    
    try {      
      debugPrint('[BroadcasterScreen] Requesting MediaProjection permission...');
      
      // Request permission from user
      final isConfirmed = await SystemAudioRecorder.requestRecord(
        titleNotification: 'Music Sharer Broadcasting',
        messageNotification: 'Sharing system audio with listeners',
      );
      
      debugPrint('[BroadcasterScreen] Permission result: $isConfirmed');
      
      if (!isConfirmed) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Screen capture permission required to broadcast audio'),
              backgroundColor: Colors.orange,
            ),
          );
          // Return to home screen
          Navigator.of(context).pop();
        }
        return;
      }
      
      debugPrint('[BroadcasterScreen] Starting audio recording in stream mode...');
      
      // Start recording to stream (not file)
      final isStarted = await SystemAudioRecorder.startRecord(
        toStream: true,
        toFile: false,
        filePath: null,
      );
      
      if (!isStarted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Failed to start audio recording')),
          );
          Navigator.of(context).pop();
        }
        return;
      }
      
      setState(() => _isRecording = true);
      
      debugPrint('[BroadcasterScreen] Audio recording started, setting up stream...');
      
      // Subscribe to the audio stream
      final audioStream = SystemAudioRecorder.audioStream.receiveBroadcastStream({});
      
      // Create a stream controller to convert dynamic stream to Uint8List
      final StreamController<Uint8List> audioStreamController = StreamController<Uint8List>();
      
      _audioStreamSubscription = audioStream.listen(
        (dynamic data) {
          if (data is Uint8List || data is List<int>) {
            final Uint8List audioData = data is Uint8List ? data : Uint8List.fromList(data as List<int>);
            
            // Calculate audio levels for visualizer
            _calculateAudioLevels(audioData);
            
            // Check for blocked audio
            _checkForBlockedAudio(audioData);
            
            // Forward to WebRTC
            audioStreamController.add(audioData);
          }
        },
        onError: (error) {
          debugPrint('[BroadcasterScreen] Audio stream error: $error');
        },
        cancelOnError: false,
      );
      
      // Set up WebRTC callbacks BEFORE starting broadcast
      webrtcService.onOffer = (String listenerId, RTCSessionDescription offer) {
        debugPrint('[BroadcasterScreen] Sending offer to listener $listenerId');
        signalingService.sendOffer(listenerId, {
          'sdp': offer.sdp,
          'type': offer.type,
        });
      };
      
      webrtcService.onBroadcasterIceCandidate = (String listenerId, RTCIceCandidate candidate) {
        debugPrint('[BroadcasterScreen] Sending ICE candidate to listener $listenerId');
        signalingService.sendBroadcasterIceCandidate(listenerId, {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        });
      };
      
      // Start broadcasting with the audio stream
      await webrtcService.startBroadcast(audioStreamController.stream);
      
      // Set up signaling callbacks for new listeners
      signalingService.onNewListener = (listenerId, userName) async {
        debugPrint('[BroadcasterScreen] New listener: $listenerId ($userName)');
        await webrtcService.handleNewListener(listenerId);
      };
      
      signalingService.onAnswer = (data) async {
        final listenerId = data['senderId'] as String?;
        final answer = data['answer'] as Map<String, dynamic>?;
        
        if (listenerId != null && answer != null) {
          final sdp = answer['sdp'] as String;
          final type = answer['type'] as String;
          await webrtcService.handleAnswer(
            listenerId,
            RTCSessionDescription(sdp, type),
          );
        }
      };
      
      debugPrint('[BroadcasterScreen] Broadcasting started successfully');
    } catch (e, stackTrace) {
      debugPrint('[BroadcasterScreen] Error starting broadcast: $e');
      debugPrint('[BroadcasterScreen] Stack trace: $stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
        Navigator.of(context).pop();
      }
    }
  }
  
  /// Check audio levels and update indicators
  void _checkForBlockedAudio(Uint8List audioData) {
    // Calculate average level
    double totalLevel = 0.0;
    for (final level in _audioLevels) {
      totalLevel += level;
    }
    double avgLevel = totalLevel / _audioLevels.length;
    
    // Update current audio level
    if (mounted) {
      setState(() {
        _currentAudioLevel = avgLevel;
      });
    }
    
    // If average level is very low (< 0.01)
    if (avgLevel < 0.01) {
      _zeroAudioCounter++;
      // After 30 checks (~3 seconds at 10 checks/sec), show low audio indicator
      if (_zeroAudioCounter > 30) {
        if (!_lowAudioDetected && mounted) {
          setState(() => _lowAudioDetected = true);
        }
      }
    } else {
      // Reset counter when real audio detected
      _zeroAudioCounter = 0;
      if (_lowAudioDetected && mounted) {
        setState(() => _lowAudioDetected = false);
      }
    }
  }

  @override
  void dispose() {
    _visualizerController.dispose();
    _audioStreamSubscription?.cancel();
    // Stop recording if still active
    if (_isRecording) {
      SystemAudioRecorder.stopRecord();
    }
    // Note: WebRTC and signaling cleanup is handled by their respective services
    super.dispose();
  }
  
  /// Calculate audio levels from PCM data for visualizer
  void _calculateAudioLevels(Uint8List audioData) {
    // Calculate RMS (Root Mean Square) for audio visualization
    // PCM 16-bit stereo at 48kHz
    const int bytesPerSample = 2; // 16-bit = 2 bytes
    const int channels = 2; // Stereo
    const int samplesPerBar = 2048; // Samples to average per bar
    
    List<double> newLevels = [];
    
    for (int barIndex = 0; barIndex < 20; barIndex++) {
      int startByte = barIndex * samplesPerBar * bytesPerSample * channels;
      if (startByte >= audioData.length) {
        newLevels.add(0.0);
        continue;
      }
      
      double sum = 0.0;
      int sampleCount = 0;
      
      for (int i = startByte; i < audioData.length && i < startByte + (samplesPerBar * bytesPerSample * channels); i += bytesPerSample) {
        // Read 16-bit signed PCM sample
        if (i + 1 < audioData.length) {
          int sample = (audioData[i + 1] << 8) | audioData[i];
          // Convert to signed
          if (sample > 32767) sample -= 65536;
          // Normalize to 0-1 range
          double normalized = sample.abs() / 32768.0;
          sum += normalized * normalized;
          sampleCount++;
        }
      }
      
      // Calculate RMS and apply smoothing
      double rms = sampleCount > 0 ? sqrt(sum / sampleCount) : 0.0;
      // Apply some gain to make visualization more visible
      rms = (rms * 2.0).clamp(0.0, 1.0);
      newLevels.add(rms);
    }
    
    if (mounted) {
      setState(() {
        _audioLevels = newLevels;
      });
    }
  }
  void _toggleChat() {
    setState(() {
      _showChat = !_showChat;
      if (_showChat) _showUsers = false;
    });
  }

  void _toggleUsers() {
    setState(() {
      _showUsers = !_showUsers;
      if (_showUsers) _showChat = false;
    });
  }

  Future<void> _stopBroadcast() async {
    final appState = context.read<AppState>();
    final signalingService = context.read<SignalingService>();
    final webrtcService = context.read<WebRTCService>();

    // Stop system audio recording
    if (_isRecording) {
      await SystemAudioRecorder.stopRecord();
      setState(() => _isRecording = false);
    }
    
    await webrtcService.stopBroadcast();
    signalingService.leaveRoom();
    appState.resetState();

    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (!didPop) {
          final confirm = await showDialog<bool>(
            context: context,
            builder: (context) => AlertDialog(
              backgroundColor: const Color(0xFF1E1E2E),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              title: const Text('Stop Broadcasting?'),
              content: const Text('This will disconnect all listeners.'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const Text('Cancel'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context, true),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                  ),
                  child: const Text('Stop'),
                ),
              ],
            ),
          );

          if (confirm == true && mounted) {
            await _stopBroadcast();
          }
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Broadcasting'),
          automaticallyImplyLeading: false,
          actions: [
            IconButton(
              icon: Icon(
                _showUsers ? Icons.people : Icons.people_outline,
                color: _showUsers ? const Color(0xFF6366F1) : null,
              ),
              onPressed: _toggleUsers,
            ),
            IconButton(
              icon: Icon(
                _showChat ? Icons.chat : Icons.chat_outlined,
                color: _showChat ? const Color(0xFF6366F1) : null,
              ),
              onPressed: _toggleChat,
            ),
          ],
        ),
        body: SafeArea(
          child: _showChat
              ? const ChatWidget()
              : _showUsers
                  ? const UsersListWidget()
                  : _buildMainContent(),
        ),
      ),
    );
  }

  Widget _buildMainContent() {
    return Consumer<AppState>(
      builder: (context, appState, _) {
        return Consumer<WebRTCService>(
          builder: (context, webrtcService, _) {
            return Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  // Room code card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        children: [
                          Text(
                            'Room Code',
                            style: TextStyle(
                              color: Colors.grey.shade400,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            appState.roomCode ?? '------',
                            style: const TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 8,
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Share URL button
                          OutlinedButton.icon(
                            onPressed: () {
                              // TODO: Implement share URL
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                  content: Text('Room code copied!'),
                                ),
                              );
                            },
                            icon: const Icon(Icons.share),
                            label: const Text('Share Room'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Status indicator with audio level
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(color: Colors.green, width: 2),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.fiber_manual_record,
                            color: Colors.green, size: 16),
                        const SizedBox(width: 8),
                        const Text(
                          'Capturing',
                          style: TextStyle(
                            color: Colors.green,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          '${(_currentAudioLevel * 100).toStringAsFixed(0)}%',
                          style: TextStyle(
                            color: Colors.green.shade300,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Low audio warning (simple indicator)
                  if (_lowAudioDetected)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.orange.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.orange.shade700, width: 1),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.info_outline, color: Colors.orange.shade300, size: 16),
                          const SizedBox(width: 8),
                          Text(
                            'Low/No audio detected - Some apps may block capture',
                            style: TextStyle(
                              color: Colors.orange.shade300,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 16),

                  // Listener count
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.people, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        '${webrtcService.listenerConnectionsCount} ${webrtcService.listenerConnectionsCount == 1 ? "listener" : "listeners"}',
                        style: const TextStyle(fontSize: 16),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),

                  // Audio visualizer
                  Expanded(
                    child: _buildAudioVisualizer(webrtcService.isBroadcasting),
                  ),
                  const SizedBox(height: 32),

                  // Control buttons
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Pause/Resume button
                      ElevatedButton.icon(
                        onPressed: () => webrtcService.toggleBroadcastMute(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: webrtcService.isBroadcastMuted
                              ? Colors.amber.shade700
                              : Colors.amber.shade600,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 16,
                          ),
                        ),
                        icon: Icon(webrtcService.isBroadcastMuted
                            ? Icons.play_arrow
                            : Icons.pause),
                        label: Text(
                            webrtcService.isBroadcastMuted ? 'Resume' : 'Pause'),
                      ),
                      const SizedBox(width: 16),
                      // Stop button
                      ElevatedButton.icon(
                        onPressed: _stopBroadcast,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade700,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 16,
                          ),
                        ),
                        icon: const Icon(Icons.stop),
                        label: const Text('Stop'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildAudioVisualizer(bool isActive) {
    return AnimatedBuilder(
      animation: _visualizerController,
      builder: (context, _) {
        return Container(
          decoration: BoxDecoration(
            color: const Color(0xFF1E1E2E),
            borderRadius: BorderRadius.circular(20),
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const Text(
                '🎵',
                style: TextStyle(fontSize: 48),
              ),
              const SizedBox(height: 20),
              Expanded(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: List.generate(
                    20,
                    (index) => _buildVisualizerBar(index, isActive),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                isActive ? 'Broadcasting...' : 'Paused',
                style: TextStyle(
                  color: isActive ? Colors.white : Colors.grey.shade500,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildVisualizerBar(int index, bool isActive) {
    // Use real audio levels instead of random values
    final double audioLevel = index < _audioLevels.length ? _audioLevels[index] : 0.0;
    final height = isActive
        ? 0.1 + audioLevel * 0.9  // Real audio level (0.1 to 1.0)
        : 0.05;  // Minimal height when paused

    return AnimatedContainer(
      duration: const Duration(milliseconds: 50),  // Faster response for real-time feel
      width: 8,
      height: 150 * height,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: isActive
              ? [
                  Color(0xFF6366F1),
                  audioLevel > 0.7 ? Color(0xFFEF4444) : Color(0xFFA855F7),  // Red for high levels
                ]
              : [
                  Colors.grey.shade800,
                  Colors.grey.shade700,
                ],
        ),
        borderRadius: BorderRadius.circular(4),
      ),
    );
  }
}
