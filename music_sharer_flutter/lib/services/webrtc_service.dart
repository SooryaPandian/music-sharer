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

/// WebRTC service for handling audio streaming
class WebRTCService extends ChangeNotifier {
  RTCPeerConnection? _peerConnection;
  MediaStream? _remoteStream;
  WebRTCState _state = WebRTCState.idle;
  RTCVideoRenderer? _attachedRenderer;
  
  // Audio level for visualization
  double _audioLevel = 0.0;
  Timer? _audioLevelTimer;

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
  double get audioLevel => _audioLevel;

  // Callbacks for signaling
  Function(RTCSessionDescription)? onAnswer;
  Function(RTCIceCandidate)? onIceCandidate;

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
        
        _startAudioLevelMonitoring();
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

  /// Start monitoring audio levels for visualization
  void _startAudioLevelMonitoring() {
    _audioLevelTimer?.cancel();
    _audioLevelTimer = Timer.periodic(const Duration(milliseconds: 100), (_) {
      // Simulate audio level based on connection state
      // In a real implementation, you'd analyze the audio stream
      if (_state == WebRTCState.connected && _remoteStream != null) {
        // Simulate varying audio levels
        _audioLevel = 0.3 + (DateTime.now().millisecondsSinceEpoch % 500) / 1000;
      } else {
        _audioLevel = 0.0;
      }
      notifyListeners();
    });
  }

  /// Enable speakerphone for audio output
  Future<void> _enableSpeakerphone() async {
    try {
      await Helper.setSpeakerphoneOn(true);
      debugPrint('[WebRTCService] Speakerphone enabled');
    } catch (e) {
      debugPrint('[WebRTCService] Error enabling speakerphone: $e');
    }
  }

  /// Close the peer connection
  Future<void> close() async {
    debugPrint('[WebRTCService] Closing peer connection');
    
    _audioLevelTimer?.cancel();
    _audioLevelTimer = null;
    _audioLevel = 0.0;
    
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
