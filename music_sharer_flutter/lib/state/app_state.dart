import 'package:flutter/foundation.dart';

/// User/Listener model
class Listener {
  final String id;
  final String name;
  final DateTime joinedAt;

  Listener({
    required this.id,
    required this.name,
    required this.joinedAt,
  });

  factory Listener.fromJson(Map<String, dynamic> json) {
    return Listener(
      id: json['id'] as String,
      name: json['name'] as String,
      joinedAt: DateTime.parse(json['joinedAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'joinedAt': joinedAt.toIso8601String(),
    };
  }
}

/// Chat message model
class ChatMessage {
  final String senderId;
  final String senderName;
  final String message;
  final DateTime timestamp;

  ChatMessage({
    required this.senderId,
    required this.senderName,
    required this.message,
    required this.timestamp,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      senderId: json['senderId'] as String,
      senderName: json['senderName'] as String,
      message: json['message'] as String,
      timestamp: DateTime.parse(json['timestamp'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'senderId': senderId,
      'senderName': senderName,
      'message': message,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

/// Screen types
enum AppScreen {
  home,
  broadcaster,
  listener,
}

/// User role in room
enum UserRole {
  broadcaster,
  listener,
}

/// Global application state
class AppState extends ChangeNotifier {
  // Screen and role
  AppScreen _currentScreen = AppScreen.home;
  UserRole? _role;

  // Room info
  String? _roomCode;
  String? _userName;

  // Lists
  List<Listener> _listeners = [];
  List<ChatMessage> _messages = [];

  // Chat state
  bool _isChatOpen = false;
  int _unreadCount = 0;

  // Getters
  AppScreen get currentScreen => _currentScreen;
  UserRole? get role => _role;
  String? get roomCode => _roomCode;
  String? get userName => _userName;
  List<Listener> get listeners => List.unmodifiable(_listeners);
  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get isChatOpen => _isChatOpen;
  int get unreadCount => _unreadCount;
  int get listenerCount => _listeners.length;

  // Screen navigation
  void setCurrentScreen(AppScreen screen) {
    _currentScreen = screen;
    notifyListeners();
  }

  void setRole(UserRole role) {
    _role = role;
    notifyListeners();
  }

  // Room management
  void setRoomCode(String? code) {
    _roomCode = code;
    notifyListeners();
  }

  void setUserName(String name) {
    _userName = name;
    notifyListeners();
  }

  // Listener management
  void setListeners(List<Listener> listeners) {
    _listeners = listeners;
    notifyListeners();
  }

  void addRoomListener(Listener listener) {
    if (!_listeners.any((l) => l.id == listener.id)) {
      _listeners.add(listener);
      notifyListeners();
    }
  }

  void removeRoomListener(String listenerId) {
    _listeners.removeWhere((l) => l.id == listenerId);
    notifyListeners();
  }

  // Chat management
  void addMessage(ChatMessage message) {
    _messages.add(message);
    if (!_isChatOpen) {
      _unreadCount++;
    }
    notifyListeners();
  }

  void toggleChat() {
    _isChatOpen = !_isChatOpen;
    if (_isChatOpen) {
      _unreadCount = 0;
    }
    notifyListeners();
  }

  void closeChat() {
    _isChatOpen = false;
    notifyListeners();
  }

  void clearUnreadCount() {
    _unreadCount = 0;
    notifyListeners();
  }

  // Reset state (when leaving room)
  void resetState() {
    _currentScreen = AppScreen.home;
    _role = null;
    _roomCode = null;
    _listeners.clear();
    _messages.clear();
    _isChatOpen = false;
    _unreadCount = 0;
    notifyListeners();
  }
}
