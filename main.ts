import { PublicKey } from "@solana/web3.js";
require("dotenv").config();
const moment = require("moment");

const SolanaBot = require("./modules/bot");

const main = async () => {
    const privateKey = process.env.KEY;

    const config = {
        live: true, // turn live trading on and off
        snipeAmount: 0.025, // %
        percentAddedRequirement: 0.9,
        maxTrades: 2,
        profitGoal: 0.2, // %
        moonBag: 0, // %
        stopLoss: 0.5, // %
        tradeTimeLimit: 2, // minutes
        lowerLiquidityBound: 2000, // USD
        upperLiquidityBound: 20000, // USD
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

    // let durations: any[] = [];

    // solanaBot.allPairs.forEach((pair: any) => {
    //     if (pair.liquidityAddedTime && pair.liquidityRemovedTime) {
    //         let added = moment(pair.liquidityAddedTime);
    //         let removed = moment(pair.liquidityRemovedTime);

    //         let duration = removed.diff(added, "minutes");
    //         console.log(
    //             `${pair.tokenInfo.symbol} added: ${added}, removed: ${removed}, duration: ${duration}`
    //         );
    //         if (duration < 10) durations.push(duration);
    //     }
    // });
    // let sum = durations.reduce(function (total, currentValue) {
    //     return total + currentValue;
    // }, 0);

    // let avg = sum / durations.length;
    // console.log(`avg duration: ${avg}`);

    // await solanaBot.getPoolInfo(targetPool);
    // await solanaBot.lookForRemoveLiquidity(targetPool);

    // await solanaBot.monitorPairForPriceChange(targetPool, 5, 5, 5);
    // await solanaBot.buyToken(targetPool, 0.01);
    // await solanaBot.monitorPairToSell(targetPool, 10);
    // await new Promise((resolve) => setTimeout(resolve, 5000));

    // await solanaBot.sellToken(targetPool);
};

main();
