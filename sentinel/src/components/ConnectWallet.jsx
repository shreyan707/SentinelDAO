import { useWallet } from "../hooks/useWallet";

export default function ConnectWallet({ onConnected }) {
  const { address, isConnected, connect, disconnect } = useWallet();

  const handleConnect = async () => {
    const walletAddress = await connect();
    if (walletAddress && onConnected) {
      onConnected(walletAddress);
    }
  };

  const truncateAddress = (addr) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 rounded-lg">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-gray-300 text-sm">
          {truncateAddress(address)}
        </span>
        <button
          onClick={disconnect}
          className="px-3 py-1 bg-gray-700 text-gray-400 rounded text-xs hover:bg-gray-600"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 flex items-center gap-2"
    >
      🦊 Connect MetaMask
    </button>
  );
}