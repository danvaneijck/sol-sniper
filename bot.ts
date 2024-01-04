require("dotenv").config();
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const {
    TokenAccount,
    SPL_ACCOUNT_LAYOUT,
    LIQUIDITY_STATE_LAYOUT_V4,
} = require("@raydium-io/raydium-sdk");
const BN = require("bn.js");
const bs58 = require("bs58");
const axios = require("axios");
const fs = require("fs/promises");
const moment = require("moment");
const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
const { SlashCommandBuilder } = require("@discordjs/builders");

import Colors = require("colors.ts");
Colors.enable();

class SolanaBot {
    privateKey: any;
    config: any;
    pricePair: string;
    keyPair: typeof Keypair;
    publicKey: typeof PublicKey;
    baseAsset: string;
    baseAssetPrice: any;
    tokenPrices: any;
    allPairs: any;
    monitorNewPairs: boolean;
    knownIds: Set<unknown>;
    connection: any;
    discordToken: string | undefined;
    discordChannelId: string | undefined;
    discordClient: any;
    discordTag: string;
    monitoringBasePairIntervalId: undefined | NodeJS.Timeout;

    constructor(
        privateKey: string | undefined,
        config: { snipeAmount: number }
    ) {
        this.privateKey = privateKey;
        this.config = config;
        this.pricePair = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
        this.baseAsset = "So11111111111111111111111111111111111111112";

        this.keyPair = Keypair.fromSecretKey(bs58.decode(this.privateKey));
        this.publicKey = this.keyPair.publicKey;
        console.log(`loaded wallet ${this.publicKey}`.bg_green);
        this.monitorNewPairs = false;
        this.knownIds = new Set();

        this.connection = new Connection(
            "https://api.mainnet-beta.solana.com",
            "confirmed",
            {
                maxTransactionVersion: 0,
            }
        );

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
        this.allPairs = await this.loadFromFile("allPairs.json");
        if (this.allPairs) {
            console.log(
                `official pairs: ${this.allPairs.official.length}`.bg_cyan
            );
            console.log(
                `unofficial pairs: ${this.allPairs.unOfficial.length}`.bg_cyan
            );

            this.knownIds = new Set(
                this.allPairs.unOfficial.map((obj: { id: any }) => obj.id)
            );
        }
    }

    async loadFromFile(filename: string) {
        try {
            const data = await fs.readFile(filename, "utf-8");
            const jsonData = JSON.parse(data);
            return jsonData;
        } catch (error) {
            console.error("Error loading data from file:", error);
            return null;
        }
    }

    async saveToFile(data: string, filename: string) {
        try {
            await fs.writeFile(
                filename,
                JSON.stringify(data, null, 2),
                "utf-8"
            );
        } catch (error) {
            console.error("Error saving data to file:", error);
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
        console.log(`Solana price: $${this.baseAssetPrice.toFixed(2)}`.bg_cyan);

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

    setMonitorNewPairs(monitor: boolean) {
        this.monitorNewPairs = monitor;
        if (monitor) {
            // this.sendMessageToDiscord("Monitoring for new pairs");
            this.newPairsLoop();
        }
    }

    async newPairsLoop() {
        while (this.monitorNewPairs) {
            this.allPairs = await this.getAllPairs();
            await new Promise((resolve) => setTimeout(resolve, 20000));
        }
    }

    async getAllPairs() {
        const startTime = process.hrtime();

        try {
            const { data: allPairs } = await axios.get(
                "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"
            );

            const endTime = process.hrtime(startTime);

            const newObjects = allPairs.unOfficial.filter(
                (obj: { id: number }) => !this.knownIds.has(obj.id)
            );
            this.knownIds = new Set(
                allPairs.unOfficial.map((obj: { id: any }) => obj.id)
            );

            await this.saveToFile(allPairs, "allPairs.json");

            if (newObjects.length > 0) {
                for (const pair of newObjects) {
                    let info = await this.getPoolInfo(pair.id);
                    // console.log(JSON.stringify(info, null, 2));

                    if (
                        info["quoteMint"].toString() !== this.baseAsset &&
                        info["baseMint"].toString() !== this.baseAsset
                    ) {
                        console.log(
                            `pair is not sol based https://dexscreener.com/solana/${pair.id}`
                                .error
                        );
                        continue;
                    }

                    const baseDecimal = 10 ** info.baseDecimal.toNumber();
                    const quoteDecimal = 10 ** info.quoteDecimal.toNumber();

                    const baseTokenAmount =
                        await this.connection.getTokenAccountBalance(
                            info.baseVault
                        );
                    const quoteTokenAmount =
                        await this.connection.getTokenAccountBalance(
                            info.quoteVault
                        );

                    const basePnl =
                        info.baseNeedTakePnl.toNumber() / baseDecimal;
                    const quotePnl =
                        info.quoteNeedTakePnl.toNumber() / quoteDecimal;

                    const base =
                        (baseTokenAmount.value?.uiAmount || 0) - basePnl;
                    const quote =
                        (quoteTokenAmount.value?.uiAmount || 0) - quotePnl;

                    let baseAssetAmount =
                        info.baseMint == this.baseAsset ? base : quote;

                    const liquidity = this.baseAssetPrice * baseAssetAmount * 2;

                    const poolOpenTime = moment.unix(
                        Number(info["poolOpenTime"])
                    );

                    const baseMintIsBaseAsset =
                        info.baseMint === this.baseAsset;

                    const price = baseMintIsBaseAsset
                        ? base / quote
                        : quote / base;

                    console.log(
                        `${moment().format(
                            "hh:mm:ss"
                        )} https://dexscreener.com/solana/${
                            pair.id
                        }\nbase: ${base}, quote: ${quote}, liquidity: $${liquidity.toFixed(
                            2
                        )}, open time: ${poolOpenTime.fromNow()}, price: ${price} SOL ($${
                            price
                                ? (price * this.baseAssetPrice).toFixed(10)
                                : 0
                        })`
                    );

                    if (
                        liquidity < this.config.upperLiquidityBound &&
                        liquidity > this.config.lowerLiquidityBound &&
                        poolOpenTime > moment().subtract(10, "minute")
                    ) {
                        await this.sendMessageToDiscord(
                            `New pair found with liquidity: $${liquidity.toFixed(
                                2
                            )}\nopen time: <t:${poolOpenTime.unix()}:R>\nprice: ${price} SOL ($${
                                price
                                    ? (price * this.baseAssetPrice).toFixed(10)
                                    : 0
                            })\nhttps://dexscreener.com/solana/${pair.id}`
                        );
                    }
                }
            }

            const durationInMilliseconds = endTime[0] * 1000 + endTime[1] / 1e6;
            console.log(
                `updated all pairs in ${durationInMilliseconds} ms`.info
            );
            return allPairs;
        } catch (error) {
            console.error("Error fetching data:", error);
            // this.monitorNewPairs = false;
        }
    }

    async getTokenPrices() {
        const { data: tokenPrices } = await axios.get(
            "https://api.raydium.io/v2/main/price"
        );
        this.tokenPrices = tokenPrices;
        await this.saveToFile(this.tokenPrices, "tokenPrices.json");
    }

    async getTokenAccounts(
        connection: typeof Connection,
        owner: typeof PublicKey
    ) {
        const tokenResp = await connection.getTokenAccountsByOwner(owner, {
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

    async getPoolInfo(poolId: string) {
        const info = await this.connection.getAccountInfo(
            new PublicKey(poolId)
        );
        if (!info) return;

        const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);
        return poolState;
    }

    buyToken(pair: any, amount: any) {
        console.log(`Buying ${amount} tokens from pair: ${pair}`);
    }

    sellToken(pair: any, amount: any) {
        console.log(`Selling ${amount} tokens from pair: ${pair}`);
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
        try {
            const transaction = await this.connection.getTransaction(signature);

            console.log(
                "Decoded Transaction:",
                JSON.stringify(transaction, null, 2)
            );
        } catch (error) {
            console.error("Error decoding transaction");
        }
    }
}

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        snipeAmount: 0.01,
        lowerLiquidityBound: 1000,
        upperLiquidityBound: 20000,
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();

    solanaBot.startMonitoringBasePair(30);
    solanaBot.setMonitorNewPairs(true);

    const raydiumLiquidityPoolV4 =
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

    solanaBot.querySignaturesForAddress(raydiumLiquidityPoolV4);
};

main();
