import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// WebRTC connection states
enum WebRTCState {
  idle,
  connecting,
  connected,
  disconnected,
  failed,
}

/// Audio output mode
enum AudioOutputMode {
  speaker,
  earpiece,
  headphones,
}

/// WebRTC service for handling audio streaming
class WebRTCService extends ChangeNotifier {
  // Listener mode (single peer connection)
  RTCPeerConnection? _peerConnection;
  MediaStream? _remoteStream;
  
  // Broadcaster mode (multiple peer connections)
  final Map<String, RTCPeerConnection> _listenerConnections = {};
  MediaStream? _localStream;
  bool _isBroadcasting = false;
  bool _isBroadcastMuted = false;
  
  WebRTCState _state = WebRTCState.idle;
  RTCVideoRenderer? _attachedRenderer;
  
  // Audio output mode (speaker by default)
  AudioOutputMode _audioOutputMode = AudioOutputMode.speaker;
  
  // Mute state (for listener mode)
  bool _isMuted = false;
  
  // Headphone connection state
  bool _isHeadphonesConnected = false;

  // ICE server configuration with STUN
  final Map<String, dynamic> _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
    'sdpSemantics': 'unified-plan',
  };

  WebRTCState get state => _state;
  MediaStream? get remoteStream => _remoteStream;
  MediaStream? get localStream => _localStream;
  AudioOutputMode get audioOutputMode => _audioOutputMode;
  bool get isMuted => _isMuted;
  bool get isHeadphonesConnected => _isHeadphonesConnected;
  bool get isBroadcasting => _isBroadcasting;
  bool get isBroadcastMuted => _isBroadcastMuted;
  int get listenerConnectionsCount => _listenerConnections.length;

  // Callbacks for signaling (listener mode)
  Function(RTCSessionDescription)? onAnswer;
  Function(RTCIceCandidate)? onIceCandidate;
  
  // Callbacks for signaling (broadcaster mode)
  Function(String listenerId, RTCSessionDescription offer)? onOffer;
  Function(String listenerId, RTCIceCandidate candidate)? onBroadcasterIceCandidate;

  /// Initialize WebRTC peer connection (listener mode)
  Future<void> initialize() async {
    debugPrint('[WebRTCService] Initializing peer connection');
    
    _peerConnection = await createPeerConnection(_iceServers, {
      'mandatory': {},
      'optional': [],
    });
    _state = WebRTCState.idle;

    // Handle incoming tracks
    _peerConnection!.onTrack = (RTCTrackEvent event) {
      debugPrint('[WebRTCService] Received track: ${event.track.kind}');
      if (event.streams.isNotEmpty) {
        _remoteStream = event.streams[0];
        
        // Enable speakerphone for audio output
        _enableSpeakerphone();
        
        notifyListeners();
        // Attach to renderer if one was provided
        if (_attachedRenderer != null) {
          try {
            _attachedRenderer!.srcObject = _remoteStream;
          } catch (e) {
            debugPrint('[WebRTCService] Failed to attach renderer: $e');
          }
        }
      }
    };

    // Handle ICE candidates
    _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
      debugPrint('[WebRTCService] Local ICE candidate');
      onIceCandidate?.call(candidate);
    };

    // Handle connection state changes
    _peerConnection!.onConnectionState = (RTCPeerConnectionState state) {
      debugPrint('[WebRTCService] Connection state: $state');
      switch (state) {
        case RTCPeerConnectionState.RTCPeerConnectionStateConnecting:
          _state = WebRTCState.connecting;
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
          _state = WebRTCState.connected;
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
          _state = WebRTCState.disconnected;
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
          _state = WebRTCState.failed;
          break;
        default:
          break;
      }
      notifyListeners();
    };

    notifyListeners();
  }

  /// Attach an RTCVideoRenderer to play incoming audio streams
  void attachRenderer(RTCVideoRenderer renderer) {
    _attachedRenderer = renderer;
    if (_remoteStream != null) {
      renderer.srcObject = _remoteStream;
    }
  }

  /// Detach the previously attached renderer
  void detachRenderer() {
    if (_attachedRenderer != null) {
      _attachedRenderer!.srcObject = null;
      _attachedRenderer = null;
    }
  }

  /// Handle incoming SDP offer from broadcaster (listener mode)
  Future<void> handleOffer(Map<String, dynamic> offerData) async {
    if (_peerConnection == null) {
      await initialize();
    }

    debugPrint('[WebRTCService] Handling offer');
    _state = WebRTCState.connecting;
    notifyListeners();

    try {
      final offer = offerData['offer'] as Map<String, dynamic>;
      final sdp = offer['sdp'] as String;
      final type = offer['type'] as String;

      // Set remote description
      final description = RTCSessionDescription(sdp, type);
      await _peerConnection!.setRemoteDescription(description);
      debugPrint('[WebRTCService] Remote description set');

      // Create answer
      final answer = await _peerConnection!.createAnswer({
        'offerToReceiveAudio': true,
        'offerToReceiveVideo': false,
      });

      // Prefer Opus and enable stereo in the SDP
      String modifiedSdp = _preferOpus(answer.sdp ?? '');
      final modifiedAnswer = RTCSessionDescription(modifiedSdp, answer.type);
      await _peerConnection!.setLocalDescription(modifiedAnswer);
      debugPrint('[WebRTCService] Local description set');

      // Send answer via callback
      onAnswer?.call(RTCSessionDescription(modifiedSdp, answer.type));
    } catch (e) {
      debugPrint('[WebRTCService] Error handling offer: $e');
      _state = WebRTCState.failed;
      notifyListeners();
    }
  }

  /// Prefer Opus codec and set stereo parameters
  String _preferOpus(String sdp) {
    if (sdp.isEmpty) return sdp;

    try {
      final lines = sdp.split('\r\n');

      // Find opus payload type from rtpmap
      String? opusPayload;
      for (final line in lines) {
        if (line.startsWith('a=rtpmap') && line.toLowerCase().contains('opus/')) {
          final parts = line.split(' ');
          if (parts.isNotEmpty) {
            final pt = parts[0].split(':').last;
            opusPayload = pt;
            break;
          }
        }
      }

      if (opusPayload == null) return sdp;

      // Reorder payloads in m=audio line to put opus first
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('m=audio')) {
          final parts = lines[i].split(' ');
          final header = parts.sublist(0, 3);
          final payloads = parts.sublist(3);
          payloads.remove(opusPayload);
          final newPayloads = [opusPayload, ...payloads];
          lines[i] = [...header, ...newPayloads].join(' ');
          break;
        }
      }

      // Ensure opus fmtp stereo enabled
      bool hasFmtp = false;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=fmtp:$opusPayload')) {
          hasFmtp = true;
          if (!lines[i].contains('stereo=1')) {
            lines[i] = '${lines[i]}; stereo=1; sprop-stereo=1';
          }
          break;
        }
      }

      if (!hasFmtp) {
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('a=rtpmap') && lines[i].contains('opus/')) {
            lines.insert(i + 1, 'a=fmtp:$opusPayload stereo=1; sprop-stereo=1');
            break;
          }
        }
      }

      return lines.join('\r\n');
    } catch (e) {
      debugPrint('[WebRTCService] SDP opus tweak failed: $e');
      return sdp;
    }
  }

  /// Add ICE candidate from remote peer (listener mode)
  Future<void> addIceCandidate(Map<String, dynamic> candidateData) async {
    if (_peerConnection == null) return;

    try {
      final candidate = candidateData['candidate'] as Map<String, dynamic>;
      final iceCandidate = RTCIceCandidate(
        candidate['candidate'] as String?,
        candidate['sdpMid'] as String?,
        candidate['sdpMLineIndex'] as int?,
      );
      await _peerConnection!.addCandidate(iceCandidate);
      debugPrint('[WebRTCService] Added ICE candidate');
    } catch (e) {
      debugPrint('[WebRTCService] Error adding ICE candidate: $e');
    }
  }

  /// Set audio output mode (speaker or earpiece)
  Future<void> setAudioOutputMode(AudioOutputMode mode) async {
    _audioOutputMode = mode;
    try {
      await Helper.setSpeakerphoneOn(mode == AudioOutputMode.speaker);
      debugPrint('[WebRTCService] Audio output mode set to: ${mode.name}');
    } catch (e) {
      debugPrint('[WebRTCService] Error setting audio output mode: $e');
    }
    notifyListeners();
  }

  /// Toggle between speaker and earpiece
  Future<void> toggleAudioOutputMode() async {
    final newMode = _audioOutputMode == AudioOutputMode.speaker
        ? AudioOutputMode.earpiece
        : AudioOutputMode.speaker;
    await setAudioOutputMode(newMode);
  }

  /// Toggle mute state (listener mode)
  void toggleMute() {
    _isMuted = !_isMuted;
    _applyMuteState();
    notifyListeners();
  }

  /// Apply mute state to the remote stream
  void _applyMuteState() {
    if (_remoteStream != null) {
      for (final track in _remoteStream!.getAudioTracks()) {
        track.enabled = !_isMuted;
      }
      debugPrint('[WebRTCService] Mute state applied: $_isMuted');
    }
  }

  /// Check if headphones are connected
  Future<void> checkHeadphones() async {
    try {
      final devices = await navigator.mediaDevices.enumerateDevices();
      final audioOutputs = devices.where((d) => d.kind == 'audiooutput').toList();
      
      _isHeadphonesConnected = audioOutputs.any((device) {
        final label = device.label.toLowerCase();
        return label.contains('headphone') ||
               label.contains('headset') ||
               label.contains('bluetooth') ||
               label.contains('airpod') ||
               label.contains('earphone') ||
               label.contains('wired');
      });
      
      debugPrint('[WebRTCService] Headphones connected: $_isHeadphonesConnected');
      
      if (_isHeadphonesConnected) {
        _audioOutputMode = AudioOutputMode.headphones;
      }
      
      notifyListeners();
    } catch (e) {
      debugPrint('[WebRTCService] Error checking headphones: $e');
      _isHeadphonesConnected = false;
    }
  }

  /// Enable appropriate audio output
  Future<void> _enableSpeakerphone() async {
    try {
      await checkHeadphones();
      
      if (!_isHeadphonesConnected) {
        await Helper.setSpeakerphoneOn(_audioOutputMode == AudioOutputMode.speaker);
        debugPrint('[WebRTCService] Speakerphone set to: ${_audioOutputMode == AudioOutputMode.speaker}');
      } else {
        await Helper.setSpeakerphoneOn(false);
        debugPrint('[WebRTCService] Using headphones for audio output');
      }
    } catch (e) {
      debugPrint('[WebRTCService] Error setting audio output: $e');
    }
  }

  /// Start broadcasting with microphone (broadcaster mode)
  Future<void> startBroadcast() async {
    debugPrint('[WebRTCService] Starting broadcast with microphone');
    
    try {
      // Request microphone access
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
          'sampleRate': 48000,
        },
      });
      
      _localStream = stream;
      _isBroadcasting = true;
      _isBroadcastMuted = false;
      
      debugPrint('[WebRTCService] Broadcast started with microphone');
      notifyListeners();
    } catch (e) {
      debugPrint('[WebRTCService] Error starting broadcast: $e');
      _isBroadcasting = false;
      notifyListeners();
      rethrow;
    }
  }

  /// Handle new listener joining (broadcaster side)
  Future<void> handleNewListener(String listenerId) async {
    debugPrint('[WebRTCService] New listener connecting: $listenerId');
    
    if (!_isBroadcasting || _localStream == null) {
      debugPrint('[WebRTCService] Not broadcasting or no local stream');
      return;
    }
    
    try {
      // Create peer connection for this listener
      final pc = await createPeerConnection(_iceServers, {
        'mandatory': {},
        'optional': [],
      });
      
      _listenerConnections[listenerId] = pc;
      
      // Add microphone audio track to peer connection
      _localStream!.getTracks().forEach((track) {
        pc.addTrack(track, _localStream!);
      });
      
      debugPrint('[WebRTCService] Added audio track for listener $listenerId');
      
      // Handle ICE candidates
      pc.onIceCandidate = (RTCIceCandidate candidate) {
        debugPrint('[WebRTCService] ICE candidate for listener $listenerId');
        onBroadcasterIceCandidate?.call(listenerId, candidate);
      };
      
      // Create offer
      final offer = await pc.createOffer({
        'offerToReceiveAudio': false,
        'offerToReceiveVideo': false,
      });
      
      // Ensure stereo in SDP
      String modifiedSdp = _ensureStereoInSDP(offer.sdp ?? '');
      final modifiedOffer = RTCSessionDescription(modifiedSdp, offer.type);
      
      await pc.setLocalDescription(modifiedOffer);
      debugPrint('[WebRTCService] Created and set local description for listener $listenerId');
      
      // Send offer through signaling
      onOffer?.call(listenerId, modifiedOffer);
      debugPrint('[WebRTCService] Offer sent for listener $listenerId');
      
      notifyListeners();
    } catch (e) {
      debugPrint('[WebRTCService] Error handling new listener: $e');
    }
  }
  
  /// Ensure stereo in SDP for high-quality audio
  String _ensureStereoInSDP(String sdp) {
    if (sdp.isEmpty) return sdp;
    
    try {
      final lines = sdp.split('\r\n');
      
      // Find opus payload type
      String? opusPayload;
      for (final line in lines) {
        if (line.startsWith('a=rtpmap') && line.toLowerCase().contains('opus/')) {
          final parts = line.split(' ');
          if (parts.isNotEmpty) {
            final pt = parts[0].split(':').last;
            opusPayload = pt;
            break;
          }
        }
      }
      
      if (opusPayload == null) return sdp;
      
      // Add or update fmtp line for stereo
      bool hasFmtp = false;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=fmtp:$opusPayload')) {
          hasFmtp = true;
          if (!lines[i].contains('stereo=1')) {
            lines[i] = '${lines[i]}; stereo=1; sprop-stereo=1; maxaveragebitrate=510000';
          }
          break;
        }
      }
      
      if (!hasFmtp) {
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('a=rtpmap') && lines[i].contains('opus/')) {
            lines.insert(i + 1, 'a=fmtp:$opusPayload stereo=1; sprop-stereo=1; maxaveragebitrate=510000');
            break;
          }
        }
      }
      
      return lines.join('\r\n');
    } catch (e) {
      debugPrint('[WebRTCService] SDP stereo modification failed: $e');
      return sdp;
    }
  }
  
  /// Handle answer from listener (broadcaster side)
  Future<void> handleAnswer(String listenerId, RTCSessionDescription answer) async {
    final pc = _listenerConnections[listenerId];
    if (pc != null) {
      debugPrint('[WebRTCService] Setting answer for listener $listenerId');
      await pc.setRemoteDescription(answer);
    }
  }
  
  /// Add ICE candidate for specific listener (broadcaster side)
  Future<void> addListenerIceCandidate(String listenerId, RTCIceCandidate candidate) async {
    final pc = _listenerConnections[listenerId];
    if (pc != null) {
      await pc.addCandidate(candidate);
      debugPrint('[WebRTCService] Added ICE candidate for listener $listenerId');
    }
  }
  
  /// Toggle broadcast mute
  void toggleBroadcastMute() {
    if (!_isBroadcasting || _localStream == null) return;
    
    _isBroadcastMuted = !_isBroadcastMuted;
    
    // Enable/disable audio tracks based on mute state
    _localStream!.getAudioTracks().forEach((track) {
      track.enabled = !_isBroadcastMuted;
    });
    
    debugPrint('[WebRTCService] Broadcast mute toggled: $_isBroadcastMuted');
    notifyListeners();
  }
  
  /// Stop broadcasting
  Future<void> stopBroadcast() async {
    debugPrint('[WebRTCService] Stopping broadcast');
    
    // Close all listener connections
    for (final pc in _listenerConnections.values) {
      await pc.close();
    }
    _listenerConnections.clear();
    
    // Stop and dispose local stream
    if (_localStream != null) {
      _localStream!.getTracks().forEach((track) => track.stop());
      await _localStream!.dispose();
      _localStream = null;
    }
    
    _isBroadcasting = false;
    _isBroadcastMuted = false;
    notifyListeners();
  }

  /// Close the peer connection
  Future<void> close() async {
    debugPrint('[WebRTCService] Closing peer connection');
    
    // Stop broadcast if active
    if (_isBroadcasting) {
      await stopBroadcast();
    }
    
    // Close listener peer connection
    if (_remoteStream != null) {
      _remoteStream!.getTracks().forEach((track) => track.stop());
      await _remoteStream!.dispose();
      _remoteStream = null;
    }

    if (_peerConnection != null) {
      await _peerConnection!.close();
      _peerConnection = null;
    }

    _state = WebRTCState.idle;
    notifyListeners();
  }

  @override
  void dispose() {
    close();
    super.dispose();
  }
}
