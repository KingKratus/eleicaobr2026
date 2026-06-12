import { ethers } from "ethers";

/**
 * Âncora o hash do BU em blockchain EVM (Sepolia testnet) via carteira do usuário.
 * Envia uma tx self-transfer (0 ETH) com o hash do BU como calldata —
 * fica permanentemente registrado e auditável on-chain.
 */
export async function anchorHashEVM(hashHex: string): Promise<{ txHash: string; explorerUrl: string; chainId: number }> {
  if (!(window as any).ethereum) throw new Error("Nenhuma carteira EVM detectada (instale MetaMask).");
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  await provider.send("eth_requestAccounts", []);

  // Garante Sepolia (chainId 11155111)
  const net = await provider.getNetwork();
  if (net.chainId !== 11155111n) {
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
    } catch (e: any) {
      if (e.code === 4902) {
        await provider.send("wallet_addEthereumChain", [{
          chainId: "0xaa36a7",
          chainName: "Sepolia",
          nativeCurrency: { name: "SepoliaETH", symbol: "SEP", decimals: 18 },
          rpcUrls: ["https://rpc.sepolia.org"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }]);
      } else throw e;
    }
  }

  const signer = await provider.getSigner();
  const addr = await signer.getAddress();
  const clean = hashHex.startsWith("0x") ? hashHex : "0x" + hashHex;

  // Prefixo "BU26" + hash, como dados (calldata)
  const prefix = ethers.hexlify(ethers.toUtf8Bytes("BU26:"));
  const data = ethers.concat([prefix, clean]);

  const tx = await signer.sendTransaction({ to: addr, value: 0n, data });
  return {
    txHash: tx.hash,
    explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
    chainId: 11155111,
  };
}
