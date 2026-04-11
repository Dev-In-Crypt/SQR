import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createPublicClient, createWalletClient, defineChain, formatEther, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

interface ReceiptArtifact {
  abi: Abi;
  bytecode: {
    object: string;
  };
}

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

async function main() {
  const rpcUrl = process.env.HASHKEY_TESTNET_RPC_URL?.trim() || "https://testnet.hsk.xyz";
  const chainId = Number(process.env.HASHKEY_TESTNET_CHAIN_ID || "133");
  const privateKey = mustEnv("HASHKEY_DEPLOYER_PRIVATE_KEY") as Hex;

  const chain = defineChain({
    id: chainId,
    name: "HashKey Chain Testnet",
    nativeCurrency: {
      name: "HashKey",
      symbol: "HSK",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [rpcUrl]
      }
    }
  });

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl)
  });

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    throw new Error(`Deployer ${account.address} has 0 HSK. Fund wallet before deploy.`);
  }

  console.log(`deployer=${account.address}`);
  console.log(`balance_hsk=${formatEther(balance)}`);

  const artifactPath = resolve(process.cwd(), "contracts/out/ReceiptRegistry.sol/ReceiptRegistry.json");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as ReceiptArtifact;
  const bytecode = artifact.bytecode.object.startsWith("0x")
    ? (artifact.bytecode.object as Hex)
    : (`0x${artifact.bytecode.object}` as Hex);

  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode
  });

  console.log(`deploy_tx=${deployHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (!receipt.contractAddress) {
    throw new Error("Deployment mined but contractAddress is empty");
  }

  console.log(`receipt_contract_address=${receipt.contractAddress}`);
}

void main();
