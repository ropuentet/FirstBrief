import { Router, type IRouter } from "express";
import healthRouter from "./health";
import guardianRouter from "./guardian";
import whyItMattersRouter from "./why-it-matters";
import sentimentRouter from "./sentiment";
import articleOutlineRouter from "./article-outline";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guardianRouter);
router.use(whyItMattersRouter);
router.use(sentimentRouter);
router.use(articleOutlineRouter);

export default router;