import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";
import bs58 from "bs58";
import { treasuryKeypair } from "./solana";

export const APP_NAME = "ForeverVid";

async function getIrys() {
  const kp = treasuryKeypair();
  return Uploader(Solana)
    .withWallet(bs58.encode(kp.secretKey))
    .withRpc(process.env.RPC_URL!)
    .mainnet();
}

export async function publishToArweave(opts: {
  filePath: string;
  mimeType: string;
  title: string;
  creatorWallet: string;
  approverWallet: string;
  sha256: string;
  sizeBytes: number;
}): Promise<string> {
  const irys = await getIrys();

  const price = await irys.getPrice(opts.sizeBytes);
  const balance = await irys.getBalance();
  if (balance.isLessThan(price)) {
    await irys.fund(price.minus(balance).multipliedBy(1.1).integerValue());
  }

  const receipt = await irys.uploadFile(opts.filePath, {
    tags: [
      { name: "Content-Type", value: opts.mimeType },
      { name: "App-Name", value: APP_NAME },
      { name: "Title", value: opts.title.slice(0, 500) },
      { name: "Creator", value: opts.creatorWallet },
      { name: "Approver", value: opts.approverWallet },
      { name: "File-Sha256", value: opts.sha256 },
    ],
  });
  return receipt.id;
}
