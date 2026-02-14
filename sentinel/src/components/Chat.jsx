import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Message from './Message';
import MessageInput from './MessageInput';
import { motion } from 'framer-motion';
import { LogOut, Users, Hash, Settings, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Chat({ session }) {
  const [messages, setMessages] = useState([]);
  const [profile, setProfile] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(12);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchProfile();
    fetchMessages();
    subscribeToMessages();
  }, []);

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
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(username)')
      .order('created_at', { ascending: true })
      .limit(100);
    
    if (data) setMessages(data);
  };

  const subscribeToMessages = () => {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', payload.new.user_id)
            .single();
          
          setMessages((prev) => [...prev, { ...payload.new, profiles: profile }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const sendMessage = async (content) => {
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          user_id: session.user.id,
          content
        });

      if (error) throw error;
    } catch (error) {
      toast.error('Failed to send message');
    }
  };

  // 
const scanMessage = async (messageId) => {
  try {
    const res = await fetch(`/api/scan-status/${messageId}`);
    const result = await res.json();
    console.log("AI Scan:", result);
  } catch (e) {
    console.error("Scan failed:", e);
  }
};


  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out successfully');
  };

  return (
    <div className="h-screen flex bg-darker animated-bg">
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
        </div>

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

        <MessageInput onSend={sendMessage} />
      </div>
    </div>
  );
}
