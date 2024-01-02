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
        console.log(`loaded wallet ${this.publicKey}`);
        this.monitorNewPairs = false;
        this.knownIds = new Set();

        this.connection = new Connection(
            "https://api.mainnet-beta.solana.com",
            "confirmed"
        );
    }

    async init() {
        await this.getTokenPrices();
        this.baseAssetPrice = this.tokenPrices[this.baseAsset];
        console.log(`Solana price: $${this.baseAssetPrice.toFixed(2)}`);
        this.allPairs = await this.loadFromFile("allPairs.json");
        if (this.allPairs) {
            console.log(`official pairs: ${this.allPairs.official.length}`);
            console.log(`unofficial pairs: ${this.allPairs.unOfficial.length}`);

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

    setMonitorNewPairs(monitor: boolean) {
        this.monitorNewPairs = monitor;
        if (monitor) {
            // this.sendMessageToDiscord("Monitoring for new pairs");
            this.newPairsLoop();
        }
    }

    async newPairsLoop() {
        console.log(`new pairs loop: ${this.monitorNewPairs}`);
        while (this.monitorNewPairs) {
            await this.getAllPairs();
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
            console.log("updated all pairs");

            if (newObjects.length > 0) {
                console.log("New objects found:", newObjects.length);

                newObjects.forEach(async (pair: { id: any }) => {
                    let info = await this.getPoolInfo(pair.id);

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

                    const liquidity = this.baseAssetPrice * quote * 2;

                    console.log(
                        `${moment().format(
                            "hh:mm:ss"
                        )} https://dexscreener.com/solana/${
                            pair.id
                        }, base: ${base}, quote: ${quote}, liquidity: $${liquidity.toFixed(
                            2
                        )}`
                    );
                });
            } else {
                console.log("No new pairs found");
            }

            const durationInMilliseconds = endTime[0] * 1000 + endTime[1] / 1e6;
            console.log(`updated all pairs in ${durationInMilliseconds} ms`);
            return this.allPairs;
        } catch (error) {
            console.error("Error fetching data:", error);
            this.monitorNewPairs = false;
        }
    }

    async getTokenPrices() {
        const { data: tokenPrices } = await axios.get(
            "https://api.raydium.io/v2/main/price"
        );
        this.tokenPrices = tokenPrices;
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

        // const baseDecimal = 10 ** poolState.baseDecimal.toNumber();
        // const quoteDecimal = 10 ** poolState.quoteDecimal.toNumber();

        // const baseTokenAmount = await this.connection.getTokenAccountBalance(
        //     poolState.baseVault
        // );
        // const quoteTokenAmount = await this.connection.getTokenAccountBalance(
        //     poolState.quoteVault
        // );

        // const basePnl = poolState.baseNeedTakePnl.toNumber() / baseDecimal;
        // const quotePnl = poolState.quoteNeedTakePnl.toNumber() / quoteDecimal;

        // const base = (baseTokenAmount.value?.uiAmount || 0) - basePnl;
        // const quote = (quoteTokenAmount.value?.uiAmount || 0) - quotePnl;

        // const denominator = new BN(10).pow(poolState.baseDecimal);

        // console.log(
        //     "pool info:",
        //     "\npool total base: " + base,
        //     "\npool total quote: " + quote,
        //     "\nbase vault balance: " + baseTokenAmount.value.uiAmount,
        //     "\nquote vault balance: " + quoteTokenAmount.value.uiAmount,
        //     "\nbase token decimals: " + poolState.baseDecimal.toNumber(),
        //     "\nquote token decimals: " + poolState.quoteDecimal.toNumber(),
        //     "\ntotal lp: " + poolState.lpReserve.div(denominator).toString()
        // );
        return poolState;
    }

    buyToken(pair: any, amount: any) {
        console.log(`Buying ${amount} tokens from pair: ${pair}`);
    }

    sellToken(pair: any, amount: any) {
        console.log(`Selling ${amount} tokens from pair: ${pair}`);
    }
}

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        snipeAmount: 0.01,
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();

    // solanaBot.getPoolInfo("Edsg5K3G7UcaPGK2yJWMooKxJ3L55peuZdM3h2hyU43T");
    solanaBot.setMonitorNewPairs(true);
};

main();
