import { Router, type IRouter } from "express";
import healthRouter from "./health";
import guardianRouter from "./guardian";
import whyItMattersRouter from "./why-it-matters";

const router: IRouter = Router();

router.use(healthRouter);
router.use(guardianRouter);
router.use(whyItMattersRouter);

export default router;