import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import mediaRouter from "./media";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(mediaRouter);
router.use(adminRouter);

export default router;
