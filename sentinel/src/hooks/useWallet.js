import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { SENTINEL_DAO_ADDRESS, SENTINEL_DAO_ABI } from "../lib/contract";
import { supabase } from "../lib/supabase";

const SEPOLIA_CHAIN_ID = "0xaa36a7";

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [signer, setSigner] = useState(null);

  const switchToSepolia = useCallback(async () => {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
      setIsCorrectNetwork(true);
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: SEPOLIA_CHAIN_ID,
              chainName: "Sepolia Testnet",
              nativeCurrency: {
                name: "Sepolia ETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
        setIsCorrectNetwork(true);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return null;
    }

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const userAddress = accounts[0];

      await switchToSepolia();

      const provider = new ethers.BrowserProvider(window.ethereum);
      const userSigner = await provider.getSigner();

      setAddress(userAddress);
      setSigner(userSigner);
      setIsConnected(true);

      // Save wallet to Supabase profile
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user) {
        await supabase
          .from("profiles")
          .update({ wallet_address: userAddress.toLowerCase() })
          .eq("id", session.session.user.id);
      }

      return userAddress;
    } catch (error) {
      console.error("Wallet connection failed:", error);
      return null;
    }
  }, [switchToSepolia]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setIsConnected(false);
  }, []);

  const getContract = useCallback(() => {
    if (!signer) return null;
    return new ethers.Contract(
      SENTINEL_DAO_ADDRESS,
      SENTINEL_DAO_ABI,
      signer
    );
  }, [signer]);

  return {
    address,
    isConnected,
    isCorrectNetwork,
    signer,
    connect,
    disconnect,
    getContract,
  };
}