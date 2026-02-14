import { useState } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Mail, Lock, User, MessageCircle, Shield, Zap } from 'lucide-react';
import ConnectWallet from './ConnectWallet';

export default function Auth({ setSession }) {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [walletAddress, setWalletAddress] = useState('');

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!walletAddress) {
        throw new Error('Please connect your MetaMask wallet before signing up.');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            wallet_address: walletAddress.toLowerCase(),
          },
        },
      });

      if (error) throw error;

      if (data?.session?.user?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: data.session.user.id,
              username,
              wallet_address: walletAddress.toLowerCase(),
            },
            { onConflict: 'id' }
          );

        if (profileError) {
          console.error('Profile wallet sync failed after signup:', profileError.message);
        }
      }

      toast.success('Check your email for verification!', {
        icon: '📧',
        style: {
          background: 'rgba(16, 185, 129, 0.1)',
          color: '#fff',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        },
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      const signedInUser = data?.session?.user;
      if (signedInUser) {
        const walletFromMetadata = signedInUser.user_metadata?.wallet_address;
        const usernameFromMetadata = signedInUser.user_metadata?.username;

        if (walletFromMetadata) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert(
              {
                id: signedInUser.id,
                username: usernameFromMetadata,
                wallet_address: walletFromMetadata.toLowerCase(),
              },
              { onConflict: 'id' }
            );

          if (profileError) {
            console.error('Profile wallet sync failed after sign in:', profileError.message);
          }
        }
      }

      setSession(data.session);
      toast.success('Welcome back!', { icon: '👋' });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen animated-bg flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl float" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl float" style={{ animationDelay: '3s' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-6xl relative z-10"
      >
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden md:block"
          >
            <div className="glass-strong rounded-3xl p-12 hover-lift">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center glow-primary">
                  <Shield className="w-8 h-8" />
                </div>
                <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Sentinel
                </h1>
              </div>

              <p className="text-gray-300 text-lg mb-8">
                Experience the future of secure messaging with real-time communication and end-to-end encryption.
              </p>

              <div className="space-y-4">
                <FeatureItem icon={<MessageCircle />} text="Real-time messaging" />
                <FeatureItem icon={<Shield />} text="Secure & encrypted" />
                <FeatureItem icon={<Zap />} text="Lightning fast" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="glass-strong rounded-3xl p-8 md:p-10">
              <div className="md:hidden flex items-center justify-center gap-3 mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Sentinel
                </h1>
              </div>

              <div className="flex gap-2 p-1 glass rounded-2xl mb-8">
                <button
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                    isLogin
                      ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg glow-primary'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-3 rounded-xl font-medium transition-all duration-300 ${
                    !isLogin
                      ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg glow-primary'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-5">
                {!isLogin && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <InputField
                        icon={<User size={20} />}
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Choose a username"
                        required={!isLogin}
                      />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2"
                    >
                      <p className="text-sm text-gray-300">Connect MetaMask to create your account</p>
                      <ConnectWallet onConnected={setWalletAddress} />
                    </motion.div>
                  </>
                )}

                <InputField
                  icon={<Mail size={20} />}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                />

                <InputField
                  icon={<Lock size={20} />}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  minLength={6}
                />

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-semibold text-white shadow-lg glow-primary hover:shadow-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    isLogin ? 'Sign In' : 'Create Account'
                  )}
                </motion.button>
              </form>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function FeatureItem({ icon, text }) {
  return (
    <div className="flex items-center gap-3 text-gray-300">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center border border-primary/30">
        {icon}
      </div>
      <span>{text}</span>
    </div>
  );
}

function InputField({ icon, ...props }) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </div>
      <input
        {...props}
        className="w-full pl-12 pr-4 py-4 glass rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-300 text-white placeholder-gray-500"
      />
    </div>
  );
}
