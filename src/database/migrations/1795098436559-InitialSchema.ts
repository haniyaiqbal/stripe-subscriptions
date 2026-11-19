import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795098436559 implements MigrationInterface {
  name = 'InitialSchema1795098436559';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "stripe_events" (
                "id" character varying(255) NOT NULL,
                "type" character varying(128) NOT NULL,
                "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_d3247bd5fc3f66b6982bbcdd897" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "subscriptions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "stripe_subscription_id" character varying(255) NOT NULL,
                "plan" character varying(32) NOT NULL,
                "status" character varying(32) NOT NULL,
                "current_period_end" TIMESTAMP WITH TIME ZONE NOT NULL,
                "cancel_at_period_end" boolean NOT NULL DEFAULT false,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "REL_d0a95ef8a28188364c546eb65c" UNIQUE ("user_id"),
                CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d0a95ef8a28188364c546eb65c" ON "subscriptions" ("user_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_3a2d09d943f39912a01831a927" ON "subscriptions" ("stripe_subscription_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying(320) NOT NULL,
                "password_hash" text NOT NULL,
                "role" character varying(16) NOT NULL DEFAULT 'user',
                "stripe_customer_id" character varying(255),
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_5ffbe395603641c29e8ce9b4c9" ON "users" ("stripe_customer_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "projects" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "name" character varying(120) NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_bd55b203eb9f92b0c839038001" ON "projects" ("user_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "subscriptions"
            ADD CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "projects"
            ADD CONSTRAINT "FK_bd55b203eb9f92b0c8390380010" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "projects" DROP CONSTRAINT "FK_bd55b203eb9f92b0c8390380010"
        `);
    await queryRunner.query(`
            ALTER TABLE "subscriptions" DROP CONSTRAINT "FK_d0a95ef8a28188364c546eb65c1"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_bd55b203eb9f92b0c839038001"
        `);
    await queryRunner.query(`
            DROP TABLE "projects"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5ffbe395603641c29e8ce9b4c9"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3a2d09d943f39912a01831a927"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d0a95ef8a28188364c546eb65c"
        `);
    await queryRunner.query(`
            DROP TABLE "subscriptions"
        `);
    await queryRunner.query(`
            DROP TABLE "stripe_events"
        `);
  }
}
