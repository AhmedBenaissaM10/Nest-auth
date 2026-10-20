import type { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}
export type Customize = (builder: TestingModuleBuilder) => TestingModuleBuilder;
export async function createTestApp(
  customize: Customize = (builder) => builder,
): Promise<TestContext> {
  const moduleRef = await customize(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

// Deleting users also deletes their sessions and OAuth accounts (onDelete: Cascade)
export async function resetDatabase(prisma: PrismaService) {
  await prisma.user.deleteMany();
}
