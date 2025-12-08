import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Connection states for the signaling service
enum SignalingState {
  disconnected,
  connecting,
  connected,
  roomJoined,
  error,
}

/// Signaling service for WebSocket communication with the server
class SignalingService extends ChangeNotifier {
  static const String _serverUrlKey = 'server_url';
  static const String _defaultServerUrl = 'ws://localhost:3000';

  final SharedPreferences _prefs;
  WebSocketChannel? _channel;
  SignalingState _state = SignalingState.disconnected;
  String? _roomCode;
  String? _errorMessage;
  String _serverUrl = _defaultServerUrl;

  // Callbacks for WebRTC signaling
  Function(Map<String, dynamic>)? onOffer;
  Function(Map<String, dynamic>)? onIceCandidate;
  Function()? onBroadcasterLeft;
  Function()? onRoomJoined;
  // Callback to send answer when produced by WebRTC service
  Function(Map<String, dynamic>)? sendAnswerCallback;

  SignalingService(this._prefs) {
    _serverUrl = _prefs.getString(_serverUrlKey) ?? _defaultServerUrl;
  }

  SignalingState get state => _state;
  String? get roomCode => _roomCode;
  String? get errorMessage => _errorMessage;
  String get serverUrl => _serverUrl;
  bool get isConnected => _state == SignalingState.connected || _state == SignalingState.roomJoined;

  /// Update the server URL
  Future<void> setServerUrl(String url) async {
    _serverUrl = url;
    await _prefs.setString(_serverUrlKey, url);
    notifyListeners();
  }

  /// Connect to the signaling server
  Future<void> connect() async {
    if (_state == SignalingState.connecting || _state == SignalingState.connected) {
      return;
    }

    _state = SignalingState.connecting;
    _errorMessage = null;
    notifyListeners();

    try {
      debugPrint('[SignalingService] Connecting to $_serverUrl');
      _channel = WebSocketChannel.connect(Uri.parse(_serverUrl));
      
      // Wait for connection
      await _channel!.ready;
      
      _state = SignalingState.connected;
      debugPrint('[SignalingService] Connected to server');
      notifyListeners();

      // Listen for messages
      _channel!.stream.listen(
        _handleMessage,
        onError: (error) {
          debugPrint('[SignalingService] WebSocket error: $error');
          _state = SignalingState.error;
          _errorMessage = 'Connection error: $error';
          notifyListeners();
        },
        onDone: () {
          debugPrint('[SignalingService] WebSocket closed');
          _state = SignalingState.disconnected;
          notifyListeners();
        },
      );
    } catch (e) {
      debugPrint('[SignalingService] Failed to connect: $e');
      _state = SignalingState.error;
      _errorMessage = 'Failed to connect: $e';
      notifyListeners();
    }
  }

  /// Handle incoming WebSocket messages
  void _handleMessage(dynamic message) {
    try {
      final data = jsonDecode(message as String) as Map<String, dynamic>;
      final type = data['type'] as String?;

      debugPrint('[SignalingService] Received message: $type');

      switch (type) {
        case 'room-joined':
          _roomCode = data['roomCode'] as String?;
          _state = SignalingState.roomJoined;
          notifyListeners();
          onRoomJoined?.call();
          break;

        case 'offer':
          // Forward full offer payload to the WebRTC service
          onOffer?.call(data);
          break;

        case 'ice-candidate':
          onIceCandidate?.call(data);
          break;

        case 'answer':
          // Listener should not normally receive 'answer', but handle gracefully
          onOffer?.call(data);
          break;

        case 'broadcaster-left':
        case 'broadcaster-disconnected':
          onBroadcasterLeft?.call();
          break;

        case 'error':
          _state = SignalingState.error;
          _errorMessage = data['message'] as String?;
          notifyListeners();
          break;
      }
    } catch (e) {
      debugPrint('[SignalingService] Error handling message: $e');
    }
  }

  /// Join a room with the given code
  void joinRoom(String roomCode, {String? userName}) {
    if (_channel == null || _state != SignalingState.connected) {
      debugPrint('[SignalingService] Cannot join room: not connected');
      return;
    }

    debugPrint('[SignalingService] Joining room: $roomCode');
    _channel!.sink.add(jsonEncode({
      'type': 'join-room',
      'roomCode': roomCode.toUpperCase(),
      'userName': userName ?? 'Mobile User',
    }));
  }

  /// Send an SDP answer to the broadcaster
  void sendAnswer(Map<String, dynamic> answer) {
    if (_channel == null) return;

    debugPrint('[SignalingService] Sending answer');
    _channel!.sink.add(jsonEncode({
      'type': 'answer',
      'answer': answer,
    }));
  }

  /// Send an ICE candidate
  void sendIceCandidate(Map<String, dynamic> candidate) {
    if (_channel == null) return;

    debugPrint('[SignalingService] Sending ICE candidate');
    _channel!.sink.add(jsonEncode({
      'type': 'ice-candidate',
      'candidate': candidate,
    }));
  }

  /// Leave the current room
  void leaveRoom() {
    if (_channel == null || _roomCode == null) return;

    debugPrint('[SignalingService] Leaving room: $_roomCode');
    _channel!.sink.add(jsonEncode({
      'type': 'leave-room',
      'roomCode': _roomCode,
    }));

    _roomCode = null;
    _state = SignalingState.connected;
    notifyListeners();
  }

  /// Disconnect from the signaling server
  void disconnect() {
    debugPrint('[SignalingService] Disconnecting');
    _channel?.sink.close();
    _channel = null;
    _roomCode = null;
    _state = SignalingState.disconnected;
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
