import {ethers} from "ethers";
import Safe, {EthersAdapter} from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";


const cachedSafe = {};
const cachedNonce = {};

export async function init(options) {
  const {register, lifecycle, signer} = options;
  if (!register.safeWalletAddress) {
    return;
  }
  if (register.sourceSafeWalletUrl) {
    let safe;
    if (cachedSafe[lifecycle.sourceChainName]) {
      safe = cachedSafe[lifecycle.sourceChainName];
    } else {
      safe = await initSafe({
        register,
        chainRpc: lifecycle.sourceChainRpc,
        safeWalletUrl: register.sourceSafeWalletUrl,
        signer,
      });
      cachedSafe[lifecycle.sourceChainName] = safe;
    }

    options.sourceSafeSdk = safe.safeSdk;
    options.sourceSafeService = safe.safeService;
    options.sourceProvider = safe.provider;
    options.sourceNetwork = safe.network;
    options.sourceSigner = safe.wallet;
  }
  if (register.targetSafeWalletUrl) {
    let safe;
    if (cachedSafe[lifecycle.targetChainName]) {
      safe = cachedSafe[lifecycle.targetChainName];
    } else  {
      safe = await initSafe({
        register,
        chainRpc: lifecycle.targetChainRpc,
        safeWalletUrl: register.targetSafeWalletUrl,
        signer,
      });
      cachedSafe[lifecycle.targetChainName] = safe;
    }

    options.targetSafeSdk = safe.safeSdk;
    options.targetSafeService = safe.safeService;
    options.targetProvider = safe.provider;
    options.targetNetwork = safe.network;
    options.targetSigner = safe.wallet;
  }
}

async function initSafe(options) {
  const {register, chainRpc, signer, safeWalletUrl} = options;
  const provider = new ethers.JsonRpcProvider(chainRpc);
  const wallet = new ethers.Wallet(signer, provider);
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: wallet,
  });
  const safeSdk = await Safe.default.create({ethAdapter: ethAdapter, safeAddress: register.safeWalletAddress});

  const network = await provider.getNetwork();
  console.log(`init safe for chain ${network.chainId} with ${safeWalletUrl}`);
  const safeService = new SafeApiKit.default({
    chainId: network.chainId,
    txServiceUrl: safeWalletUrl,
    // txServiceUrl: 'https://httpbin.org/anything',
  });
  return {
    safeSdk,
    safeService,
    provider,
    network,
    wallet,
  };
}


export async function propose(options = {safeSdk, safeService, transactions, safeAddress, senderAddress}) {
  const {safeSdk, safeService, transactions, safeAddress, senderAddress} = options;
  const chainId = await safeSdk.getChainId();
  const remoteNonce = await safeSdk.getNonce();

  let nonce;
  if (cachedNonce[chainId]) {
    const cnonce = cachedNonce[chainId];
    nonce = cnonce > remoteNonce ? cnonce : remoteNonce;
  } else {
    nonce = remoteNonce;
  }

  const safeTransaction = await safeSdk.createTransaction({
    transactions
  });
  const safeTxHash = await safeSdk.getTransactionHash(safeTransaction);
  const senderSignature = await safeSdk.signTransaction(safeTransaction);
  const proposeTransactionProps = {
    safeAddress,
    safeTransactionData: safeTransaction.data,
    safeTxHash,
    senderAddress,
    senderSignature: senderSignature.signatures.get(senderAddress.toLowerCase()).data,
  };
  const r = await safeService.proposeTransaction(proposeTransactionProps);
  cachedNonce[chainId] = nonce + 1;
  return r;
}
