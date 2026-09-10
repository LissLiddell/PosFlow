ALTER TABLE "Register"
ADD COLUMN "supervisorCanManageBundles" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "supervisorCanApproveClosures" BOOLEAN NOT NULL DEFAULT true;
