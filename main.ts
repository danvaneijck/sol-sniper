import { PublicKey } from "@solana/web3.js";
require("dotenv").config();

const SolanaBot = require("./modules/bot");

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        snipeAmount: 0.01, // %
        profitGoalPercent: 0.3, // %
        moonBagPercent: 0.1, // %
        stopLoss: 0.3, // %
        tradeTimeLimit: 5, // minutes
        lowerLiquidityBound: 2000, // USD
        upperLiquidityBound: 20000, // USD
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();
    solanaBot.startMonitoringBasePair(10);

    const openBookAddress = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
    await solanaBot.scanForNewPairs(openBookAddress);

    const targetPool = new PublicKey(
        "7iB2y1QMNMsVPsVHjH6xvJSVZGqgNUyfAQB2tWA9wFDy"
    );

    // await solanaBot.monitorPairForPriceChange(targetPool, 5, 5, 5);
    // await solanaBot.buyToken(targetPool, 0.01);
    // await solanaBot.monitorPairToSell(targetPool, 10);
    // await new Promise((resolve) => setTimeout(resolve, 5000));
    // await solanaBot.sellToken(targetPool);
};

main();
