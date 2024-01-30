import { PublicKey } from "@solana/web3.js";
require("dotenv").config();

const SolanaBot = require("./modules/bot");

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        live: false, // turn live trading on and off
        snipeAmount: 0.05, // %
        maxTrades: 1,
        profitGoalPercent: 0.1, // %
        moonBagPercent: 0, // %
        stopLoss: 0.6, // %
        tradeTimeLimit: 5, // minutes
        lowerLiquidityBound: 400, // USD
        upperLiquidityBound: 15000, // USD
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();
    solanaBot.startMonitoringBasePair(10);

    const openBookAddress = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
    await solanaBot.scanForNewPairs(openBookAddress);

    const targetPool = new PublicKey(
        "AjpLQGsXxMBCvG3dmRuJWWUP4ysQExcRVmeFdnjFBEDu"
    );

    // await solanaBot.monitorPairForPriceChange(targetPool, 5, 5, 5);

    // await solanaBot.buyToken(targetPool, 0.01);
    // await solanaBot.monitorPairToSell(targetPool, 10);
    // await new Promise((resolve) => setTimeout(resolve, 5000));

    // await solanaBot.sellToken(targetPool);
};

main();
