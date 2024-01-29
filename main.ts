import { PublicKey } from "@solana/web3.js";
require("dotenv").config();

const SolanaBot = require("./modules/bot");

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        snipeAmount: 0.015, // %
        profitGoalPercent: 0.15, // %
        moonBagPercent: 0, // %
        stopLoss: 0.5, // %
        tradeTimeLimit: 5, // minutes
        lowerLiquidityBound: 1000, // USD
        upperLiquidityBound: 12000, // USD
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();
    solanaBot.startMonitoringBasePair(10);

    const openBookAddress = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
    await solanaBot.scanForNewPairs(openBookAddress);

    const targetPool = new PublicKey(
        "FfK6h1FTrcQAw3G7eyUXaVNvUnBPUros4rizGEAzss6e"
    );

    // await solanaBot.monitorPairForPriceChange(targetPool, 5, 5, 5);
    // await solanaBot.buyToken(targetPool, 0.01);
    // await solanaBot.monitorPairToSell(targetPool, 10);
    // await new Promise((resolve) => setTimeout(resolve, 5000));
    await solanaBot.sellToken(targetPool);
};

main();
