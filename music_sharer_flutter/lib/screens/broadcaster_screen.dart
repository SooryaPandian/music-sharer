import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/signaling_service.dart';
import '../services/webrtc_service.dart';
import '../services/audio_capture_service.dart';
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
  
  // Real-time audio levels for visualizer
  List<double> _audioLevels = List.filled(20, 0.0);
  StreamSubscription<Uint8List>? _audioLevelSubscription;

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
    final audioCaptureService = context.read<AudioCaptureService>();
    final signalingService = context.read<SignalingService>();
    
    try {
      // Get audio stream from native
      final audioStream = audioCaptureService.audioStream;
      if (audioStream != null) {
        // Subscribe to audio stream to calculate real-time levels for visualizer
        _audioLevelSubscription = audioStream.listen((Uint8List audioData) {
          _calculateAudioLevels(audioData);
        });
        
        // Set up WebRTC callbacks BEFORE starting broadcast
        // These callbacks will send offers and ICE candidates to listeners
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
        await webrtcService.startBroadcast(audioStream);
        
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
      } else {
        debugPrint('[BroadcasterScreen] No audio stream available');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Audio stream not available')),
          );
        }
      }
    } catch (e) {
      debugPrint('[BroadcasterScreen] Error starting broadcast: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  void dispose() {
    _visualizerController.dispose();
    _audioLevelSubscription?.cancel();
    // Note: WebRTC and signaling cleanup is handled by their respective services
    // when the user navigates away from this screen
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
    final audioCaptureService = context.read<AudioCaptureService>();

    await webrtcService.stopBroadcast();
    await audioCaptureService.stopCapture();
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

                  // Status indicator
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(color: Colors.green, width: 2),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.fiber_manual_record,
                            color: Colors.green, size: 16),
                        SizedBox(width: 8),
                        Text(
                          'Capturing System Audio',
                          style: TextStyle(
                            color: Colors.green,
                            fontWeight: FontWeight.w600,
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
