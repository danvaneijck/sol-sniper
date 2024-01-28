require("dotenv").config();
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const {
    TokenAccount,
    SPL_ACCOUNT_LAYOUT,
    LIQUIDITY_STATE_LAYOUT_V4,
    Liquidity,
    jsonInfo2PoolKeys,
    LiquidityPoolKeys,
    Percent,
    Token,
    TokenAmount,
} = require("@raydium-io/raydium-sdk");
const BN = require("bn.js");
const bs58 = require("bs58");
const axios = require("axios");
const fs = require("fs/promises");
const moment = require("moment");
const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");
import Colors = require("colors.ts");
import { buildAndSendTx, getWalletTokenAccount } from "./utils";
Colors.enable();
import assert from "assert";
import { formatAmmKeysById } from "./formatAmmKeysById";
import { makeTxVersion } from "../config";
const schedule = require("node-schedule");
const path = require("path");

type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;

type SwapTxInput = {
    outputToken: typeof Token;
    targetPool: string;
    inputTokenAmount: typeof TokenAmount;
    slippage: typeof Percent;
};

type Position = {
    pairContract: string;
    balance: string;
    amountIn: string;
    tokenContract: string;
    timeBought: typeof moment;
    profit: string;
    isMoonBag: boolean;
};

class SolanaBot {
    privateKey: any;
    config: any;
    pricePair: string;
    wallet: typeof Keypair;
    publicKey: typeof PublicKey;
    baseAsset: string;
    baseAssetPrice: any;
    tokenPrices: any;
    positions: Map<unknown, Position>;
    allPairs: Map<unknown, unknown>;
    connection: any;
    discordToken: string | undefined;
    discordChannelId: string | undefined;
    discordClient: any;
    discordTag: string;
    monitoringBasePairIntervalId: undefined | NodeJS.Timeout;
    raydiumLiquidityProgram: string;
    walletTokenAccounts: any;

    constructor(
        privateKey: string | undefined,
        config: { snipeAmount: number }
    ) {
        this.privateKey = privateKey;
        this.config = config;
        this.pricePair = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
        this.baseAsset = "So11111111111111111111111111111111111111112";

        this.wallet = Keypair.fromSecretKey(bs58.decode(this.privateKey));
        this.publicKey = new PublicKey(this.wallet.publicKey);
        console.log(`loaded wallet ${this.publicKey.toBase58()}`.bg_green);

        this.positions = new Map();
        this.allPairs = new Map();

        this.raydiumLiquidityProgram =
            "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

        this.connection = new Connection(
            "https://api.mainnet-beta.solana.com",
            {
                commitment: "confirmed",
                wsEndpoint: "wss://api.mainnet-beta.solana.com/",
            }
        );

        // this.connection = new Connection(
        //     "https://few-bold-research.solana-mainnet.quiknode.pro/b90a308ae6be66b55f0b40108028edfaecf39145/",
        //     {
        //         commitment: "confirmed",
        //         wsEndpoint:
        //             "wss://few-bold-research.solana-mainnet.quiknode.pro/b90a308ae6be66b55f0b40108028edfaecf39145/",
        //     }
        // );

        this.discordToken = process.env.DISCORD_TOKEN;
        this.discordChannelId = process.env.DISCORD_CHANNEL;

        this.discordClient = new Client({
            intents: [GatewayIntentBits.Guilds],
        });
        this.discordClient.login(this.discordToken);

        this.discordTag = `<@352761566401265664>`;
        this.discordClient.on("ready", () => {
            console.log(`Logged in as ${this.discordClient.user.tag}!`);
            this.discordClient.guilds.cache.forEach(
                (guild: { commands: { create: (arg0: any) => void } }) => {
                    guild.commands.create(
                        new SlashCommandBuilder()
                            .setName("get_positions")
                            .setDescription(
                                "Get portfolio positions for a wallet address"
                            )
                    );
                }
            );
            console.log("set up discord slash commands");
        });

        this.monitoringBasePairIntervalId = undefined;
    }

    async init() {
        this.walletTokenAccounts = await getWalletTokenAccount(
            this.connection,
            this.wallet.publicKey
        );
        await this.loadFromFile();
    }

    async loadFromFile(): Promise<void> {
        try {
            this.allPairs = await this.loadMapFromFile<Position>(
                "pairs.json",
                "contractAddr"
            );
            this.positions = await this.loadMapFromFile<Position>(
                "positions.json",
                "pairContract"
            );
        } catch (error) {
            console.error("Error loading data from files:", error);
        }
    }

    async loadMapFromFile<T>(
        filename: string,
        keyProperty: string | number
    ): Promise<Map<string | number, T>> {
        const pairs = await this.readDataFromFile(filename);
        return new Map(
            pairs.map((item: { [x: string]: any }) => [
                item[keyProperty],
                item as T,
            ])
        );
    }

    async readDataFromFile(filename: string): Promise<any[]> {
        const filePath = path.resolve(__dirname, "..", "data", filename);
        try {
            const data = await fs.readFile(filePath, "utf-8");
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    async loadSetFromFile(filename: any) {
        const items = await this.readDataFromFile(filename);
        return new Set(items);
    }

    async saveToFile() {
        try {
            await this.saveDataToFile(
                "pairs.json",
                Array.from(this.allPairs.values())
            );
            await this.saveDataToFile(
                "positions.json",
                Array.from(this.positions.values())
            );
        } catch (error) {
            console.error("Error saving data to files:", error);
        }
    }

    async saveDataToFile(filename: string, data: any[]) {
        const filePath = path.resolve(__dirname, "..", "data", filename);

        try {
            await fs.writeFile(
                filePath,
                JSON.stringify(data, null, 2),
                "utf-8"
            );
        } catch (error) {
            console.error(`Error saving ${filename} to file:`, error);
        }
    }

    async sendMessageToDiscord(message: string) {
        if (!this.discordClient || !this.discordChannelId) {
            console.error(
                "Discord client or channel information not available."
            );
            return;
        }

        const channel = this.discordClient.channels.cache.get(
            this.discordChannelId
        );
        if (!channel) {
            console.error("Discord channel not found.");
            return;
        }

        try {
            await channel.send(message);
        } catch (error) {
            console.error("Error sending message to Discord channel:", error);
        }
    }

    async updateBaseAssetPrice() {
        await this.getTokenPrices();
        this.baseAssetPrice = this.tokenPrices[this.baseAsset];

        if (this.discordClient && this.discordClient.user) {
            const activityText = `SOL: $${this.baseAssetPrice.toFixed(2)}`;
            this.discordClient.user.setActivity(activityText, {
                type: ActivityType.Watching,
            });
        } else {
            console.log("cannot set disc activity");
        }
    }

    startMonitoringBasePair(intervalInSeconds: number) {
        console.log("Base Asset monitoring started.");
        this.monitoringBasePairIntervalId = setInterval(async () => {
            await this.updateBaseAssetPrice();
        }, intervalInSeconds * 1000);
    }

    stopMonitoringBasePair() {
        clearInterval(this.monitoringBasePairIntervalId);
        console.log("Base Asset monitoring stopped.");
    }

    async getTokenPrices() {
        const { data: tokenPrices } = await axios.get(
            "https://api.raydium.io/v2/main/price"
        );
        this.tokenPrices = tokenPrices;
        await this.saveToFile();
    }

    async getTokenAccounts(owner: typeof PublicKey) {
        const tokenResp = await this.connection.getTokenAccountsByOwner(owner, {
            programId: TOKEN_PROGRAM_ID,
        });

        const accounts: (typeof TokenAccount)[] = [];
        for (const { pubkey, account } of tokenResp.value) {
            accounts.push({
                pubkey,
                accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data),
                programId: TOKEN_PROGRAM_ID,
            });
        }

        return accounts;
    }

    async getPoolInfo(poolId: typeof PublicKey) {
        const info = await this.connection.getAccountInfo(poolId);
        if (!info) return;

        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
        return poolState;
    }

    async checkConfirmation(txSignature: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const subscriptionId = this.connection.onSignature(
                txSignature,
                async (result: { err: null }, context: any) => {
                    console.log("Transaction signature result:", result);
                    if (result.err === null) {
                        console.log("Transaction confirmed!");
                        // this.connection.removeSignatureListener(subscriptionId);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                },
                "confirmed"
            );

            this.connection
                .getSignatureStatuses([txSignature])
                .then((status: any) => {
                    const signatureStatus = status.value[0];
                    if (signatureStatus?.confirmations > 0) {
                        console.log("Transaction already confirmed!");
                        this.connection.removeSignatureListener(subscriptionId);
                        resolve(true);
                    }
                })
                .catch((error: any) => {
                    console.log(error);
                    reject(error);
                });
        });
    }

    async swap(input: SwapTxInput) {
        const targetPoolInfo = await formatAmmKeysById(
            this.connection,
            input.targetPool
        );
        assert(targetPoolInfo, "cannot find the target pool");
        const poolKeys = jsonInfo2PoolKeys(
            targetPoolInfo
        ) as typeof LiquidityPoolKeys;

        let { amountOut, minAmountOut } = Liquidity.computeAmountOut({
            poolKeys: poolKeys,
            poolInfo: await Liquidity.fetchInfo({
                connection: this.connection,
                poolKeys,
            }),
            amountIn: input.inputTokenAmount,
            currencyOut: input.outputToken,
            slippage: input.slippage,
        });

        if (amountOut.numerator <= 0 || minAmountOut.numerator <= 0) {
            console.log(`amount out is 0, setting to min amount out`);
            amountOut.numerator = new BN(1, 9);
            minAmountOut.numerator = new BN(1, 9);
        }

        const { innerTransactions } = await Liquidity.makeSwapInstructionSimple(
            {
                connection: this.connection,
                poolKeys,
                userKeys: {
                    tokenAccounts: this.walletTokenAccounts,
                    owner: this.wallet.publicKey,
                },
                amountIn: input.inputTokenAmount,
                amountOut: minAmountOut,
                fixedSide: "in",
                makeTxVersion,
            }
        );

        try {
            return {
                txids: await buildAndSendTx(
                    this.connection,
                    this.wallet,
                    innerTransactions
                ),
            };
        } catch (e) {}
        return false;
    }

    async buyToken(pair: typeof PublicKey, amount: number) {
        console.log(
            `attempt buy ${amount} SOL from pair ${pair.toBase58()}`.bg_cyan
        );
        const pairInstance = await this.getPoolInfo(pair);

        const output =
            pairInstance.baseMint == this.baseAsset
                ? pairInstance.quoteMint
                : pairInstance.baseMint;
        const input =
            pairInstance.baseMint == this.baseAsset
                ? pairInstance.baseMint
                : pairInstance.quoteMint;
        const inputDecimals =
            pairInstance.baseMint == this.baseAsset
                ? parseInt(pairInstance.baseDecimal)
                : parseInt(pairInstance.quoteDecimal);
        const outputDecimals =
            pairInstance.baseMint == this.baseAsset
                ? parseInt(pairInstance.quoteDecimal)
                : parseInt(pairInstance.baseDecimal);

        const inputToken = new Token(
            TOKEN_PROGRAM_ID,
            new PublicKey(input),
            inputDecimals,
            "WSOL",
            "WSOL"
        );
        const outputToken = new Token(
            TOKEN_PROGRAM_ID,
            new PublicKey(output),
            outputDecimals
        );

        const inputTokenAmount = new TokenAmount(
            inputToken,
            amount * Math.pow(10, inputDecimals)
        );
        let slippage = new Percent(20, 100);

        for (let i = 0; i < 3; i++) {
            const result = await this.swap({
                outputToken,
                targetPool: pair.toBase58(),
                inputTokenAmount,
                slippage,
            });

            if (!result) {
                console.log("swap tx fail");
            } else {
                if (result.txids.length > 0) {
                    const tx = result.txids[0];
                    const confirmed = await this.checkConfirmation(tx);
                    if (confirmed === true) {
                        console.log("tx success");

                        let txInfo = await this.decodeSignature(tx);
                        let preBalance = txInfo.meta.preTokenBalances.find(
                            (x: { mint: any; owner: any }) =>
                                x.mint == output &&
                                x.owner == this.publicKey.toBase58()
                        );
                        let postBalance = txInfo.meta.postTokenBalances.find(
                            (x: { mint: any; owner: any }) =>
                                x.mint == output &&
                                x.owner == this.publicKey.toBase58()
                        );
                        let amountBought =
                            parseInt(postBalance.uiTokenAmount.amount) -
                            parseInt(
                                preBalance
                                    ? preBalance.uiTokenAmount.amount
                                    : "0"
                            );

                        console.log(
                            `amount bought: ${(
                                amountBought /
                                Math.pow(10, postBalance.uiTokenAmount.decimals)
                            ).toFixed(5)}`
                        );

                        let profit = 0;
                        const position = this.positions.get(pair.toBase58());
                        if (position) {
                            profit = Number(position.profit) || 0;
                        }

                        let basePreBalance = txInfo.meta.preBalances[0];
                        let basePostBalance = txInfo.meta.postBalances[0];

                        let baseAmountLost =
                            parseInt(basePreBalance) -
                            parseInt(basePostBalance);

                        this.positions.set(pair.toBase58(), {
                            pairContract: pair.toBase58(),
                            balance: postBalance.uiTokenAmount.amount,
                            amountIn: baseAmountLost.toString(),
                            tokenContract: output,
                            timeBought: moment(),
                            profit: profit.toString(),
                            isMoonBag: false,
                        });

                        this.sendMessageToDiscord(
                            `:gun: Buy success https://solscan.io/tx/${tx} ${this.discordTag}\n` +
                                `https://dexscreener.com/solana/${pair.toBase58()}?maker=${this.publicKey.toBase58()}\n` +
                                `amount bought: ${(
                                    amountBought /
                                    Math.pow(
                                        10,
                                        postBalance.uiTokenAmount.decimals
                                    )
                                ).toFixed(5)}\n` +
                                `total balance: ${postBalance.uiTokenAmount.uiAmount}\n` +
                                `SOL amount in: ${
                                    baseAmountLost / Math.pow(10, 9)
                                }`
                        );
                        return true;
                    } else {
                        console.log("tx fail");
                    }
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
            slippage = new Percent(
                Number(slippage.numerator) + 5,
                Number(slippage.denominator)
            );
        }
        return false;
    }

    async sellToken(pair: typeof PublicKey) {
        console.log(`attempt sell pair ${pair.toBase58()}`.bg_cyan);

        const pairInstance = await this.getPoolInfo(pair);

        const baseMint =
            pairInstance.baseMint == this.baseAsset
                ? pairInstance.baseMint
                : pairInstance.quoteMint;
        const nonBaseMint =
            pairInstance.baseMint == this.baseAsset
                ? pairInstance.quoteMint
                : pairInstance.baseMint;

        const nonBaseDecimals =
            pairInstance.baseMint == this.baseAsset
                ? parseInt(pairInstance.quoteDecimal)
                : parseInt(pairInstance.baseDecimal);

        const nonBaseToken = new Token(
            TOKEN_PROGRAM_ID,
            new PublicKey(nonBaseMint),
            nonBaseDecimals,
            "MEME",
            "MEME"
        );

        const nonBaseBalance = await (
            await this.getTokenAccounts(this.wallet.publicKey)
        ).find((x) => x.accountInfo.mint == nonBaseMint.toBase58());
        if (!nonBaseBalance) {
            console.log("could not find balance");
            return;
        }
        let amount = parseInt(nonBaseBalance.accountInfo.amount);

        if (amount == 0 || !amount) {
            return;
        }

        const nonBaseTokenAmount = new TokenAmount(nonBaseToken, amount);

        const outputToken = new Token(
            TOKEN_PROGRAM_ID,
            new PublicKey(baseMint),
            9,
            "WSOL",
            "WSOL"
        );

        let slippage = new Percent(10, 100);

        for (let i = 0; i < 5; i++) {
            const result = await this.swap({
                outputToken,
                targetPool: pair.toBase58(),
                inputTokenAmount: nonBaseTokenAmount,
                slippage,
            });

            if (!result) {
                console.log("swap tx fail");
            } else {
                if (result.txids.length > 0) {
                    const tx = result.txids[0];
                    const confirmed = await this.checkConfirmation(tx);
                    if (confirmed === true) {
                        console.log("Swap transaction success");
                        let txInfo = await this.decodeSignature(tx);
                        let preBalance = txInfo.meta.preTokenBalances.find(
                            (x: { mint: any; owner: any }) =>
                                x.mint == nonBaseMint &&
                                x.owner == this.publicKey.toBase58()
                        );
                        let postBalance = txInfo.meta.postTokenBalances.find(
                            (x: { mint: any; owner: any }) =>
                                x.mint == nonBaseMint &&
                                x.owner == this.publicKey.toBase58()
                        );
                        let amountSold =
                            parseInt(preBalance.uiTokenAmount.amount) -
                            parseInt(postBalance.uiTokenAmount.amount);

                        let basePreBalance = txInfo.meta.preBalances[0];
                        let basePostBalance = txInfo.meta.postBalances[0];

                        let baseAmountGained =
                            parseInt(basePostBalance) -
                            parseInt(basePreBalance);

                        console.log(
                            basePostBalance,
                            basePreBalance,
                            baseAmountGained
                        );

                        let position = this.positions.get(pair.toBase58());
                        console.log(position);

                        let profit =
                            baseAmountGained -
                            ((Number(position?.amountIn) || 0) +
                                (Number(position?.profit) || 0));

                        let updatedBalance =
                            Number(position?.balance || 0) - Number(amount);
                        let updatedAmountIn =
                            Number(position?.amountIn || 0) -
                            Number(baseAmountGained);
                        if (updatedAmountIn < 0) {
                            updatedAmountIn = 0;
                        }

                        this.positions.set(pair.toBase58(), {
                            pairContract: position?.pairContract || "",
                            tokenContract: position?.tokenContract || "",
                            timeBought: position?.timeBought || moment(),
                            amountIn: updatedAmountIn.toString(),
                            balance: updatedBalance.toString(),
                            profit: (
                                Number(position?.profit || 0) + Number(profit)
                            ).toString(),
                            isMoonBag:
                                updatedBalance > 0 && updatedAmountIn == 0,
                        });

                        this.sendMessageToDiscord(
                            `:moneybag: Sell success https://solscan.io/tx/${tx} ${this.discordTag}\n` +
                                `https://dexscreener.com/solana/${pair.toBase58()}?maker=${this.publicKey.toBase58()}\n` +
                                `amount sold: ${(
                                    amountSold /
                                    Math.pow(
                                        10,
                                        preBalance.uiTokenAmount.decimals
                                    )
                                ).toFixed(5)}\n` +
                                `total balance: ${
                                    postBalance.uiTokenAmount.uiAmount || 0
                                }\n` +
                                `SOL received: ${(
                                    baseAmountGained / Math.pow(10, 9)
                                ).toFixed(5)}\n` +
                                `profit: ${(profit / Math.pow(10, 9)).toFixed(
                                    5
                                )}\n`
                        );
                        return true;
                    } else {
                        console.log("Swap transaction failed");
                    }
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
            slippage = new Percent(
                Number(slippage.numerator) + 10,
                Number(slippage.denominator)
            );
        }
        return false;
    }

    async querySignaturesForAddress(address: any) {
        const publicKey = new PublicKey(address);

        try {
            const signatures =
                await this.connection.getConfirmedSignaturesForAddress2(
                    publicKey
                );
            for (const sig of signatures) {
                console.log(sig.signature.toString());
                await this.decodeSignature(sig.signature.toString());
            }
        } catch (error) {
            console.error("Error:", error);
        }
    }

    async decodeSignature(signature: any) {
        let retries = 1;
        while (retries > 0) {
            try {
                const transaction = await this.connection.getTransaction(
                    signature,
                    {
                        maxSupportedTransactionVersion: 0,
                    }
                );
                return transaction;
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.error(`Unable to decode transaction ${error}`);
                } else {
                    console.log(`Retrying... ${retries} retries left.`);
                }
            }
        }
        return null;
    }

    async handleNewLiquidity(signature: string, pair: typeof PublicKey) {
        let tx = await this.decodeSignature(signature);
        if (!tx) return;

        let addresses = tx.transaction.message.staticAccountKeys;
        let instructions = tx.transaction.message.compiledInstructions;
        if (!instructions) return;

        let ido = instructions.find(
            (x: { accountKeyIndexes: string | any[] }) =>
                x.accountKeyIndexes.length == 21
        );
        if (!ido) {
            console.log("did not find ido message logs");
            return;
        }
        let walletAddLiquidity = addresses[ido.accountKeyIndexes[17]];
        let lpDestination = addresses[ido.accountKeyIndexes[20]];
        console.log(
            `address who added liquidity: ${walletAddLiquidity.toBase58()}`
        );
        console.log(`lp holder: ${lpDestination.toBase58()}`);

        let info = await this.getPoolInfo(pair);
        const baseDecimal = 10 ** info.baseDecimal.toNumber();
        const quoteDecimal = 10 ** info.quoteDecimal.toNumber();

        const baseTokenAmount = await this.connection.getTokenAccountBalance(
            info.baseVault
        );
        const quoteTokenAmount = await this.connection.getTokenAccountBalance(
            info.quoteVault
        );

        const basePnl = info.baseNeedTakePnl.toNumber() / baseDecimal;
        const quotePnl = info.quoteNeedTakePnl.toNumber() / quoteDecimal;

        const base = (baseTokenAmount.value?.uiAmount || 0) - basePnl;
        const quote = (quoteTokenAmount.value?.uiAmount || 0) - quotePnl;

        let baseAssetAmount = info.baseMint == this.baseAsset ? base : quote;

        const liquidity = this.baseAssetPrice * baseAssetAmount * 2;

        const poolOpenTime = moment.unix(Number(info["poolOpenTime"]));

        const baseMintIsBaseAsset = info.baseMint === this.baseAsset;

        const price = baseMintIsBaseAsset ? base / quote : quote / base;

        console.log(
            `${moment().format(
                "hh:mm:ss"
            )} https://dexscreener.com/solana/${pair.toBase58()}\nbase: ${base}, quote: ${quote}, liquidity: $${liquidity.toFixed(
                2
            )}, open time: ${poolOpenTime}, price: ${price} SOL ($${
                price ? (price * this.baseAssetPrice).toFixed(10) : 0
            })`.bg_green
        );

        if (
            liquidity < this.config.upperLiquidityBound &&
            liquidity > this.config.lowerLiquidityBound &&
            poolOpenTime > moment().subtract(10, "minute")
        ) {
            this.sendMessageToDiscord(
                `:new: Pair found with liquidity: $${liquidity.toFixed(
                    2
                )}\nopen time: <t:${poolOpenTime.unix()}:R>\nprice: ${price} SOL ($${
                    price ? (price * this.baseAssetPrice).toFixed(10) : 0
                })\n` +
                    `lp adder: https://solscan.io/account/${walletAddLiquidity.toBase58()}\n` +
                    `lp holder: https://solscan.io/account/${lpDestination.toBase58()}\n` +
                    `chart: https://dexscreener.com/solana/${pair.toBase58()}\n` +
                    `add liq tx: https://solscan.io/tx/${signature}`
            );
        }
        if (
            liquidity < this.config.upperLiquidityBound &&
            liquidity > this.config.lowerLiquidityBound &&
            poolOpenTime < moment() &&
            poolOpenTime > moment().subtract(20, "seconds")
        ) {
            await this.buyToken(pair, this.config.snipeAmount);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            await this.sellToken(pair);
        } else if (
            liquidity < this.config.upperLiquidityBound &&
            liquidity > this.config.lowerLiquidityBound &&
            poolOpenTime > moment() &&
            poolOpenTime < moment().add(10, "minute")
        ) {
            console.log(
                `adding job to buy token at ${poolOpenTime}`.bg_magenta
            );
            let scheduledDate = poolOpenTime.subtract(3, "second").toDate();
            const job = schedule.scheduleJob(scheduledDate, async () => {
                console.log("trigger job");
                try {
                    await this.buyToken(pair, this.config.snipeAmount);
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                    await this.sellToken(pair);
                } catch (error) {
                    console.error("Error scheduling buy operation:", error);
                }
            });
        }
    }

    async handleNewMarket(signature: string) {
        let fullTx = await this.decodeSignature(signature);
        if (!fullTx) return;

        let time = moment.unix(Number(fullTx.blockTime));
        let tx = fullTx.transaction.message;
        let accounts = tx.accountKeys;

        let instructions = tx.instructions;
        if (!instructions || instructions.length < 5) {
            return;
        }
        let initMarket = instructions[5];

        let serumMarket = accounts[initMarket.accounts[0]];
        let serumRequestQueue = accounts[initMarket.accounts[1]];
        let serumEventQueue = accounts[initMarket.accounts[2]];
        let serumBids = accounts[initMarket.accounts[3]];
        let serumAsks = accounts[initMarket.accounts[4]];
        let baseVault = accounts[initMarket.accounts[5]];
        let quoteVault = accounts[initMarket.accounts[6]];
        let baseMint = accounts[initMarket.accounts[7]];
        let quoteMint = accounts[initMarket.accounts[8]];

        console.log(`New market: https://solscan.io/tx/${signature}`.bg_yellow);

        console.log(`serumMarket: https://solscan.io/account/${serumMarket}`);
        console.log(`baseMint: ${baseMint}`);
        console.log(`quoteMint: ${quoteMint}`);

        let marketId = new PublicKey(serumMarket);
        let programId = new PublicKey(this.raydiumLiquidityProgram);
        let poolId = Liquidity.getAssociatedId({ programId, marketId });
        console.log(`pool id: https://solscan.io/account/${poolId.toBase58()}`);
        console.log(
            `dex screener: https://dexscreener.com/solana/${poolId.toBase58()}`
        );

        if (
            quoteMint &&
            quoteMint.toString() !== this.baseAsset &&
            baseMint &&
            baseMint.toString() !== this.baseAsset
        ) {
            console.log(
                `pair is not sol based https://dexscreener.com/solana/${poolId.toBase58()}`
                    .error
            );
            return;
        }

        let info = await this.getPoolInfo(poolId);
        if (!info) {
            this.lookForAddLiquidity(poolId);
        } else {
            // console.log(JSON.stringify(info, null, 2));

            console.log(`status: ${parseInt(info.status, 16)}`);
            const poolOpenTime = moment.unix(parseInt(info.poolOpenTime, 16));
            console.log(info.poolOpenTime, poolOpenTime);

            await this.sendMessageToDiscord(
                `New market found. open time: <t:${poolOpenTime.unix()}:R>\nhttps://dexscreener.com/solana/${poolId.toBase58()}`
            );
        }
    }

    async lookForAddLiquidity(pubKey: typeof PublicKey) {
        console.log(
            `start watching ${pubKey.toBase58()} for liquidity tx`.bg_cyan
        );
        let subId: any;

        subId = this.connection.onLogs(pubKey, (result: any) => {
            if (result.err == null) {
                console.log(
                    `found tx for pair ${pubKey.toBase58()}`.bg_magenta
                );

                if (result.logs.length > 100) {
                    this.connection.removeOnLogsListener(subId);
                    console.log(
                        `stop watching ${pubKey.toBase58()} for liquidity tx`
                            .bg_red
                    );

                    this.handleNewLiquidity(result.signature, pubKey);
                }
            }
        });
    }

    async scanForNewPairs(programAddress: string) {
        const pubKey = new PublicKey(programAddress);
        this.connection.onLogs(pubKey, (logs: any) => {
            if (logs.err == null) {
                let foundCandidate = false;

                for (let i = 0; i < logs.logs.length - 1; i++) {
                    const curLog = logs.logs[i];
                    const nextLog = logs.logs[i + 1];

                    if (
                        curLog.includes(
                            "Program 11111111111111111111111111111111 success"
                        ) &&
                        nextLog.includes(
                            "Program srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX invoke [1]"
                        )
                    ) {
                        foundCandidate = true;
                        break;
                    }
                }

                if (foundCandidate) {
                    this.handleNewMarket(logs.signature);
                }
            }
        });
    }
}

module.exports = SolanaBot;
