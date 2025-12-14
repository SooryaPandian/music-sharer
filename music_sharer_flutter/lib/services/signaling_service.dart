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

  // Callbacks for WebRTC signaling (listener mode)
  Function(Map<String, dynamic>)? onOffer;
  Function(Map<String, dynamic>)? onIceCandidate;
  Function()? onBroadcasterLeft;
  Function()? onRoomJoined;
  
  // Callbacks for broadcaster mode
  Function(String roomCode)? onRoomCreated;
  Function(String listenerId, String name)? onNewListener;
  Function(String listenerId)? onListenerLeft;
  Function(Map<String, dynamic>)? onAnswer;
  Function(List<Map<String, dynamic>>)? onListenersUpdated;
  
  // Chat callbacks
  Function(Map<String, dynamic>)? onChatMessage;

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
        // Broadcaster events
        case 'room-created':
          _roomCode = data['roomCode'] as String?;
          _state = SignalingState.roomJoined;
          notifyListeners();
          if (_roomCode != null) {
            onRoomCreated?.call(_roomCode!);
          }
          break;
          
        case 'new-listener':
          final listenerId = data['listenerId'] as String?;
          final listenerName = data['listenerName'] as String? ?? 'Unknown';
          if (listenerId != null) {
            onNewListener?.call(listenerId, listenerName);
          }
          // Update listeners list if provided
          if (data['listeners'] != null) {
            final listeners = data['listeners'] as List<dynamic>;
            onListenersUpdated?.call(listeners.cast<Map<String, dynamic>>());
          }
          break;
          
        case 'listener-left':
          final listenerId = data['listenerId'] as String?;
          if (listenerId != null) {
            onListenerLeft?.call(listenerId);
          }
          // Update listeners list if provided
          if (data['listeners'] != null) {
            final listeners = data['listeners'] as List<dynamic>;
            onListenersUpdated?.call(listeners.cast<Map<String, dynamic>>());
          }
          break;
          
        case 'answer':
          // Broadcaster receives answers from listeners
          onAnswer?.call(data);
          break;
        
        // Listener events
        case 'room-joined':
          _roomCode = data['roomCode'] as String?;
          _state = SignalingState.roomJoined;
          notifyListeners();
          onRoomJoined?.call();
          // Update listeners list if provided
          if (data['listeners'] != null) {
            final listeners = data['listeners'] as List<dynamic>;
            onListenersUpdated?.call(listeners.cast<Map<String, dynamic>>());
          }
          break;

        case 'offer':
          // Listener receives offer from broadcaster
          onOffer?.call(data);
          break;

        case 'ice-candidate':
          onIceCandidate?.call(data);
          break;

        case 'broadcaster-left':
        case 'broadcaster-disconnected':
          onBroadcasterLeft?.call();
          break;
          
        // Chat events
        case 'chat-message':
          onChatMessage?.call(data);
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
  
  /// Create a room as broadcaster
  void createRoom({String? userName}) {
    if (_channel == null || _state != SignalingState.connected) {
      debugPrint('[SignalingService] Cannot create room: not connected');
      return;
    }

    debugPrint('[SignalingService] Creating room');
    _channel!.sink.add(jsonEncode({
      'type': 'create-room',
      'userName': userName ?? 'Mobile Broadcaster',
    }));
  }
  
  /// Send chat message
  void sendChatMessage(String message, {String? userName}) {
    if (_channel == null || _roomCode == null) {
      debugPrint('[SignalingService] Cannot send chat: not in room');
      return;
    }
    
    debugPrint('[SignalingService] Sending chat message');
    _channel!.sink.add(jsonEncode({
      'type': 'chat-message',
      'roomCode': _roomCode,
      'userName': userName ?? 'User',
      'message': message,
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
  
  /// Send an offer to a specific listener (broadcaster mode)
  void sendOffer(String listenerId, Map<String, dynamic> offer) {
    if (_channel == null) return;

    debugPrint('[SignalingService] Sending offer to listener $listenerId');
    _channel!.sink.add(jsonEncode({
      'type': 'offer',
      'targetId': listenerId,
      'offer': offer,
    }));
  }
  
  /// Send an ICE candidate to a specific listener (broadcaster mode)
  void sendBroadcasterIceCandidate(String listenerId, Map<String, dynamic> candidate) {
    if (_channel == null) return;

    debugPrint('[SignalingService] Sending broadcaster ICE candidate to listener $listenerId');
    _channel!.sink.add(jsonEncode({
      'type': 'ice-candidate',
      'targetId': listenerId,
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
