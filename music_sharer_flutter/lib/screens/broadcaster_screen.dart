import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/signaling_service.dart';
import '../services/webrtc_service.dart';
import '../widgets/chat_widget.dart';
import '../widgets/users_list_widget.dart';

/// Broadcaster screen for sharing microphone audio
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
  
  // Visualizer animation
  List<double> _audioLevels = List.filled(20, 0.0);

  @override
  void initState() {
    super.initState();
    _visualizerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    )..repeat();
    
    // Animate visualizer bars
    Timer.periodic(const Duration(milliseconds: 100), (timer) {
      if (mounted) {
        final webrtcService = context.read<WebRTCService>();
        if (webrtcService.isBroadcasting && !webrtcService.isBroadcastMuted) {
          setState(() {
            _audioLevels = List.generate(20, (_) => Random().nextDouble());
          });
        } else {
          setState(() {
            _audioLevels = List.filled(20, 0.0);
          });
        }
      } else {
        timer.cancel();
      }
    });
    
    // Start WebRTC broadcasting
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _startBroadcasting();
    });
  }
  
  Future<void> _startBroadcasting() async {
    final webrtcService = context.read<WebRTCService>();
    final signalingService = context.read<SignalingService>();
    
    try {
      debugPrint('[BroadcasterScreen] Requesting microphone permission...');
      
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
      
      // Start broadcasting with microphone
      await webrtcService.startBroadcast();
      
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
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🎙️ Broadcasting your voice'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e, stackTrace) {
      debugPrint('[BroadcasterScreen] Error starting broadcast: $e');
      debugPrint('[BroadcasterScreen] Stack trace: $stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Microphone error: $e'),
            backgroundColor: Colors.red,
          ),
        );
        Navigator.of(context).pop();
      }
    }
  }

  @override
  void dispose() {
    _visualizerController.dispose();
    super.dispose();
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
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    decoration: BoxDecoration(
                      color: Colors.green.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(color: Colors.green, width: 2),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.mic, color: Colors.green, size: 20),
                        SizedBox(width: 8),
                        Text(
                          'Microphone Active',
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
                    child: _buildAudioVisualizer(webrtcService.isBroadcasting && !webrtcService.isBroadcastMuted),
                  ),
                  const SizedBox(height: 32),

                  // Control buttons
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Mute/Unmute button
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
                            ? Icons.mic_off
                            : Icons.mic),
                        label: Text(
                            webrtcService.isBroadcastMuted ? 'Unmute' : 'Mute'),
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
                '🎙️',
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
                isActive ? 'Broadcasting your voice...' : 'Muted',
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
    final double audioLevel = index < _audioLevels.length ? _audioLevels[index] : 0.0;
    final height = isActive
        ? 0.1 + audioLevel * 0.9
        : 0.05;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 50),
      width: 8,
      height: 150 * height,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: isActive
              ? [
                  const Color(0xFF6366F1),
                  audioLevel > 0.7 ? const Color(0xFFEF4444) : const Color(0xFFA855F7),
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
