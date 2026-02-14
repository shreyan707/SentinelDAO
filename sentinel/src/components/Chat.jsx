import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Message from './Message';
import MessageInput from './MessageInput';
import ModerationPanel from './ModerationPanel';
import PunishmentBanner from './PunishmentBanner';
import ConnectWallet from './ConnectWallet';
import { useWallet } from '../hooks/useWallet';
import { getPunishmentStatus, canUserPost } from '../lib/punishmentService';
import { motion } from 'framer-motion';
import { LogOut, Users, Hash, Settings, Search, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Chat({ session }) {
  const [messages, setMessages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(12);
  const [showModPanel, setShowModPanel] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [punishmentStatus, setPunishmentStatus] = useState(null);
  const [canPost, setCanPost] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isConnectedToRealtime, setIsConnectedToRealtime] = useState(false);
  const messagesEndRef = useRef(null);
  const { address, isConnected, connect } = useWallet();

  useEffect(() => {
    fetchProfile();
    fetchMessages();
    // Note: subscription is handled in separate useEffect below
  }, []);

  // Auto-connect wallet on mount
  useEffect(() => {
    if (!isConnected && window.ethereum) {
      connect();
    }
  }, [isConnected, connect]);

  // Check punishment status when wallet connects
  useEffect(() => {
    const checkPunishmentStatus = async () => {
      if (isConnected && address) {
        const status = await getPunishmentStatus(address);
        setPunishmentStatus(status);

        const postStatus = await canUserPost(address);
        setCanPost(postStatus.canPost);
      }
    };

    checkPunishmentStatus();

    // Check every 30 seconds for timeout expiration
    const interval = setInterval(checkPunishmentStatus, 30000);
    return () => clearInterval(interval);
  }, [isConnected, address]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    setProfile(data);
  };

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles!messages_user_id_fkey(username)')
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      if (data) {
        // Remove any optimistic messages and replace with real data
        setMessages(data);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    }
  };

  // Realtime subscription with proper cleanup and reconnection
  useEffect(() => {
    const channel = supabase
      .channel('public:messages', {
        config: {
          broadcast: { self: false }, // Don't broadcast to self (we use optimistic updates)
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload) => {
          console.log('🔔 New message received:', payload.new.id);

          // Fetch profile for the new message
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', payload.new.user_id)
            .single();

          if (profileError) {
            console.error('Error fetching profile for message:', profileError);
            return;
          }

          const newMessage = { ...payload.new, profiles: profile };

          setMessages((prev) => {
            // Deduplicate - don't add if already exists
            if (prev.some(m => m.id === newMessage.id)) {
              console.log('Message already exists, skipping:', newMessage.id);
              return prev;
            }

            // Remove optimistic message if it exists
            const filtered = prev.filter(m => !m._optimistic);
            return [...filtered, newMessage];
          });
        }
      )
      .on('system', { event: '*' }, (event) => {
        console.log('Realtime system event:', event);
        if (event.type === 'reconnect') {
          console.log('🔄 Reconnected to realtime, refreshing messages');
          fetchMessages();
        }
      })
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);

        if (status === 'SUBSCRIBED') {
          console.log('✅ Connected to realtime messages');
          setIsConnectedToRealtime(true);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime channel error');
          setIsConnectedToRealtime(false);
          toast.error('Realtime connection error');
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ Realtime connection timed out');
          setIsConnectedToRealtime(false);
        } else if (status === 'CLOSED') {
          console.log('Realtime connection closed');
          setIsConnectedToRealtime(false);
        }
      });

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array - only set up once

  const sendMessage = async (content) => {
    if (isSending) return; // Prevent double-sending

    try {
      if (!address) {
        toast.error('Please connect your wallet before sending messages');
        return;
      }

      // Check if user can post
      const postStatus = await canUserPost(address);
      if (!postStatus.canPost) {
        toast.error(postStatus.reason || 'You are not allowed to post messages');
        return;
      }

      setIsSending(true);

      // Create optimistic message
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const optimisticMessage = {
        id: tempId,
        content,
        user_id: session.user.id,
        created_at: new Date().toISOString(),
        profiles: { username: profile?.username },
        wallet_address: address.toLowerCase(),
        _optimistic: true // Flag for UI
      };

      // Add optimistic message immediately
      setMessages((prev) => [...prev, optimisticMessage]);
      console.log('✨ Added optimistic message:', tempId);

      // Send to database
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_id: session.user.id,
          content,
          wallet_address: address.toLowerCase()
        })
        .select('*, profiles!messages_user_id_fkey(username)')
        .single();

      if (error) throw error;

      console.log('✅ Message sent successfully:', data.id);

      // Replace optimistic message with real one
      setMessages((prev) =>
        prev.map(m => m.id === tempId ? data : m)
      );

    } catch (error) {
      console.error('Error sending message:', error);

      // Remove optimistic message on failure
      setMessages((prev) => prev.filter(m => !m._optimistic));

      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out successfully');
  };

  return (
    <div className="h-screen flex bg-darker animated-bg">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        className="hidden md:flex w-72 glass-strong flex-col border-r border-white/10"
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-lg glow-primary">
              <Hash className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Sentinel</h1>
              <p className="text-xs text-gray-400">Secure Chat</p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Channels
          </h2>
          <div className="glass rounded-xl p-3 hover-lift cursor-pointer bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/30">
            <div className="flex items-center gap-2">
              <Hash size={18} className="text-primary" />
              <span className="font-medium">general</span>
              <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                <div className="w-2 h-2 bg-success rounded-full pulse" />
                {onlineUsers}
              </div>
            </div>
          </div>

          {/* Moderation Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowModPanel(!showModPanel)}
            className="w-full mt-3 glass rounded-xl p-3 hover-lift cursor-pointer hover:bg-purple-500/20 border border-white/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-purple-400" />
              <span className="font-medium text-purple-300">Moderation</span>
              {pendingCount > 0 && (
                <div className="ml-auto w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold">{pendingCount}</span>
                </div>
              )}
            </div>
          </motion.button>
        </div>

        {/* Wallet Connection */}
        <div className="p-4 border-t border-white/10">
          <ConnectWallet />
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-white/10">
          <div className="glass rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center font-semibold relative">
              {profile?.username?.charAt(0).toUpperCase() || 'U'}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-darker pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{profile?.username}</div>
              <div className="text-xs text-gray-400">Online</div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1, rotate: 10 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleSignOut}
              className="w-8 h-8 rounded-lg glass hover:bg-danger/20 flex items-center justify-center transition-colors"
            >
              <LogOut size={16} />
            </motion.button>
          </div>
        </div>
      </motion.aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <motion.header
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="glass-strong border-b border-white/10 px-6 py-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-xl flex items-center justify-center border border-primary/30">
                <Hash size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">general</h2>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Users size={14} />
                  <span>{onlineUsers} members online</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Moderation Button for Mobile */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowModPanel(!showModPanel)}
                className="relative w-10 h-10 rounded-xl glass hover:bg-purple-500/20 flex items-center justify-center transition-colors"
              >
                <Shield size={18} className="text-purple-400" />
                {pendingCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-[10px] font-bold">{pendingCount}</span>
                  </div>
                )}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <Search size={18} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-xl glass hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <Settings size={18} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSignOut}
                className="md:hidden w-10 h-10 rounded-xl glass hover:bg-danger/20 flex items-center justify-center transition-colors"
              >
                <LogOut size={18} />
              </motion.button>
            </div>
          </div>
        </motion.header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-4xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 mt-20">
                <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Hash size={32} className="text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Welcome to #general</h3>
                <p>Start the conversation by sending a message!</p>
              </div>
            )}
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                isOwn={message.user_id === session.user.id}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Punishment Banner */}
        {punishmentStatus && !punishmentStatus.can_post && (
          <div className="px-4 md:px-6">
            <div className="max-w-4xl mx-auto">
              <PunishmentBanner
                punishmentStatus={punishmentStatus}
                onExpire={async () => {
                  // Refresh punishment status when timeout expires
                  const status = await getPunishmentStatus(address);
                  setPunishmentStatus(status);
                  const postStatus = await canUserPost(address);
                  setCanPost(postStatus.canPost);
                }}
              />
            </div>
          </div>
        )}

        <MessageInput onSend={sendMessage} disabled={!canPost} />
      </div>

      {/* Moderation Panel */}
      <ModerationPanel
        isOpen={showModPanel}
        onClose={() => setShowModPanel(false)}
      />
    </div>
  );
}