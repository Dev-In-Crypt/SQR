import { parseAbi, parseAbiItem, type Address, type Hex } from "viem";

export const RECEIPT_EIP712_NAME = "ReceiptRegistry";
export const RECEIPT_EIP712_VERSION = "0.2.0";

export const mintAuthorizationTypes = {
  MintAuthorization: [
    { name: "reportHash", type: "bytes32" },
    { name: "contractAddress", type: "address" },
    { name: "analyzerVersionHash", type: "bytes32" },
    { name: "owner", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
} as const;

export const mintAuthorizationTypesForRpc = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" }
  ],
  MintAuthorization: mintAuthorizationTypes.MintAuthorization
} as const;

export interface MintAuthorizationMessage {
  reportHash: Hex;
  contractAddress: Address;
  analyzerVersionHash: Hex;
  owner: Address;
  nonce: bigint;
  deadline: bigint;
}

export function buildMintAuthorizationTypedData(params: {
  chainId: number;
  verifyingContract: Address;
  message: MintAuthorizationMessage;
}) {
  return {
    domain: {
      name: RECEIPT_EIP712_NAME,
      version: RECEIPT_EIP712_VERSION,
      chainId: params.chainId,
      verifyingContract: params.verifyingContract
    },
    types: mintAuthorizationTypes,
    primaryType: "MintAuthorization" as const,
    message: params.message
  };
}

export function buildMintAuthorizationRpcTypedData(params: {
  chainId: number;
  verifyingContract: Address;
  message: MintAuthorizationMessage;
}) {
  return {
    domain: {
      name: RECEIPT_EIP712_NAME,
      version: RECEIPT_EIP712_VERSION,
      chainId: params.chainId,
      verifyingContract: params.verifyingContract
    },
    types: mintAuthorizationTypesForRpc,
    primaryType: "MintAuthorization" as const,
    message: {
      ...params.message,
      nonce: params.message.nonce.toString(),
      deadline: params.message.deadline.toString()
    }
  };
}

export const receiptRegistryAbi = parseAbi([
  "function mint(bytes32 reportHash, address contractAddress, bytes32 analyzerVersionHash) returns (uint256 receiptId, bool newlyMinted)",
  "function mintWithSig(bytes32 reportHash, address contractAddress, bytes32 analyzerVersionHash, address owner, uint256 nonce, uint256 deadline, bytes signature) returns (uint256 receiptId, bool newlyMinted)",
  "function nonces(address owner) view returns (uint256)",
  "function getByHash(bytes32 reportHash) view returns (uint256 receiptId, address owner, address contractAddress, bytes32 analyzerVersionHash, uint256 timestamp)",
  "event ReceiptMinted(bytes32 indexed reportHash, address indexed contractAddress, bytes32 analyzerVersionHash, address owner, address minter, uint256 timestamp, uint256 receiptId)"
]);

export const receiptMintedEvent = parseAbiItem(
  "event ReceiptMinted(bytes32 indexed reportHash, address indexed contractAddress, bytes32 analyzerVersionHash, address owner, address minter, uint256 timestamp, uint256 receiptId)"
);
