import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/signaling_service.dart';
import '../services/webrtc_service.dart';
import '../state/app_state.dart';
import '../widgets/name_dialog.dart';
import 'broadcaster_screen.dart';
import 'listener_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _roomCodeController = TextEditingController();
  bool _isLoadingJoin = false;
  bool _isLoadingCreate = false;

  @override
  void initState() {
    super.initState();
    _checkAndRequestName();
  }
  
  Future<void> _checkAndRequestName() async {
    final appState = context.read<AppState>();
    if (appState.userName == null || appState.userName!.isEmpty) {
      final name = await showNameDialog(context);
      if (name != null && mounted) {
        appState.setUserName(name);
      }
    }
  }

  @override
  void dispose() {
    _roomCodeController.dispose();
    super.dispose();
  }

  Future<void> _joinRoom() async {
    final roomCode = _roomCodeController.text.trim().toUpperCase();
    
    if (roomCode.length != 6) {
      _showError('Please enter a valid 6-character room code');
      return;
    }

    setState(() => _isLoadingJoin = true);
    
    final appState = context.read<AppState>();
    final signalingService = context.read<SignalingService>();
    final webrtcService = context.read<WebRTCService>();

    // Set up WebRTC callbacks
    signalingService.onOffer = (data) async {
      await webrtcService.handleOffer(data);
    };

    signalingService.onIceCandidate = (data) async {
      await webrtcService.addIceCandidate(data);
    };

    webrtcService.onAnswer = (answer) {
      signalingService.sendAnswer({
        'sdp': answer.sdp,
        'type': answer.type,
      });
    };

    webrtcService.onIceCandidate = (candidate) {
      signalingService.sendIceCandidate({
        'candidate': candidate.candidate,
        'sdpMid': candidate.sdpMid,
        'sdpMLineIndex': candidate.sdpMLineIndex,
      });
    };

    signalingService.onRoomJoined = () {
      if (mounted) {
        setState(() => _isLoadingJoin = false);
        appState.setRole(UserRole.listener);
        appState.setCurrentScreen(AppScreen.listener);
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const ListenerScreen()),
        );
      }
    };

    // Connect and join room
    try {
      await signalingService.connect();
      
      if (signalingService.isConnected) {
        signalingService.joinRoom(roomCode, userName: appState.userName);
      } else {
        setState(() => _isLoadingJoin = false);
        _showError(signalingService.errorMessage ?? 'Failed to connect to server');
      }
    } catch (e) {
      setState(() => _isLoadingJoin = false);
      _showError('Connection error: $e');
    }
  }
  
  Future<void> _createRoom() async {
    final appState = context.read<AppState>();
    
    // Ensure user has a name
    if (appState.userName == null || appState.userName!.isEmpty) {
      final name = await showNameDialog(context);
      if (name == null) return;
      appState.setUserName(name);
    }
    
    setState(() => _isLoadingCreate = true);
    
    final signalingService = context.read<SignalingService>();
    
    // Set up callbacks
    signalingService.onRoomCreated = (roomCode) async {
      if (mounted) {
        appState.setRoomCode(roomCode);
        appState.setRole(UserRole.broadcaster);
        appState.setCurrentScreen(AppScreen.broadcaster);
        
        setState(() => _isLoadingCreate = false);
        
        // Navigate to broadcaster screen, which will handle permission and audio capture
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const BroadcasterScreen()),
        );
      }
    };
    
    // Connect and create room
    try {
      await signalingService.connect();
      
      if (signalingService.isConnected) {
        signalingService.createRoom(userName: appState.userName);
      } else {
        setState(() => _isLoadingCreate = false);
        _showError(signalingService.errorMessage ?? 'Failed to connect to server');
      }
    } catch (e) {
      setState(() => _isLoadingCreate = false);
      _showError('Connection error: $e');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Music Sharer'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              );
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF6366F1), Color(0xFFA855F7)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF6366F1).withAlpha(102),
                        blurRadius: 30,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: const Center(
                    child: Text(
                      '🎵',
                      style: TextStyle(fontSize: 48),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                
                // Title
                const Text(
                  'Music Sharer',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Listen to music being shared from a desktop browser',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey.shade400,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 48),

                // Create Room card  
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          '🎙️ Start Broadcasting',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Share your device\'s system audio',
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey.shade500,
                          ),
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: _isLoadingCreate ? null : _createRoom,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF6366F1),
                          ),
                          child: _isLoadingCreate
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'Create Room',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
                
                const SizedBox(height: 16),
                
                const Text(
                  'OR',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white60,
                  ),
                ),
                
                const SizedBox(height: 16),

                // Join Room card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Join a Room',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 16),
                        
                        // Room code input
                        TextField(
                          controller: _roomCodeController,
                          textCapitalization: TextCapitalization.characters,
                          maxLength: 6,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 8,
                          ),
                          decoration: InputDecoration(
                            hintText: 'ROOM CODE',
                            hintStyle: TextStyle(
                              color: Colors.grey.shade600,
                              letterSpacing: 4,
                            ),
                            counterText: '',
                          ),
                          onChanged: (value) {
                            _roomCodeController.value = TextEditingValue(
                              text: value.toUpperCase(),
                              selection: _roomCodeController.selection,
                            );
                          },
                          onSubmitted: (_) => _joinRoom(),
                        ),
                        const SizedBox(height: 24),

                        // Join button
                        ElevatedButton(
                          onPressed: _isLoadingJoin ? null : _joinRoom,
                          child: _isLoadingJoin
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text('🎧', style: TextStyle(fontSize: 20)),
                                    SizedBox(width: 8),
                                    Text(
                                      'Join Room',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 24),
                
                // Server URL indicator
                Consumer<SignalingService>(
                  builder: (context, signaling, _) {
                    return GestureDetector(
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const SettingsScreen()),
                        );
                      },
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.cloud_outlined,
                            size: 16,
                            color: Colors.grey.shade500,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            signaling.serverUrl,
                            style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(
                            Icons.edit_outlined,
                            size: 12,
                            color: Colors.grey.shade600,
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
