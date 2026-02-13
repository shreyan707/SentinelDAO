import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Smile, Paperclip } from 'lucide-react';

export default function MessageInput({ onSend }) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim()) {
      onSend(message);
      setMessage('');
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 md:p-6 glass-strong border-t border-white/10">
      <div className={`glass rounded-2xl transition-all duration-300 ${
        isFocused ? 'ring-2 ring-primary/50 shadow-xl glow-primary' : ''
      }`}>
        <div className="flex items-end gap-3 p-3">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl glass hover:bg-white/10 transition-colors text-gray-400 hover:text-white flex-shrink-0"
          >
            <Smile size={20} />
          </motion.button>

          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Type a message..."
              rows={1}
              maxLength={500}
              className="w-full bg-transparent text-white placeholder-gray-500 focus:outline-none resize-none max-h-32"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-gray-500">{message.length}/500</span>
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl glass hover:bg-white/10 transition-colors text-gray-400 hover:text-white flex-shrink-0"
          >
            <Paperclip size={20} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            disabled={!message.trim()}
            className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center shadow-lg glow-primary transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>
    </form>
  );
}
