import { Router, type IRouter } from "express";
import healthRouter from "./health";
import guardianRouter from "./guardian";
import whyItMattersRouter from "./why-it-matters";
import sentimentRouter from "./sentiment";
import articleOutlineRouter from "./article-outline";
import marketContextRouter from "./market-context";
import marketCompanyRouter from "./market-company";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guardianRouter);
router.use(whyItMattersRouter);
router.use(sentimentRouter);
router.use(articleOutlineRouter);
router.use(marketContextRouter);
router.use(marketCompanyRouter);

export default router;