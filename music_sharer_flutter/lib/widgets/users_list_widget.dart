import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';

/// Widget to display list of connected users
class UsersListWidget extends StatelessWidget {
  const UsersListWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, appState, _) {
        final role = appState.role;
        final listeners = appState.listeners;
        final userName = appState.userName;
        
        return Container(
          decoration: BoxDecoration(
            color: const Color(0xFF1E1E2E),
            borderRadius: BorderRadius.circular(16),
          ),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Room Members',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.white70,
                    ),
                  ),
                  Row(
                    children: [
                      const Text(
                        '👥',
                        style: TextStyle(fontSize: 16),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${(role == UserRole.broadcaster ? 1 : 0) + listeners.length}',
                        style: const TextStyle(
                          fontSize: 14,
                          color: Colors.white60,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(color: Colors.white10),
              const SizedBox(height: 12),
              
              // User list
              Expanded(
                child: ListView(
                  children: [
                    // Show broadcaster
                    if (role == UserRole.listener)
                      _buildUserTile(
                        icon: '🎙️',
                        name: 'Broadcaster',
                        subtitle: 'Host',
                        isSelf: false,
                        isHost: true,
                      ),
                    
                    // Show self if broadcaster
                    if (role == UserRole.broadcaster)
                      _buildUserTile(
                        icon: '🎙️',
                        name: 'You (Host)',
                        subtitle: 'Broadcasting',
                        isSelf: true,
                        isHost: true,
                      ),
                    
                    // Show listeners
                    ...listeners.map((listener) => _buildUserTile(
                      icon: '🎧',
                      name: listener.name,
                      subtitle: _formatJoinTime(listener.joinedAt),
                      isSelf: false,
                      isHost: false,
                    )),
                    
                    // Empty state for broadcaster with no listeners
                    if (role == UserRole.broadcaster && listeners.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(
                          child: Text(
                            'No listeners yet',
                            style: TextStyle(
                              color: Colors.white38,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildUserTile({
    required String icon,
    required String name,
    required String subtitle,
    required bool isSelf,
    required bool isHost,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: isHost
            ? const LinearGradient(
                colors: [Color(0xFF6366F1), Color(0xFFA855F7)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        color: isHost ? null : const Color(0xFF2A2A3E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: isHost ? Colors.white70 : Colors.white38,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatJoinTime(DateTime joinedAt) {
    final now = DateTime.now();
    final difference = now.difference(joinedAt);
    
    if (difference.inMinutes < 1) {
      return 'Just joined';
    } else if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    } else {
      return '${difference.inHours}h ago';
    }
  }
}
