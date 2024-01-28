import { PublicKey } from "@solana/web3.js";
require("dotenv").config();

const SolanaBot = require("./modules/bot");

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        snipeAmount: 0.01,
        profitGoal: 0.2,
        moonBag: 0.1,
        stopLoss: 0.2,
        lowerLiquidityBound: 1000,
        upperLiquidityBound: 20000,
    };

    const solanaBot = new SolanaBot(privateKey, config);

    await solanaBot.init();
    solanaBot.startMonitoringBasePair(30);

    const openBookAddress = "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX";
    await solanaBot.scanForNewPairs(openBookAddress);

    const targetPool = new PublicKey(
        "FCs2m1V4MB1L85yYKKHBckCyz5TU2xqTpnJMnqiCQA6N"
    );

    // await solanaBot.buyToken(targetPool, 0.01);
    // await new Promise((resolve) => setTimeout(resolve, 5000));
    // await solanaBot.sellToken(targetPool);
};

main();
