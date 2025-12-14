import 'dart:async';
import 'dart:typed_data';
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
  final Map<String, RTCDataChannel> _listenerDataChannels = {};  // Data channels for audio streaming
  MediaStream? _localStream;
  bool _isBroadcasting = false;
  bool _isBroadcastMuted = false;
  
  // Audio stream subscription for system audio
  StreamSubscription<Uint8List>? _audioStreamSubscription;
  
  WebRTCState _state = WebRTCState.idle;
  RTCVideoRenderer? _attachedRenderer;
  
  // Audio output mode (speaker by default)
  AudioOutputMode _audioOutputMode = AudioOutputMode.speaker;
  
  // Mute state (for listener mode)
  bool _isMuted = false;
  
  // Headphone connection state
  bool _isHeadphonesConnected = false;

  // ICE server configuration with STUN and TURN (matching web app)
  final Map<String, dynamic> _iceServers = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ],
    // Use unified-plan (matches modern browser behavior used by the JS broadcaster)
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
  
  // Audio configuration for system audio
  static const int audioSampleRate = 48000;
  static const int audioChannels = 2;  // Stereo
  static const int audioBitsPerSample = 16;

  /// Initialize WebRTC peer connection
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
      debugPrint('[WebRTCService] Local ICE candidate: ${candidate.candidate}');
      onIceCandidate?.call(candidate);
    };

    // Note: some flutter_webrtc versions have differing addTransceiver signatures.
    // We rely on unified-plan + offerToReceiveAudio in createAnswer to ensure
    // the resulting SDP includes recvonly audio so browser sender can attach.

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

    // Handle ICE connection state
    _peerConnection!.onIceConnectionState = (RTCIceConnectionState state) {
      debugPrint('[WebRTCService] ICE connection state: $state');
    };

    notifyListeners();
  }

  /// Attach an `RTCVideoRenderer` to play incoming audio/video streams.
  /// For audio-only streams the renderer.srcObject still accepts the stream
  /// and ensures WebRTC audio is routed to the platform audio output.
  void attachRenderer(RTCVideoRenderer renderer) {
    _attachedRenderer = renderer;
    if (_remoteStream != null) {
      renderer.srcObject = _remoteStream;
    }
  }

  /// Detach the previously attached renderer.
  void detachRenderer() {
    if (_attachedRenderer != null) {
      _attachedRenderer!.srcObject = null;
      _attachedRenderer = null;
    }
  }

  /// Handle incoming SDP offer from broadcaster
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

      // Prefer Opus and enable stereo in the SDP to match the browser sender
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

  /// Prefer Opus codec and set stereo parameters if possible
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

      // Ensure opus fmtp stereo enabled (sprop-stereo and stereo=1)
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
        // Add a fmtp line for opus right after rtpmap if missing
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

  /// Add ICE candidate from remote peer
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

  /// Toggle mute state
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

  /// Check if headphones are connected by enumerating audio output devices
  Future<void> checkHeadphones() async {
    try {
      final devices = await navigator.mediaDevices.enumerateDevices();
      final audioOutputs = devices.where((d) => d.kind == 'audiooutput').toList();
      
      // Check for headphones, bluetooth, or wired headset in device labels
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
      
      // If headphones detected, set audio mode to headphones
      if (_isHeadphonesConnected) {
        _audioOutputMode = AudioOutputMode.headphones;
      }
      
      notifyListeners();
    } catch (e) {
      debugPrint('[WebRTCService] Error checking headphones: $e');
      _isHeadphonesConnected = false;
    }
  }

  /// Enable appropriate audio output (called on track received)
  Future<void> _enableSpeakerphone() async {
    try {
      // Check for headphones first
      await checkHeadphones();
      
      // Only set speakerphone if no headphones connected
      if (!_isHeadphonesConnected) {
        await Helper.setSpeakerphoneOn(_audioOutputMode == AudioOutputMode.speaker);
        debugPrint('[WebRTCService] Speakerphone set to: ${_audioOutputMode == AudioOutputMode.speaker}');
      } else {
        // Headphones connected - disable speakerphone to use headphones
        await Helper.setSpeakerphoneOn(false);
        debugPrint('[WebRTCService] Using headphones for audio output');
      }
    } catch (e) {
      debugPrint('[WebRTCService] Error setting audio output: $e');
    }
  }

  /// Start broadcasting (broadcaster mode) - receives audio stream from platform channel
  Future<void> startBroadcast(Stream<Uint8List> audioStream) async {
    debugPrint('[WebRTCService] Starting broadcast with system audio stream');
    
    try {
      // Subscribe to the system audio stream from MediaProjection
      _audioStreamSubscription = audioStream.listen(
        (Uint8List audioData) {
          // Send audio data to all connected listeners via data channels
          _sendAudioToListeners(audioData);
        },
        onError: (error) {
          debugPrint('[WebRTCService] Audio stream error: $error');
        },
        cancelOnError: false,
      );
      
      // Note: We don't need getUserMedia anymore!
      // The data will be sent through data channels, not audio tracks
      _localStream = null;  // No local stream needed for data channel approach
      
      _isBroadcasting = true;
      _isBroadcastMuted = false;
      debugPrint('[WebRTCService] Broadcast started - system audio will stream via data channels');
      debugPrint('[WebRTCService] Audio config: ${audioSampleRate}Hz, ${audioChannels} channels, ${audioBitsPerSample}-bit');
      notifyListeners();
    } catch (e) {
      debugPrint('[WebRTCService] Error starting broadcast: $e');
      _isBroadcasting = false;
      notifyListeners();
      rethrow;
    }
  }
  
  /// Send audio data to all connected listeners via data channels
  void _sendAudioToListeners(Uint8List audioData) {
    if (_isBroadcastMuted) return;
    
    _listenerDataChannels.forEach((listenerId, dataChannel) {
      try {
        if (dataChannel.state == RTCDataChannelState.RTCDataChannelOpen) {
          // Send raw PCM audio bytes
          dataChannel.send(RTCDataChannelMessage.fromBinary(audioData));
        }
      } catch (e) {
        debugPrint('[WebRTCService] Error sending audio to $listenerId: $e');
      }
    });
  }

  /// Handle new listener joining (broadcaster side)
  Future<void> handleNewListener(String listenerId) async {
    debugPrint('[WebRTCService] New listener connecting: $listenerId');
    
    if (!_isBroadcasting) {
      debugPrint('[WebRTCService] Not broadcasting');
      return;
    }
    
    try {
      // Create peer connection for this listener
      final pc = await createPeerConnection(_iceServers, {
        'mandatory': {},
        'optional': [],
      });
      
      _listenerConnections[listenerId] = pc;
      
      // Create data channel for audio streaming
      final RTCDataChannelInit dataChannelConfig = RTCDataChannelInit();
      dataChannelConfig.ordered = true;  // Ensure ordered delivery
      dataChannelConfig.maxRetransmits = 0;  // Don't retransmit (prefer fresh data)
      
      final dataChannel = await pc.createDataChannel('audio', dataChannelConfig);
      _listenerDataChannels[listenerId] = dataChannel;
      
      dataChannel.onDataChannelState = (state) {
        debugPrint('[WebRTCService] Data channel state for $listenerId: $state');
      };
      
      debugPrint('[WebRTCService] Created data channel for listener $listenerId');
      
      // Handle ICE candidates - send with listener ID
      pc.onIceCandidate = (RTCIceCandidate candidate) {
        debugPrint('[WebRTCService] ICE candidate for listener $listenerId');
        onBroadcasterIceCandidate?.call(listenerId, candidate);
      };
      
      // Create offer
      final offer = await pc.createOffer({
        'offerToReceiveAudio': false,
        'offerToReceiveVideo': false,
      });
      
      // No need to modify SDP for stereo since we're sending raw PCM via data channel
      await pc.setLocalDescription(offer);
      debugPrint('[WebRTCService] Created and set local description for listener $listenerId');
      
      // Send offer through signaling via callback
      onOffer?.call(listenerId, offer);
      debugPrint('[WebRTCService] Offer sent via callback for listener $listenerId');
      
      notifyListeners();
    } catch (e) {
      debugPrint('[WebRTCService] Error handling new listener: $e');
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
    if (!_isBroadcasting) return;
    
    _isBroadcastMuted = !_isBroadcastMuted;
    debugPrint('[WebRTCService] Broadcast mute toggled: $_isBroadcastMuted');
    notifyListeners();
  }
  
  /// Stop broadcasting
  Future<void> stopBroadcast() async {
    debugPrint('[WebRTCService] Stopping broadcast');
    
    // Cancel audio stream subscription
    await _audioStreamSubscription?.cancel();
    _audioStreamSubscription = null;
    
    // Close all data channels
    for (final dataChannel in _listenerDataChannels.values) {
      await dataChannel.close();
    }
    _listenerDataChannels.clear();
    
    // Close all listener connections
    for (final pc in _listenerConnections.values) {
      await pc.close();
    }
    _listenerConnections.clear();
    
    // No local stream to dispose in data channel approach
    _localStream = null;
    
    _isBroadcasting = false;
    _isBroadcastMuted = false;
    notifyListeners();
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
