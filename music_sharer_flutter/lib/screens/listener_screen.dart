import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/signaling_service.dart';
import '../services/webrtc_service.dart';

class ListenerScreen extends StatefulWidget {
  const ListenerScreen({super.key});

  @override
  State<ListenerScreen> createState() => _ListenerScreenState();
}

class _ListenerScreenState extends State<ListenerScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseController;
  late AnimationController _visualizerController;

  @override
  void initState() {
    super.initState();
    
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _visualizerController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
    )..repeat();

    // Set up broadcaster left callback
    final signalingService = context.read<SignalingService>();
    signalingService.onBroadcasterLeft = () {
      _showDisconnectedDialog();
    };
    // Initialize and attach a renderer to ensure audio output on mobile
    final webrtcService = context.read<WebRTCService>();
    _initRendererAndAttach(webrtcService);
  }

  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();

  Future<void> _initRendererAndAttach(WebRTCService webrtcService) async {
    try {
      await _remoteRenderer.initialize();
      webrtcService.attachRenderer(_remoteRenderer);
    } catch (e) {
      debugPrint('[ListenerScreen] Renderer init failed: $e');
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _visualizerController.dispose();
    // Detach and dispose renderer
    final webrtcService = context.read<WebRTCService>();
    webrtcService.detachRenderer();
    _remoteRenderer.srcObject = null;
    _remoteRenderer.dispose();
    super.dispose();
  }

  void _showDisconnectedDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E1E2E),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Broadcaster Left'),
        content: const Text('The broadcaster has stopped sharing audio.'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _leaveRoom();
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _leaveRoom() {
    final signalingService = context.read<SignalingService>();
    final webrtcService = context.read<WebRTCService>();

    signalingService.leaveRoom();
    signalingService.disconnect();
    webrtcService.close();

    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope<void>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          _leaveRoom();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Listening'),
          automaticallyImplyLeading: false,
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                // Room code card
                Consumer<SignalingService>(
                  builder: (context, signaling, _) {
                    return Card(
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
                              signaling.roomCode ?? '------',
                              style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 8,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 24),

                // Connection status
                Consumer<WebRTCService>(
                  builder: (context, webrtc, _) {
                    return _buildStatusIndicator(webrtc.state);
                  },
                ),
                const SizedBox(height: 32),

                // Audio visualizer
                Expanded(
                  child: Consumer<WebRTCService>(
                    builder: (context, webrtc, _) {
                      return Stack(
                        children: [
                          // Invisible renderer ensures audio plays on mobile platforms
                          SizedBox(
                            width: 0,
                            height: 0,
                            child: RTCVideoView(_remoteRenderer),
                          ),
                          _buildAudioVisualizer(webrtc),
                        ],
                      );
                    },
                  ),
                ),
                const SizedBox(height: 32),

                // Leave button
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _leaveRoom,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('🚪', style: TextStyle(fontSize: 20)),
                        SizedBox(width: 8),
                        Text(
                          'Leave Room',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStatusIndicator(WebRTCState state) {
    Color statusColor;
    String statusText;
    IconData statusIcon;

    switch (state) {
      case WebRTCState.connected:
        statusColor = Colors.green;
        statusText = 'Connected';
        statusIcon = Icons.check_circle;
        break;
      case WebRTCState.connecting:
        statusColor = Colors.amber;
        statusText = 'Connecting...';
        statusIcon = Icons.sync;
        break;
      case WebRTCState.disconnected:
      case WebRTCState.failed:
        statusColor = Colors.red;
        statusText = state == WebRTCState.failed ? 'Connection Failed' : 'Disconnected';
        statusIcon = Icons.error;
        break;
      default:
        statusColor = Colors.grey;
        statusText = 'Waiting...';
        statusIcon = Icons.hourglass_empty;
    }

    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: BoxDecoration(
            color: statusColor.withAlpha(51),
            borderRadius: BorderRadius.circular(30),
            border: Border.all(
              color: statusColor.withAlpha((102 + (50 * _pulseController.value)).toInt()),
              width: 2,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(statusIcon, color: statusColor, size: 20),
              const SizedBox(width: 8),
              Text(
                statusText,
                style: TextStyle(
                  color: statusColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildAudioVisualizer(WebRTCService webrtc) {
    return AnimatedBuilder(
      animation: _visualizerController,
      builder: (context, _) {
        final isActive = webrtc.state == WebRTCState.connected;
        
        return Container(
          decoration: BoxDecoration(
            color: const Color(0xFF1E1E2E),
            borderRadius: BorderRadius.circular(20),
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Text(
                '🎵',
                style: TextStyle(
                  fontSize: 48,
                  shadows: isActive
                      ? [
                          Shadow(
                            color: const Color(0xFF6366F1).withAlpha(153),
                            blurRadius: 20,
                          ),
                        ]
                      : null,
                ),
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
                isActive ? 'Now Playing' : 'Waiting for audio...',
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
    final random = Random(DateTime.now().millisecondsSinceEpoch + index * 17);
    final height = isActive
        ? 0.2 + random.nextDouble() * 0.8
        : 0.1 + (sin(index * 0.3) * 0.05);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 8,
      height: 150 * height,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: isActive
              ? [
                  const Color(0xFF6366F1),
                  const Color(0xFFA855F7),
                ]
              : [
                  Colors.grey.shade700,
                  Colors.grey.shade600,
                ],
        ),
        borderRadius: BorderRadius.circular(4),
        boxShadow: isActive
            ? [
                BoxShadow(
                  color: const Color(0xFF6366F1).withAlpha(102),
                  blurRadius: 8,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
    );
  }
}
