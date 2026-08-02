import { Router, type IRouter } from "express";
import healthRouter from "./health";
import guardianRouter from "./guardian";
import whyItMattersRouter from "./why-it-matters";
import sentimentRouter from "./sentiment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guardianRouter);
router.use(whyItMattersRouter);
router.use(sentimentRouter);

export default router;