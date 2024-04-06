import { PublicKey } from "@solana/web3.js";
require("dotenv").config();
const moment = require("moment");

const SolanaBot = require("./modules/bot");

const main = async () => {
    try {
        const privateKey = process.env.KEY;

        const config = {
            live: false, // turn live trading on and off
            snipeAmount: 0.01, // %
            percentAddedRequirement: 0.9,
            maxTrades: 2,
            profitGoal: 0.85, // %
            moonBag: 0.1, // %
            stopLoss: 0.5, // %
            tradeTimeLimit: 2000, // minutes
            lowerLiquidityBound: 1000, // USD
            upperLiquidityBound: 60000, // USD
            slippage: 10, // %
        };

        const solanaBot = new SolanaBot(privateKey, config);

        await solanaBot.init();
        solanaBot.startMonitoringBasePair(10);

        const openBookAddress = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
        await solanaBot.scanForNewPairs(openBookAddress);
        await solanaBot.sendMessageToDiscord("bot start up");
    } catch (error) {
        console.error("An error occurred:", error);
    }
};

const start = async () => {
    let shouldRestart = true;

    while (shouldRestart) {
        try {
            await main();
            shouldRestart = false;
        } catch (error) {
            console.error("An error occurred:", error);
            shouldRestart = true;
        }
    }
};

start();
