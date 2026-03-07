// Receipt-domain facade. Re-export only; no behavior changes.
export * from "../../base-network";
export * from "../../receipt";
export {
  RECEIPT_EIP712_NAME,
  RECEIPT_EIP712_VERSION,
  mintAuthorizationTypes,
  mintAuthorizationTypesForRpc,
  type MintAuthorizationMessage,
  buildMintAuthorizationTypedData,
  buildMintAuthorizationRpcTypedData,
  receiptMintedEvent
} from "../../receipt-shared";
