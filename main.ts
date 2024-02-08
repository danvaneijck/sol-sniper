import { PublicKey } from "@solana/web3.js";
require("dotenv").config();
const moment = require("moment");

const SolanaBot = require("./modules/bot");

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        live: false, // turn live trading on and off
        snipeAmount: 0.01, // %
        percentAddedRequirement: 0.9,
        maxTrades: 2,
        profitGoal: 0.25, // %
        moonBag: 0, // %
        stopLoss: 0.5, // %
        tradeTimeLimit: 2, // minutes
        lowerLiquidityBound: 1000, // USD
        upperLiquidityBound: 60000, // USD
        slippage: 10, // %
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();
    solanaBot.startMonitoringBasePair(10);

    const openBookAddress = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
    await solanaBot.scanForNewPairs(openBookAddress);

    const targetPool = new PublicKey(
        "6WtzqetpC943GPoYmLVMjvgGeKDQc2o5aGBGwRRz3GeW"
    );

    // await solanaBot.getPoolInfo(targetPool);
    // await solanaBot.lookForRemoveLiquidity(targetPool);

    // await solanaBot.monitorPairForPriceChange(targetPool, 5, 5, 5);
    // await solanaBot.buyToken(targetPool, 0.01);
    // await solanaBot.monitorPairToSell(targetPool, 10);
    // await new Promise((resolve) => setTimeout(resolve, 5000));

    // await solanaBot.sellToken(targetPool);
};

main();
