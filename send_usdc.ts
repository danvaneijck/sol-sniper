const {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
} = require("@solana/web3.js");
const {
    getAssociatedTokenAddress,
    createTransferInstruction,
    getOrCreateAssociatedTokenAccount,
} = require("@solana/spl-token");

require("dotenv").config();

async function sendUSDC(
    senderSecretKey: Iterable<number>,
    recipientPublicKeyString: string,
    amount: number
) {
    const connection = new Connection(
        process.env.QUICKNODE_ENDPOINT,
        "confirmed"
    );

    const senderWallet = Keypair.fromSecretKey(new Uint8Array(senderSecretKey));
    const recipientPublicKey = new PublicKey(recipientPublicKeyString);
    const usdcMintAddress = new PublicKey(
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );

    const senderTokenAccountAddress = await getAssociatedTokenAddress(
        usdcMintAddress,
        senderWallet.publicKey
    );
    const recipientTokenAccountAddress =
        await getOrCreateAssociatedTokenAccount(
            connection,
            senderWallet,
            usdcMintAddress,
            recipientPublicKey
        );

    let attempts = 0;
    const maxAttempts = 10;
    let success = false;

    while (!success && attempts < maxAttempts) {
        try {
            attempts++;
            console.log(`Attempt ${attempts}: Sending transaction...`);

            const tx = new Transaction().add(
                createTransferInstruction(
                    senderTokenAccountAddress,
                    recipientTokenAccountAddress.address,
                    senderWallet.publicKey,
                    amount
                )
            );

            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = senderWallet.publicKey;

            const signature = await connection.sendTransaction(
                tx,
                [senderWallet],
                { skipPreflight: false }
            );
            await connection.confirmTransaction(signature, "confirmed");

            console.log(`Transaction successful with signature: ${signature}`);
            success = true;
        } catch (error) {
            console.error(
                `Transaction failed on attempt ${attempts}: ${error}`
            );
            if (attempts < maxAttempts) {
                console.log("Retrying transaction...");
                await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
            } else {
                console.error("Max attempts reached. Transaction failed.");
            }
        }
    }
}
// Example usage
// const senderSecretKey = [

// ];
// const recipientPublicKeyString = "GvCGSjPh4HuCfk6o9pTuDena58w3QqGhymgHYxEawG7m";
// const amount = 175569700;

// sendUSDC(senderSecretKey, recipientPublicKeyString, amount).catch(
//     console.error
// );
