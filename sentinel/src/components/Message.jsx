import { motion } from 'framer-motion';

export default function Message({ message, isOwn }) {
  const getAvatar = (username) => {
    if (!username) return '?';
    return username.charAt(0).toUpperCase();
  };

  const getAvatarColor = (username) => {
    if (!username) return 'from-gray-500 to-gray-600';
    const colors = [
      'from-purple-500 to-pink-500',
      'from-blue-500 to-cyan-500',
      'from-green-500 to-emerald-500',
      'from-orange-500 to-red-500',
      'from-indigo-500 to-purple-500',
    ];
    const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const username = message.profiles?.username || 'Anonymous';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex gap-3 mb-6 ${isOwn ? 'flex-row-reverse' : 'flex-row'} ${isOwn ? 'message-right' : 'message-left'
        }`}
    >
      <motion.div
        whileHover={{ scale: 1.1 }}
        className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(username)} flex items-center justify-center font-semibold text-white shadow-lg flex-shrink-0 relative`}
      >
        {getAvatar(username)}
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-[#0a0a0f] pulse" />
      </motion.div>

      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        {!isOwn && (
          <span className="text-xs font-medium text-gray-400 mb-1 px-2">
            {username}
          </span>
        )}

        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`px-5 py-3 rounded-2xl shadow-xl hover-lift ${isOwn
            ? 'bg-gradient-to-br from-primary to-secondary text-white rounded-br-sm glow-primary'
            : 'glass-strong text-gray-100 rounded-bl-sm'
            }`}
        >
          <p className="break-words leading-relaxed">{message.content}</p>

          <div className={`flex items-center gap-2 mt-2 text-xs ${isOwn ? 'text-white/70' : 'text-gray-400'
            }`}>
            <span>
              {new Date(message.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            {message._optimistic && (
              <span className="text-xs opacity-70 italic">Sending...</span>
            )}
            {isOwn && !message._optimistic && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
