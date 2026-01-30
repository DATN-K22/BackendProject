-- CreateTable
CREATE TABLE "iam_service"."RefreshToken" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "jti" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replaced_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "iam_service"."RefreshToken"("jti");

-- AddForeignKey
ALTER TABLE "iam_service"."RefreshToken" ADD CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam_service"."Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
