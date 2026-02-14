import { useWallet } from "../hooks/useWallet";
import { motion } from "framer-motion";

export default function ConnectWallet({ onConnected }) {
  const { address, isConnected, connect, disconnect } = useWallet();

  const handleConnect = async () => {
    const walletAddress = await connect();
    if (walletAddress && onConnected) {
      onConnected(walletAddress);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    if (onConnected) {
      onConnected('');
    }
  };

  const truncateAddress = (addr) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected && address) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-3 px-4 py-3 glass rounded-xl border border-success/30"
      >
        <div className="w-2 h-2 rounded-full bg-success pulse" />
        <span className="text-gray-100 text-sm font-medium flex-1">
          {truncateAddress(address)}
        </span>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleDisconnect}
          className="px-3 py-1 glass-strong text-gray-300 rounded-lg text-xs hover:bg-danger/20 transition-colors"
        >
          Disconnect
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleConnect}
      className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 flex items-center justify-center gap-2 shadow-lg glow-primary"
    >
      <span className="text-xl">🦊</span> Connect MetaMask
    </motion.button>
  );
}